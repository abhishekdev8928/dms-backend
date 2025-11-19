import express from 'express';
import {
  getUserActivitiesGrouped,
  getFileActivity,
  getFolderActivity,
  getBulkGroupActivities,
  getRecentActivities,
  getActivityStats,
  searchActivities
} from '../controller/activityController.js';
import { authenticateUser } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateUser);

/**
 * @route   GET /api/activity/user/:userId
 * @desc    Get user's activities grouped by date (Today, Yesterday, Last Week, Older)
 * @access  Private
 * @query   limit
 */
router.get('/user/:userId', getUserActivitiesGrouped);

/**
 * @route   GET /api/activity/file/:fileId
 * @desc    Get complete activity history for a specific file/document
 * @access  Private
 * @query   limit
 */
router.get('/file/:fileId', getFileActivity);

/**
 * @route   GET /api/activity/folder/:folderId
 * @desc    Get complete activity history for a specific folder
 * @access  Private
 * @query   limit, actionType
 */
router.get('/folder/:folderId', getFolderActivity);

/**
 * @route   GET /api/activity/bulk/:bulkGroupId
 * @desc    Get activities by bulk group ID (for bulk operations)
 * @access  Private
 */
router.get('/bulk/:bulkGroupId', getBulkGroupActivities);

/**
 * @route   GET /api/activity/recent
 * @desc    Get recent activities with optional filters
 * @access  Private
 * @query   limit, page, userId, actionType, targetType
 */
router.get('/recent', getRecentActivities);

/**
 * @route   GET /api/activity/stats
 * @desc    Get activity statistics and breakdowns
 * @access  Private
 * @query   startDate, endDate, userId, targetType
 */
router.get('/stats', getActivityStats);

/**
 * @route   GET /api/activity/search
 * @desc    Search activities with filters
 * @access  Private
 * @query   query, action, targetType, userId, startDate, endDate, limit, page
 */
router.get('/search', searchActivities);

export default router;