// routes/departmentRoutes.js

import express from 'express';
import {
  createDepartment,
  getAllDepartments,
  getDepartmentById,
  updateDepartment,
  deleteDepartment,
  deactivateDepartment,
  activateDepartment,
  updateDepartmentStats,
  getDepartmentByName
} from '../controller/departmentController.js';
import { authenticateUser } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * ============================================
 * DEPARTMENT ROUTES
 * ============================================
 * Base URL: /api/departments
 * All routes require authentication
 */

/**
 * @route   POST /api/departments
 * @desc    Create a new department
 * @access  Private (Admin/Superadmin recommended)
 * @body    { name: string, description?: string }
 */
router.post('/', authenticateUser, createDepartment);

/**
 * @route   GET /api/departments
 * @desc    Get all departments
 * @access  Private
 * @query   activeOnly=true (optional) - filter only active departments
 */
router.get('/', authenticateUser, getAllDepartments);

/**
 * @route   GET /api/departments/name/:name
 * @desc    Get department by name (case-insensitive)
 * @access  Private
 * @params  name - department name
 */
router.get('/name/:name', authenticateUser, getDepartmentByName);

/**
 * @route   GET /api/departments/:id
 * @desc    Get single department by ID
 * @access  Private
 * @params  id - department ObjectId
 */
router.get('/:id', authenticateUser, getDepartmentById);

/**
 * @route   PUT /api/departments/:id
 * @desc    Update department details
 * @access  Private (Admin/Superadmin recommended)
 * @params  id - department ObjectId
 * @body    { name?: string, description?: string, isActive?: boolean }
 */
router.patch('/:id', authenticateUser, updateDepartment);

/**
 * @route   DELETE /api/departments/:id
 * @desc    Delete department (hard delete - permanent)
 * @access  Private (Superadmin only recommended)
 * @params  id - department ObjectId
 */
router.delete('/:id', authenticateUser, deleteDepartment);

/**
 * @route   PATCH /api/departments/:id/deactivate
 * @desc    Deactivate department (soft delete)
 * @access  Private (Admin/Superadmin recommended)
 * @params  id - department ObjectId
 */
router.patch('/:id/deactivate', authenticateUser, deactivateDepartment);

/**
 * @route   PATCH /api/departments/:id/activate
 * @desc    Activate department
 * @access  Private (Admin/Superadmin recommended)
 * @params  id - department ObjectId
 */
router.patch('/:id/activate', authenticateUser, activateDepartment);

/**
 * @route   POST /api/departments/:id/update-stats
 * @desc    Manually refresh department statistics
 * @access  Private (Admin/Superadmin recommended)
 * @params  id - department ObjectId
 * @returns { totalFolders, totalDocuments, totalStorageBytes }
 */
router.post('/:id/update-stats', authenticateUser, updateDepartmentStats);

export default router;