import nodemailer from "nodemailer";
import { config } from "../config/config.js";
import {
  getPasswordResetTemplate,
  getOTPEmailTemplate,
  getWelcomeEmailTemplate,
} from "./emailTemplate.js";

export const sendEmail = async ({ to, subject, text, html }) => {
  if (!to) {
    throw new Error("No recipients defined");
  }

  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure || false, // true for 465, false for 587
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });

  try {
    await transporter.sendMail({
      from: `"Document Management System" <${config.smtp.user}>`,
      to,
      subject,
      text,
      html,
    });
    console.log(`Email sent successfully to ${to}`);
  } catch (error) {
    console.error(`Error sending email to ${to}:`, error.message);
    throw new Error(`Failed to send email: ${error.message}`);
  }
};

export const sendOTPEmail = async (to, username, otp, expiryMinutes = 10) => {
  const html = getOTPEmailTemplate(username, otp, expiryMinutes);
  const text = `Dear ${username},\n\nYour verification code is: ${otp}\n\nThis code expires in ${expiryMinutes} minutes.\n\nIf you didn't request this code, please ignore this email.`;

  await sendEmail({
    to,
    subject: "🔐 Your Verification Code",
    text,
    html,
  });
};

export const sendPasswordResetEmail = async (
  to,
  username,
  resetUrl,
  expiryHours = 24
) => {
  const html = getPasswordResetTemplate(username, resetUrl, expiryHours);
  const text = `Dear ${username},\n\nWe received a request to reset your password. Click the link below to reset it:\n\n${resetUrl}\n\nThis link is valid for a single use and expires in ${expiryHours} hours.\n\nIf you didn't request this, please ignore this email.`;

  await sendEmail({
    to,
    subject: "🔑 Password Reset Request",
    text,
    html,
  });
};

export const sendWelcomeEmail = async (to, username, temporaryPassword) => {
  const html = getWelcomeEmailTemplate(username, to, temporaryPassword);
  const text = `Dear ${username},\n\nWelcome to Document Management System!\n\nYour account has been successfully created by our administrator. Below are your login credentials:\n\nEmail: ${to}\nTemporary Password: ${temporaryPassword}\n\n⚠️ IMPORTANT: Please change your password immediately after your first login for security purposes.\n\nLogin at: ${config.frontendUrl}/login\n\nIf you have any questions, please contact us at help@yourdomain.com\n\nWe're excited to have you on board!`;

  await sendEmail({
    to,
    subject: "👋 Welcome to Document Management System - Your Account Details",
    text,
    html,
  });
};

/*
// Usage Examples:

// For OTP:
await sendOTPEmail(user.email, user.username, "123456", 10);

// For Password Reset:
await sendPasswordResetEmail(user.email, user.username, resetUrl, 24);

// For Welcome Email (Super Admin Created Users):
await sendWelcomeEmail(user.email, user.username, "TempPass123!");
*/