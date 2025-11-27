// routes/auth.js
/*
POST   /api/auth/register           // Register new user (Superadmin only) ✅
POST   /api/auth/login              // User login with JWT ✅
POST   /api/auth/logout             // Logout ✅
POST   /api/auth/refresh-token      // Refresh JWT token ✅
POST   /api/auth/forgot-password    // Send password reset email ✅
POST   /api/auth/reset-password     // Reset password with token ✅
GET    /api/auth/me                 // Get current user info   ✅
PUT    /api/auth/update-profile     // Update own profile
PUT    /api/auth/change-password    // Change own password

*/

import express from "express";
import {
  forgotPassword,
  getRefreshToken,
  getProfile,
  loginUser,
  logoutUser,
  registerUser,
  resendOtp,
  resetPassword,
  verifyOtp,
  createUserBySuperAdmin,
} from "../controller/authController.js";
import { authenticateUser } from "../middleware/authMiddleware.js";

const router = express.Router();

// Register new user
router.post("/register", registerUser);

router.post(
  "/users",
  authenticateUser,
  createUserBySuperAdmin
);

router.post("/verify-otp", verifyOtp);

router.post("/resend-otp", resendOtp);

router.post("/login", loginUser);
router.post("/logout", authenticateUser, logoutUser);
router.post("/refresh-token", getRefreshToken);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.get("/profile", authenticateUser, getProfile);

export default router;
