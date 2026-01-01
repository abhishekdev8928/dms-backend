// routes/folderRoutes.js

import express from 'express';
import {
  createFolder,
  getFolderById,
  getChildFolders,
  updateFolder,
  moveFolder,
  softDeleteFolder,
  restoreFolder,
  getFolderStats,
  searchFolders,
  shareFolder
} from '../controller/folderController.js';
import { authenticateUser } from '../middleware/authMiddleware.js';
import {
  canCreate,
  canView,
  canDelete,
  canShare,
  checkPermission,
  canViewParent
} from '../middleware/checkPermission.js';

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
 * @desc    Search folders by name (returns only folders user has access to)
 * @access  Private
 * @query   q - search query (required)
 * @query   departmentId - filter by department (optional)
 * @note    Controller filters results by user permissions
 */
router.get('/search', authenticateUser, searchFolders);

/**
 * @route   POST /api/folders
 * @desc    Create a new folder inside parent (folder or department)
 * @access  Private - Requires 'upload' permission on parent
 * @body    { name: string, parentId: string, description?: string, color?: string }
 */
router.post('/', authenticateUser, canCreate, createFolder);

/**
 * @route   GET /api/folders/:id/children
 * @desc    Get direct child folders and documents
 * @access  Private - Requires 'view' permission on parent
 * @params  id - parent folder or department ObjectId
 * @query   includeDeleted - include deleted items (optional)
 */
router.get('/:id/children', authenticateUser, canViewParent(), getChildFolders);

/**
 * @route   GET /api/folders/:id/breadcrumbs
 * @desc    Get breadcrumbs (folder path) from root to current folder
 * @access  Private - Requires 'view' permission
 * @params  id - folder ObjectId
 */
// router.get('/:id/breadcrumbs', authenticateUser, canView('FOLDER'), getFolderBreadcrumbs);

/**
 * @route   GET /api/folders/:id/stats
 * @desc    Get folder statistics (child folders, documents, total size)
 * @access  Private - Requires 'view' permission
 * @params  id - folder ObjectId
 */
router.get('/:id/stats', authenticateUser, canView('FOLDER'), getFolderStats);

/**
 * @route   POST /api/folders/:id/move
 * @desc    Move folder to new parent location
 * @access  Private - Requires 'delete' on source, 'upload' on destination
 * @params  id - folder ObjectId to move
 * @body    { newParentId: string } - destination parent (folder or department)
 * @note    Controller validates upload permission on destination
 */
router.post('/:id/move', authenticateUser, canDelete('FOLDER'), moveFolder);

/**
 * @route   POST /api/folders/:id/restore
 * @desc    Restore soft deleted folder
 * @access  Private - Requires 'delete' permission
 * @params  id - folder ObjectId
 */
router.post('/:id/restore', authenticateUser, canDelete('FOLDER'), restoreFolder);

/**
 * @route   POST /api/folders/:id/share
 * @desc    Share folder with users/groups
 * @access  Private - Requires 'share' permission
 * @params  id - folder ObjectId
 * @body    { users: [{ userId, permissions }], groups: [{ groupId, permissions }] }
 */
router.post('/:id/share', authenticateUser, canShare('FOLDER'), shareFolder);

/**
 * @route   GET /api/folders/:id
 * @desc    Get folder by ID with details
 * @access  Private - Requires 'view' permission
 * @params  id - folder ObjectId
 * @note    Must be LAST to avoid conflicting with other /:id/* routes
 */
router.get('/:id', authenticateUser, canView('FOLDER'), getFolderById);

/**
 * @route   PUT /api/folders/:id
 * @desc    Update folder details (name, description, color)
 * @access  Private - Requires 'upload' permission
 * @params  id - folder ObjectId
 * @body    { name?: string, description?: string, color?: string }
 */
router.put('/:id', authenticateUser, checkPermission('FOLDER', 'upload'), updateFolder);

/**
 * @route   DELETE /api/folders/:id
 * @desc    Soft delete folder (and all descendants)
 * @access  Private - Requires 'delete' permission
 * @params  id - folder ObjectId
 */
router.delete('/:id', authenticateUser, canDelete('FOLDER'), softDeleteFolder);

export default router;