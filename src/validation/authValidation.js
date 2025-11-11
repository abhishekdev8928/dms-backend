import { z } from 'zod';


export const registerSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .max(50, 'Password must be less than 50 characters'),
  role: z.enum(['superadmin', 'admin', 'team_member', 'member_bank']).optional(),
  departments: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid department ID')).optional(),
});


export const verifyOtpSchema = z.object({
  userId: z.string().min(1, "User ID is required"), // required userId
  otp: z.string().length(6, "OTP must be 6 digits"), // 6-digit OTP
});

export const resendOtpSchema = z.object({
  email: z.string().email('Invalid email address')
});


export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .max(50, 'Password must be less than 50 characters')
});


export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required")
});



// Zod validation schema
export const forgotPasswordSchema = z.object({
  email: z.string().email("Valid email is required")
});



// Example Zod schema
export const resetPasswordSchema = z.object({
  token: z.string(),
  newPassword: z.string().min(6),
});
