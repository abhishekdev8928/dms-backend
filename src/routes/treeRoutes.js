import express from 'express';
import {
  getDepartmentTree,
  getFolderTree,
  getDepartmentsList
} from '../controllers/departmentTreeController.js';
import {authenticateUser} from '../middleware/authMiddleware.js'; // Adjust path as needed

const router = express.Router();

// Get all departments with basic stats
router.get('/departments', authenticateUser, getDepartmentsList);

// Get complete tree for all departments or specific department
router.get('/tree', authenticateUser, getDepartmentTree);
router.get('/tree/:departmentId', authenticateUser, getDepartmentTree);

// Get folder subtree starting from specific folder
router.get('/folder/:folderId/tree', authenticateUser, getFolderTree);

export default router;