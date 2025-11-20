import express from 'express';
import {
  logBulkFileUpload,
  getUserActivitiesGrouped,
  getFileActivity,
  getFolderActivity,
  getRecentActivities,
  getActivityStats,
  searchActivities
} from '../controller/activityController.js';
import { authenticateUser } from '../middleware/authMiddleware.js';

const router = express.Router();

// ============================================
// POST ROUTES - Only Bulk Upload
// ============================================

router.post('/bulk-upload', authenticateUser, logBulkFileUpload);

// ============================================
// GET ROUTES - Fetching Activity Logs
// ============================================

// User activities grouped by time period
router.get('/user', authenticateUser, getUserActivitiesGrouped);

// Entity-specific activities
router.get('/file/:fileId', authenticateUser, getFileActivity);
router.get('/folder/:folderId', authenticateUser, getFolderActivity);

// General queries
router.get('/recent', authenticateUser, getRecentActivities);
router.get('/stats', authenticateUser, getActivityStats);
router.get('/search', authenticateUser, searchActivities);

export default router;