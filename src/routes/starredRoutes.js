import express from "express";
import { 
  addStarred, 
  removeStarred, 
  getStarredItems,
  bulkUpdateStarred 
} from "../controller/starredController.js";
import { authenticateUser } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(authenticateUser);

/**
 * @route   POST /api/starred/bulk
 * @desc    Bulk update starred status for multiple items
 * @access  Private
 * @body    { fileIds: string[], folderIds: string[], starred: boolean }
 */
router.post("/bulk", bulkUpdateStarred);

/**
 * @route   POST /api/starred/add
 * @desc    Add item to starred
 * @access  Private
 * @body    { id: string, type: "folder" | "file" }
 */
router.post("/add", addStarred);

/**
 * @route   POST /api/starred/remove
 * @desc    Remove item from starred
 * @access  Private
 * @body    { id: string, type: "folder" | "file" }
 */
router.post("/remove", removeStarred);

/**
 * @route   GET /api/starred
 * @desc    Get all starred items for current user
 * @access  Private
 */
router.get("/", getStarredItems);

export default router;