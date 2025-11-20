import jwt from 'jsonwebtoken';
import createHttpError from 'http-errors';
import UserModel from '../models/userModel.js';
import { config } from '../config/config.js';

export const authenticateUser = async (req, res, next) => {
  try {
    let token;

    // Extract Bearer token
    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      throw createHttpError(401, 'Not authorized. Token missing.');
    }

    // Verify JWT
    const decoded = jwt.verify(token, config.jwtSecret);

    // Fetch user from DB
    const user = await UserModel.findById(decoded.sub).populate('departments');

    if (!user || !user.isActive) {
      throw createHttpError(401, 'User not found or inactive.');
    }

    // Attach user info to request
    req.user = {
      id: user._id,
      email: user.email,
      role: user.role,
      username:user.username
    };

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
