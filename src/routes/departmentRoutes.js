// routes/departmentRoutes.js

import express from 'express';
import {
  createDepartment,
  getAllDepartments,
  getDepartmentById,
  updateDepartment,
  deleteDepartment
} from '../controller/departmentController.js';
import { authenticateUser, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @route   POST /api/departments
 * @desc    Create a new ORG department (MyDrive is auto-created on user registration)
 * @access  Private - SUPER_ADMIN, ADMIN only
 * @body    { name: string, description?: string }
 */
router.post(
  '/',
  authenticateUser,
  authorizeRoles('SUPER_ADMIN', 'ADMIN'),
  createDepartment
);

/**
 * @route   GET /api/departments
 * @desc    Get all departments (filtered by user's access)
 * @access  Private - All authenticated users
 * @query   page, limit, search, sortBy, order, activeOnly
 */
router.get('/', authenticateUser, getAllDepartments);

/**
 * @route   GET /api/departments/:id
 * @desc    Get single department by ID
 * @access  Private - All authenticated users (with access verification)
 * @params  id - department ObjectId
 */
router.get('/:id', authenticateUser, getDepartmentById);

/**
 * @route   PATCH /api/departments/:id
 * @desc    Update department details (ORG departments only)
 * @access  Private - SUPER_ADMIN, ADMIN, DEPARTMENT_OWNER
 * @params  id - department ObjectId
 * @body    { name?: string, description?: string, isActive?: boolean }
 */
router.patch(
  '/:id',
  authenticateUser,
  authorizeRoles('SUPER_ADMIN', 'ADMIN', 'DEPARTMENT_OWNER'),
  updateDepartment
);

/**
 * @route   DELETE /api/departments/:id
 * @desc    Delete department permanently (ORG departments only)
 * @access  Private - SUPER_ADMIN only
 * @params  id - department ObjectId
 */
router.delete(
  '/:id',
  authenticateUser,
  authorizeRoles('SUPER_ADMIN'),
  deleteDepartment
);

export default router;