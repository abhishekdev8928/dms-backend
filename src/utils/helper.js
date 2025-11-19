import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import createHttpError from "http-errors";
import xss from "xss";
import { config } from "../config/config.js";



export const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};



export const sanitizeInput = (input) => {
  if (typeof input === 'string') {
    return input;
  }
  if (typeof input === 'number' || typeof input === 'boolean') {
    return input;
  }
  // Reject objects, arrays, and other complex types
  throw createHttpError(400, 'Invalid input type detected');
};

/**
 * Single ID validation
 */
export const sanitizeAndValidateId = (id, fieldName = "ID") => {
  const sanitized = sanitizeInput(id);

  if (!isValidObjectId(sanitized)) {
    throw createHttpError(400, `Invalid ${fieldName} format: ${id}`);
  }

  return sanitized;
};

/**
 * Validate single or multiple IDs
 */
export const sanitizeAndValidateIds = (ids, fieldName = "ID") => {
  if (!ids) {
    throw createHttpError(400, `${fieldName} is required`);
  }

  // Always convert to array
  const idArray = Array.isArray(ids) ? ids : [ids];

  // Validate each ID individually using the single-ID helper
  return idArray.map(id => sanitizeAndValidateId(id, fieldName));
};


// ===== XSS PREVENTION =====

/**
 * Sanitize string input to prevent XSS attacks
 * @param {string} input - The input string to sanitize
 * @returns {string} - Sanitized string
 */
export const sanitizeXSS = (input) => {
  if (typeof input === 'string') {
    return xss(input, {
      whiteList: {}, // No HTML tags allowed
      stripIgnoreTag: true, // Remove all HTML tags
      stripIgnoreTagBody: ['script', 'style'], // Remove script and style content
    });
  }
  return input;
};

/**
 * Combined sanitization: NoSQL + XSS protection
 * Use this for user-generated text content
 * @param {any} input - The input to sanitize
 * @returns {any} - Sanitized input
 */
export const sanitizeInputWithXSS = (input) => {
  // First, check type (NoSQL protection)
  const typeSafe = sanitizeInput(input);
  
  // Then, clean XSS if it's a string
  if (typeof typeSafe === 'string') {
    return sanitizeXSS(typeSafe);
  }
  
  return typeSafe;
};

/**
 * Recursively sanitize all string values in an object/array
 * Use this for sanitizing response data before sending to client
 * @param {any} obj - Object, array, or primitive to sanitize
 * @returns {any} - Sanitized data
 */
export const sanitizeObjectXSS = (obj) => {
  // Handle null/undefined
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle strings
  if (typeof obj === 'string') {
    return sanitizeXSS(obj);
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObjectXSS(item));
  }

  // Handle objects (but not Mongoose documents, Dates, etc.)
  if (typeof obj === 'object' && obj.constructor === Object) {
    const sanitized = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        sanitized[key] = sanitizeObjectXSS(obj[key]);
      }
    }
    return sanitized;
  }

  // Return as-is for numbers, booleans, dates, etc.
  return obj;
};

// ===== TOKEN GENERATION =====

// Helper: Generate JWT tokens
export const generateTokens = (userId, email, role) => {
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
export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// ===== VALIDATION =====

// Helper: Validate parsed data and return formatted errors
export const validateRequest = (parsedData) => {
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