// categoryRoutes.js
import express from 'express';
import {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory
} from '../controller/categoryController.js';
import { authenticateUser } from '../middleware/authMiddleware.js';
// import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// router.use(authenticate);

router.get('/', getCategories);
router.post('/', authenticateUser , createCategory);
router.get('/:id', getCategoryById);
router.patch('/:id', updateCategory);
router.delete('/:id', deleteCategory);

export default router;