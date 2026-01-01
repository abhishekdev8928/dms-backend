import jwt from 'jsonwebtoken';
import createHttpError from 'http-errors';
import UserModel from '../models/userModel.js';
import { config } from '../config/config.js';


// middleware/authMiddleware.js

export const authenticateUser = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      throw createHttpError(401, 'Not authorized. Token missing.');
    }

    const decoded = jwt.verify(token, config.jwtSecret);

    const user = await UserModel.findById(decoded.sub)
      .populate('departments')
      .populate('myDriveDepartmentId');

    if (!user || !user.isActive) {
      throw createHttpError(401, 'User not found or inactive.');
    }

    req.user = user;
    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token',
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired. Please log in again.',
      });
    }

    next(error);
  }
};


/**
 * 🔐 Generic role-based access middleware
 * Usage: authorizeRoles('SUPER_ADMIN', 'ADMIN')
 */
export const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required roles: ${allowedRoles.join(', ')}`,
      });
    }

    next();
  };
};
