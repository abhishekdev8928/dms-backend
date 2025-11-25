import express from "express";
import {
  bulkSoftDelete,
  toggleStarred,
  addStarred,
  removeStarred,
  bulkToggleStarred,
  getStarredItems
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

// ==========================================
// STARRED ROUTES
// ==========================================

/**
 * @route   GET /api/v1/starred
 * @desc    Get all starred items for current user
 * @access  Private
 */
router.get("/starred", getStarredItems);

/**
 * @route   POST /api/v1/starred/toggle
 * @desc    Toggle starred status for a single item
 * @access  Private
 * @body    { id: string, type: "folder" | "file" }
 */
router.post("/starred/toggle", toggleStarred);

/**
 * @route   POST /api/v1/starred/add
 * @desc    Add single item to starred
 * @access  Private
 * @body    { id: string, type: "folder" | "file" }
 */
router.post("/starred/add", addStarred);

/**
 * @route   POST /api/v1/starred/remove
 * @desc    Remove single item from starred
 * @access  Private
 * @body    { id: string, type: "folder" | "file" }
 */
router.post("/starred/remove", removeStarred);

/**
 * @route   POST /api/v1/starred/bulk-toggle
 * @desc    Bulk toggle starred status for multiple items
 * @access  Private
 * @body    { items: [{ id: string, type: "folder" | "file" }] }
 */
router.post("/starred/bulk-toggle", bulkToggleStarred);

export default router;