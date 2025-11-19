// routes/trashRoutes.js

import express from 'express';
import {
  getTrashItems,
  restoreItem,
  permanentlyDeleteItem,
  bulkRestoreItems,
  bulkPermanentlyDeleteItems,
} from '../controller/restoreController.js';
import { authenticateUser } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateUser);

// Get trash items with pagination
router.get('/', getTrashItems);

// Bulk restore
router.post('/restore/bulk', bulkRestoreItems);

// Restore single item
router.post('/restore/:id', restoreItem);

// Permanently delete single item
router.delete('/:id', permanentlyDeleteItem);




// Bulk permanently delete
router.post('/delete/bulk', bulkPermanentlyDeleteItems);

export default router;