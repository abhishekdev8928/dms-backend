import UserModel from "../models/userModel.js";
import { sendOTPEmail, sendPasswordResetEmail } from "../utils/sendEmail.js";
import createHttpError from "http-errors";
import {
  forgotPasswordSchema,
  loginSchema,
  refreshTokenSchema,
  registerSchema,
  resendOtpSchema,
  resetPasswordSchema,
  verifyOtpSchema,
} from "../validation/authValidation.js";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { config } from "../config/config.js";

// Helper: Generate JWT tokens
const generateTokens = (userId, email, role) => {
  const accessToken = jwt.sign(
    { sub: userId, email, role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiry }
  );

  const refreshToken = jwt.sign(
    { sub: userId },
    config.jwtRefreshSecret,
    { expiresIn: config.jwtRefreshExpiry }
  );

  return { accessToken, refreshToken };
};

// Helper: Generate OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Helper: Validate parsed data and return formatted errors
const validateRequest = (parsedData) => {
  if (!parsedData.success) {
    const flattened = parsedData.error.flatten();
    const errors = Object.keys(flattened.fieldErrors).map((field) => ({
      field,
      message: flattened.fieldErrors[field]?.[0] || "Invalid value",
    }));
    const err = createHttpError(400, "Validation failed");
    err.errors = errors;
    throw err;
  }
};

/**
 * @desc    Register a new user and send OTP via email
 * @route   POST /auth/register
 * @body    { username, email, password, role?, departments? }
 * @access  Public
 */
export const registerUser = async (req, res, next) => {
  try {
    const parsedData = registerSchema.safeParse(req.body);
    validateRequest(parsedData);

    const { username, email, password, role, departments } = parsedData.data;

    // Check if user already exists
    const existingUser = await UserModel.findOne({ email });
    if (existingUser) {
      throw createHttpError(400, "User with this email already exists");
    }

    // Check username uniqueness
    const existingUsername = await UserModel.findOne({ username });
    if (existingUsername) {
      throw createHttpError(400, "Username is already taken");
    }

    // Generate OTP
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Create new user
    const user = await UserModel.create({
      username,
      email,
      password,
      role: role || "team_member",
      departments: departments || [],
      otp,
      otpExpires,
    });

    // Send OTP email
    await sendOTPEmail(user.email, user.username, otp, 10);

    return res.status(201).json({
      success: true,
      message: "User registered successfully. Please check your email for OTP.",
      data: { userId: user._id },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Verify user's email using OTP
 * @route   POST /auth/verify-otp
 * @body    { userId, otp }
 * @access  Public
 */
export const verifyOtp = async (req, res, next) => {
  try {
    const parsedData = verifyOtpSchema.safeParse(req.body);
    validateRequest(parsedData);

    const { userId, otp } = parsedData.data;

    // Find user by ID
    const user = await UserModel.findById(userId).select("+otp +otpExpires");

    if (!user) throw createHttpError(404, "User not found");
    if (user.isVerified) throw createHttpError(400, "User already verified");

    // Check OTP validity
    if (user.otp !== otp) throw createHttpError(400, "Invalid OTP");
    if (user.otpExpires < new Date()) {
      throw createHttpError(400, "OTP has expired");
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(
      user._id,
      user.email,
      user.role
    );

    // Update user document
    user.isVerified = true;
    user.otp = undefined;
    user.otpExpires = undefined;
    user.lastLogin = new Date();

    // Store ONLY the hashed refresh token (security best practice)
    const hashedRefreshToken = crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex");

    user.refreshTokens = user.refreshTokens?.filter(
      (t) => new Date(t.expiresAt) > new Date()
    ) || [];

    user.refreshTokens.push({
      token: hashedRefreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    await user.save();

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully. Your email is now verified.",
      data: {
        userId: user._id,
        email: user.email,
        username: user.username,
        role: user.role,
        accessToken,
        refreshToken, // Send plain token to client
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Resend OTP to a user
 * @route   POST /auth/resend-otp
 * @body    { email }
 * @access  Public
 */
export const resendOtp = async (req, res, next) => {
  try {
    const parsedData = resendOtpSchema.safeParse(req.body);
    validateRequest(parsedData);

    const { email } = parsedData.data;

    // Find user
    const user = await UserModel.findOne({ email }).select(
      "+otp +otpExpires +isVerified"
    );
    if (!user) throw createHttpError(404, "User not found");

    if (user.isVerified) {
      throw createHttpError(400, "User is already verified");
    }

    // Rate limiting: prevent OTP spam
    const now = new Date();
    if (user.otp && user.otpExpires && now < user.otpExpires) {
      const otpCreatedAt = new Date(user.otpExpires.getTime() - 10 * 60 * 1000);
      const minutesSinceLastOtp = (now - otpCreatedAt) / 1000 / 60;
      
      if (minutesSinceLastOtp < 2) {
        return res.status(429).json({
          success: false,
          message: `Please wait ${Math.ceil(2 - minutesSinceLastOtp)} minute(s) before requesting a new OTP.`,
        });
      }
    }

    // Generate new OTP
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    user.otp = otp;
    user.otpExpires = otpExpires;
    await user.save();

    // Send OTP email
    await sendOTPEmail(user.email, user.username, otp, 10);

    return res.status(200).json({
      success: true,
      message: "OTP resent successfully. Please check your email.",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Login user and send OTP
 * @route   POST /auth/login
 * @body    { email, password }
 * @access  Public
 */
export const loginUser = async (req, res, next) => {
  try {
    const parsedData = loginSchema.safeParse(req.body);
    validateRequest(parsedData);

    const { email, password } = parsedData.data;

    // Find user by email
    const user = await UserModel.findOne({ email }).select("+password");

    if (!user) throw createHttpError(401, "Invalid email or password");
    if (!user.isActive) throw createHttpError(403, "User account is inactive");

    // Compare password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) throw createHttpError(401, "Invalid email or password");

    // Generate OTP
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    // Update user OTP & mark as unverified for this session
    user.otp = otp;
    user.otpExpires = otpExpires;
    user.isVerified = false;
    await user.save();

    // Send OTP email
    await sendOTPEmail(user.email, user.username, otp, 10);

    return res.status(200).json({
      success: true,
      message: "OTP sent to your email. Please verify to complete login.",
      data: { userId: user._id },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Logout user (invalidate refresh token)
 * @route   POST /auth/logout
 * @body    { refreshToken }
 * @access  Private (requires auth middleware)
 */
export const logoutUser = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { refreshToken } = req.body;

    if (!userId) {
      throw createHttpError(401, "Unauthorized. Token missing or invalid");
    }

    const user = await UserModel.findById(userId);
    if (!user) throw createHttpError(404, "User not found");

    if (refreshToken) {
      // Remove specific refresh token
      const hashedToken = crypto
        .createHash("sha256")
        .update(refreshToken)
        .digest("hex");

      user.refreshTokens = user.refreshTokens?.filter(
        (t) => t.token !== hashedToken
      ) || [];
    } else {
      // Logout from all devices
      user.refreshTokens = [];
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Logout successful. Token has been revoked.",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Refresh JWT access token using refresh token
 * @route   POST /auth/refresh-token
 * @body    { refreshToken }
 * @access  Public
 */
export const getRefreshToken = async (req, res, next) => {
  try {
    const parsedData = refreshTokenSchema.safeParse(req.body);
    validateRequest(parsedData);

    const { refreshToken } = parsedData.data;

    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, config.jwtRefreshSecret);
    } catch (err) {
      throw createHttpError(401, "Invalid or expired refresh token");
    }

    const user = await UserModel.findById(decoded.sub);
    if (!user) throw createHttpError(404, "User not found");
    if (!user.isActive) throw createHttpError(403, "User account is inactive");

    // Hash the provided token and check if it exists in DB
    const hashedToken = crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex");

    const storedToken = user.refreshTokens?.find((t) => t.token === hashedToken);
    
    if (!storedToken) {
      throw createHttpError(401, "Refresh token not recognized or already used");
    }

    if (new Date(storedToken.expiresAt) < new Date()) {
      // Remove expired token
      user.refreshTokens = user.refreshTokens.filter(
        (t) => t.token !== hashedToken
      );
      await user.save();
      throw createHttpError(401, "Refresh token has expired");
    }

    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(
      user._id,
      user.email,
      user.role
    );

    // Hash new refresh token
    const newHashedToken = crypto
      .createHash("sha256")
      .update(newRefreshToken)
      .digest("hex");

    // Remove old token and add new one
    user.refreshTokens = user.refreshTokens.filter(
      (t) => new Date(t.expiresAt) > new Date() && t.token !== hashedToken
    );

    user.refreshTokens.push({
      token: newHashedToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Access token refreshed successfully",
      data: {
        accessToken,
        refreshToken: newRefreshToken, // Send plain token to client
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Send password reset email with token (rate-limited)
 * @route   POST /auth/forgot-password
 * @body    { email }
 * @access  Public
 */
export const forgotPassword = async (req, res, next) => {
  try {
    const parsedData = forgotPasswordSchema.safeParse(req.body);
    validateRequest(parsedData);

    const { email } = parsedData.data;
    const user = await UserModel.findOne({ email });
    
    if (!user) {
      // Security: Don't reveal if email exists
      return res.status(200).json({
        success: true,
        message: "If an account exists with this email, a password reset link has been sent.",
      });
    }

    // Rate limiting: prevent token spam
    const now = Date.now();
    if (user.passwordResetExpires && user.passwordResetExpires > now) {
      const remaining = Math.ceil((user.passwordResetExpires - now) / 1000 / 60);
      return res.status(429).json({
        success: false,
        message: `Please wait ${remaining} minute(s) before requesting another reset.`,
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    user.passwordResetToken = resetTokenHash;
    user.passwordResetExpires = now + 15 * 60 * 1000; // 15 minutes
    await user.save();

    const resetUrl = `${config.frontendUrl}/auth/reset-password?token=${resetToken}`;

    // Send password reset email
    await sendPasswordResetEmail(user.email, user.username, resetUrl, 0.25);

    return res.status(200).json({
      success: true,
      message: "Password reset link sent to your email address.",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Reset password using token and send OTP
 * @route   POST /auth/reset-password
 * @body    { token, newPassword }
 * @access  Public
 */
export const resetPassword = async (req, res, next) => {
  try {
    const parsedData = resetPasswordSchema.safeParse(req.body);
    validateRequest(parsedData);

    const { token, newPassword } = parsedData.data;

    // Hash the token to compare with stored token
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    // Find user with valid token
    const user = await UserModel.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      throw createHttpError(400, "Invalid or expired reset token");
    }

    // Update password
    user.password = newPassword;

    // Clear reset token fields
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;

    // Mark as unverified and generate OTP
    user.isVerified = false;
    const otp = generateOTP();
    user.otp = otp;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    // Clear all refresh tokens (force re-login)
    user.refreshTokens = [];

    await user.save();

    // Send OTP email
    await sendOTPEmail(user.email, user.username, otp, 10);

    return res.status(200).json({
      success: true,
      message: "Password reset successfully. OTP has been sent to your email for verification.",
      data: { userId: user._id },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get current logged-in user's profile
 * @route   GET /auth/profile
 * @access  Private
 */
export const getProfile = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      throw createHttpError(401, "Unauthorized. Token missing or invalid");
    }

    const user = await UserModel.findById(userId)
      .select("-password -otp -otpExpires -mfaSecret -refreshTokens -passwordResetToken -passwordResetExpires")
      .populate("departments", "name code");

    if (!user) {
      throw createHttpError(404, "User not found");
    }

    return res.status(200).json({
      success: true,
      message: "User profile fetched successfully",
      data: user,
    });
  } catch (error) {
    next(error);
  }
};