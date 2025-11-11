import nodemailer from "nodemailer";
import { config } from "../config/config.js";

// Email template for OTP verification
export const getOTPEmailTemplate = (username, otp, expiryMinutes = 10) => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>OTP Verification</title>
      <style>
        body {
          margin: 0;
          padding: 0;
          background-color: #000000 !important;
        }
      </style>
    </head>
    <body style="margin: 0 !important; padding: 0 !important; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #000000 !important;">
      <div style="background-color: #000000; padding: 40px 20px; min-height: 100vh;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #000000;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #1a1a1a; border-radius: 12px; overflow: hidden; border: 1px solid #2a2a2a; max-width: 600px;">
                
                <!-- Logo/Brand -->
                <tr>
                  <td style="padding: 40px 30px 30px 30px;">
                    <div style="display: inline-block; background-color: #ff6c37; width: 48px; height: 48px; border-radius: 8px; text-align: center; line-height: 48px; font-size: 24px;">
                      🔐
                    </div>
                  </td>
                </tr>
                
                <!-- Header -->
                <tr>
                  <td style="padding: 0 30px 30px 30px;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600; line-height: 1.3;">
                      Verification Code
                    </h1>
                  </td>
                </tr>
                
                <!-- Content -->
                <tr>
                  <td style="padding: 0 30px 30px 30px;">
                    <p style="margin: 0 0 20px; color: #e0e0e0; font-size: 15px; line-height: 1.6;">
                      Dear ${username},
                    </p>
                    
                    <p style="margin: 0 0 30px; color: #e0e0e0; font-size: 15px; line-height: 1.6;">
                      We received a request to verify your account. Use the code below to complete your verification:
                    </p>
                    
                    <!-- OTP Box -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="padding: 0 0 30px 0;">
                          <div style="background-color: #ff6c37; border-radius: 6px; padding: 20px 40px; display: inline-block;">
                            <span style="color: #ffffff; font-size: 32px; font-weight: bold; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                              ${otp}
                            </span>
                          </div>
                        </td>
                      </tr>
                    </table>
                    
                    <p style="margin: 0 0 20px; color: #b0b0b0; font-size: 14px; line-height: 1.6;">
                      This code is valid for a single use and expires in ${expiryMinutes} minutes.
                    </p>
                    
                    <p style="margin: 0; color: #b0b0b0; font-size: 14px; line-height: 1.6;">
                      Please ignore this email if you did not initiate this verification. If you need additional assistance, please contact <a href="mailto:help@yourdomain.com" style="color: #4a9eff; text-decoration: none;">help@yourdomain.com</a>.
                    </p>
                  </td>
                </tr>
                
                <!-- Divider -->
                <tr>
                  <td style="padding: 0 30px;">
                    <div style="border-top: 1px solid #2a2a2a;"></div>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="padding: 30px; text-align: left;">
                    <p style="margin: 0 0 5px; color: #808080; font-size: 12px; line-height: 1.5;">
                      © ${new Date().getFullYear()} Document Management System Inc. All Rights Reserved
                    </p>
                    <p style="margin: 0; color: #808080; font-size: 12px; line-height: 1.5;">
                      123 Business Street, Suite 100, Your City, ST 12345
                    </p>
                    <p style="margin: 5px 0 0; color: #808080; font-size: 12px; line-height: 1.5;">
                      +1 234 567 8900
                    </p>
                  </td>
                </tr>
                
              </table>
            </td>
          </tr>
        </table>
      </div>
    </body>
    </html>
  `;
};

// Email template for Password Reset
export const getPasswordResetTemplate = (username, resetUrl, expiryHours = 24) => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Password Reset</title>
      <style>
        body {
          margin: 0;
          padding: 0;
          background-color: #000000 !important;
        }
      </style>
    </head>
    <body style="margin: 0 !important; padding: 0 !important; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #000000 !important;">
      <div style="background-color: #000000; padding: 40px 20px; min-height: 100vh;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #000000;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #1a1a1a; border-radius: 12px; overflow: hidden; border: 1px solid #2a2a2a; max-width: 600px;">
                
                <!-- Logo/Brand -->
                <tr>
                  <td style="padding: 40px 30px 30px 30px;">
                    <div style="display: inline-block; background-color: #ff6c37; width: 48px; height: 48px; border-radius: 8px; text-align: center; line-height: 48px; font-size: 24px;">
                      ✉️
                    </div>
                  </td>
                </tr>
                
                <!-- Header -->
                <tr>
                  <td style="padding: 0 30px 30px 30px;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600; line-height: 1.3;">
                      Document Management System password reset
                    </h1>
                  </td>
                </tr>
                
                <!-- Content -->
                <tr>
                  <td style="padding: 0 30px 30px 30px;">
                    <p style="margin: 0 0 20px; color: #e0e0e0; font-size: 15px; line-height: 1.6;">
                      Dear ${username},
                    </p>
                    
                    <p style="margin: 0 0 30px; color: #e0e0e0; font-size: 15px; line-height: 1.6;">
                      We've received your request to reset your password. Please click the link below to complete the reset.
                    </p>
                    
                    <!-- Reset Button -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 0 0 30px 0;">
                          <a href="${resetUrl}" style="background-color: #ff6c37; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 4px; font-size: 15px; font-weight: 500; display: inline-block;">
                            Reset My Password
                          </a>
                        </td>
                      </tr>
                    </table>
                    
                    <p style="margin: 0 0 20px; color: #b0b0b0; font-size: 14px; line-height: 1.6;">
                      This link is valid for a single use and expires in ${expiryHours} hours.
                    </p>
                    
                    <p style="margin: 0; color: #b0b0b0; font-size: 14px; line-height: 1.6;">
                      Please ignore this email if you did not initiate this change. If you need additional assistance, please contact <a href="mailto:help@yourdomain.com" style="color: #4a9eff; text-decoration: none;">help@yourdomain.com</a>.
                    </p>
                  </td>
                </tr>
                
                <!-- Divider -->
                <tr>
                  <td style="padding: 0 30px;">
                    <div style="border-top: 1px solid #2a2a2a;"></div>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="padding: 30px; text-align: left;">
                    <p style="margin: 0 0 5px; color: #808080; font-size: 12px; line-height: 1.5;">
                      © ${new Date().getFullYear()} Document Management System Inc. All Rights Reserved
                    </p>
                    <p style="margin: 0; color: #808080; font-size: 12px; line-height: 1.5;">
                      123 Business Street, Suite 100, Your City, ST 12345
                    </p>
                    <p style="margin: 5px 0 0; color: #808080; font-size: 12px; line-height: 1.5;">
                      +1 234 567 8900
                    </p>
                  </td>
                </tr>
                
              </table>
            </td>
          </tr>
        </table>
      </div>
    </body>
    </html>
  `;
};
