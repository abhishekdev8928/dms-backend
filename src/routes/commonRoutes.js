import express from "express";
import {
  bulkSoftDelete
} from "../controller/commonController.js";
import { authenticateUser } from "../middleware/authMiddleware.js";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateUser);

// ==========================================
// DELETION ROUTES
// ==========================================

/**
 * @route   DELETE /api/v1/items
 * @desc    Bulk soft delete files and/or folders
 * @access  Private
 * @body    { fileIds?: string[], folderIds?: string[] }
 */
router.delete("/", bulkSoftDelete);

export default router;