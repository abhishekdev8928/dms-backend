// routes/folderRoutes.js

import express from 'express';
import {
  createFolder,
  getRootFolders,
  getFolderById,
  getChildFolders,
  getAllDescendants,
  getFolderBreadcrumbs,
  updateFolder,
  moveFolder,
  softDeleteFolder,
  restoreFolder,
  getFolderStats,
  searchFolders
} from '../controller/folderController.js';
import { authenticateUser } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * ============================================
 * FOLDER ROUTES
 * ============================================
 * Base URL: /api/folders
 * All routes require authentication
 */

/**
 * @route   GET /api/folders/search
 * @desc    Search folders by name
 * @access  Private
 * @query   q - search query (required)
 * @query   departmentId - filter by department (optional)
 */
router.get('/search', authenticateUser, searchFolders);

/**
 * @route   POST /api/folders
 * @desc    Create a new folder
 * @access  Private
 * @body    { name: string, departmentId: string, parentId?: string, description?: string, color?: string }
 */
router.post('/', authenticateUser, createFolder);

/**
 * @route   GET /api/folders/:id
 * @desc    Get folder by ID with details
 * @access  Private
 * @params  id - folder ObjectId
 */
router.get('/:id', authenticateUser, getFolderById);

/**
 * @route   PUT /api/folders/:id
 * @desc    Update folder details
 * @access  Private
 * @params  id - folder ObjectId
 * @body    { name?: string, description?: string, color?: string }
 */
router.put('/:id', authenticateUser, updateFolder);

/**
 * @route   DELETE /api/folders/:id
 * @desc    Soft delete folder (and all descendants)
 * @access  Private
 * @params  id - folder ObjectId
 */
router.delete('/:id', authenticateUser, softDeleteFolder);

/**
 * @route   GET /api/folders/:id/children
 * @desc    Get direct child folders of a parent folder
 * @access  Private
 * @params  id - parent folder ObjectId
 * @query   includeDeleted - include deleted folders (optional)
 */
router.get('/:id/children', authenticateUser, getChildFolders);

/**
 * @route   GET /api/folders/:id/descendants
 * @desc    Get all descendants (nested children) of a folder
 * @access  Private
 * @params  id - folder ObjectId
 * @query   includeDeleted - include deleted folders (optional)
 */
router.get('/:id/descendants', authenticateUser, getAllDescendants);

/**
 * @route   GET /api/folders/:id/breadcrumbs
 * @desc    Get breadcrumbs (folder path) from root to current folder
 * @access  Private
 * @params  id - folder ObjectId
 */
router.get('/:id/breadcrumbs', authenticateUser, getFolderBreadcrumbs);

/**
 * @route   POST /api/folders/:id/move
 * @desc    Move folder to new parent location
 * @access  Private
 * @params  id - folder ObjectId to move
 * @body    { newParentId: string } - null for root level
 */
router.post('/:id/move', authenticateUser, moveFolder);

/**
 * @route   POST /api/folders/:id/restore
 * @desc    Restore soft deleted folder
 * @access  Private
 * @params  id - folder ObjectId
 */
router.post('/:id/restore', authenticateUser, restoreFolder);

/**
 * @route   GET /api/folders/:id/stats
 * @desc    Get folder statistics (child folders, documents, total size)
 * @access  Private
 * @params  id - folder ObjectId
 */
router.get('/:id/stats', authenticateUser, getFolderStats);

export default router;