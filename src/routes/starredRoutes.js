// routes/starredRoutes.js

import express from "express";
import { 
  addStarred, 
  removeStarred, 
  getStarredItems,
  bulkUpdateStarred 
} from "../controller/starredController.js";
import { authenticateUser } from "../middleware/authMiddleware.js";
import { checkPermission } from "../middleware/checkPermission.js";

const router = express.Router();

/**
 * ============================================
 * ADAPTER MIDDLEWARE
 * ============================================
 * Converts body params to URL params format for reusing checkPermission
 */
const adaptStarredParams = (req, res, next) => {
  const { id, type } = req.body;
  
  if (!id || !type) {
    return res.status(400).json({
      success: false,
      message: "Item id and type are required"
    });
  }
  
  // Validate type
  const normalizedType = type.toLowerCase();
  if (!["folder", "file", "document"].includes(normalizedType)) {
    return res.status(400).json({
      success: false,
      message: "Invalid item type. Must be 'folder' or 'file'"
    });
  }
  
  // Map to resource type
  const resourceType = normalizedType === "file" ? "DOCUMENT" : "FOLDER";
  
  // Move id to params so checkPermission can use it
  req.params.id = id;
  req.starredResourceType = resourceType;
  
  next();
};

/**
 * ============================================
 * STARRED ROUTES
 * ============================================
 * Base URL: /api/starred
 * All routes require authentication
 * 
 * Permission Logic:
 * - Users can only star/unstar items they have 'view' permission on
 * - Middleware validates permissions before reaching controller
 * - Bulk operations validate ALL items before proceeding
 */

// Apply authentication to ALL starred routes
router.use(authenticateUser);

/**
 * @route   GET /api/starred
 * @desc    Get all starred items for current user
 * @access  Private
 * @returns Array of starred folders and documents
 * @note    Controller filters out items user no longer has access to
 * @note    Only returns non-deleted items
 * @note    Sorted by most recently starred (starredAt desc)
 * @note    MUST BE FIRST to avoid route conflicts
 */
router.get("/", getStarredItems);

/**
 * @route   POST /api/starred/bulk
 * @desc    Bulk update starred status for multiple items
 * @access  Private - Requires 'view' permission on ALL items
 * @body    { fileIds: string[], folderIds: string[], starred: boolean }
 * @note    Controller validates view access on all items using existing helpers
 * @note    Operation fails if user lacks permission on ANY item
 * @note    Validates items exist and are not deleted
 */
router.post("/bulk", bulkUpdateStarred);

/**
 * @route   POST /api/starred/add
 * @desc    Add single item to starred
 * @access  Private - Requires 'view' permission on item
 * @body    { id: string, type: "folder" | "file" }
 * @middleware adaptStarredParams - Converts body params to URL params format
 * @middleware checkPermission - Reuses existing view permission check
 * @note    Type "file" maps to "document" internally
 * @note    Validates item exists and is not deleted
 * @note    Attaches resource to req.resource for controller
 */
router.post("/add", adaptStarredParams, (req, res, next) => {
  checkPermission(req.starredResourceType, "view", "id")(req, res, next);
}, addStarred);

/**
 * @route   POST /api/starred/remove
 * @desc    Remove single item from starred
 * @access  Private - Requires 'view' permission on item
 * @body    { id: string, type: "folder" | "file" }
 * @middleware adaptStarredParams - Converts body params to URL params format
 * @middleware checkPermission - Reuses existing view permission check
 * @note    Type "file" maps to "document" internally
 * @note    Validates item exists and is not deleted
 * @note    Attaches resource to req.resource for controller
 */
router.post("/remove", adaptStarredParams, (req, res, next) => {
  checkPermission(req.starredResourceType, "view", "id")(req, res, next);
}, removeStarred);

export default router;