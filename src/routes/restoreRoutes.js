import { Router } from 'express';
import {
  getTrashItems,
  restoreFolder,
  restoreDocument,
  permanentlyDeleteFolder,
  permanentlyDeleteDocument,
  getTrashStats,
} from '../controller/restoreController.js';
import { authenticateUser } from '../middleware/authMiddleware.js'; // Your auth middleware

const router = Router();

// Apply authentication to all routes
router.use(authenticateUser);

/**
 * GET /api/trash
 * Get all deleted items (folders and documents)
 * Query params: 
 *   - page: number (default: 1)
 *   - limit: number (default: 20)
 *   - search: string (search by name)
 *   - sortBy: string (default: 'deletedAt')
 *   - order: 'asc' | 'desc' (default: 'desc')
 *   - type: 'all' | 'folder' | 'document' (default: 'all')
 *   - deletedBy: 'anyone' | 'me' (default: 'anyone')
 *   - dateDeleted: 'all' | 'last7days' | 'last30days' | 'older' (default: 'all')
 */
router.get('/', getTrashItems);

/**
 * GET /api/trash/stats
 * Get trash statistics (total folders, documents, size)
 */
router.get('/stats', getTrashStats);

/**
 * POST /api/trash/folders/:id/restore
 * Restore a deleted folder and all its descendants
 */
router.post('/folders/:id/restore', restoreFolder);

/**
 * POST /api/trash/documents/:id/restore
 * Restore a deleted document
 */
router.post('/documents/:id/restore', restoreDocument);

/**
 * DELETE /api/trash/folders/:id/permanent
 * Permanently delete a folder and all its contents
 */
router.delete('/folders/:id/permanent', permanentlyDeleteFolder);

/**
 * DELETE /api/trash/documents/:id/permanent
 * Permanently delete a document
 */
router.delete('/documents/:id/permanent', permanentlyDeleteDocument);

export default router;