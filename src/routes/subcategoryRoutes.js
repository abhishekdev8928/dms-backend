// subcategoryRoutes.js
import express from 'express';
import {
  getSubcategories,
  getSubcategoriesByCategory,
  getSubcategoryById,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory
} from '../controller/subCategoryController.js';
import { authenticateUser } from '../middleware/authMiddleware.js';

const router = express.Router();

// router.use(authenticate);

router.get('/', getSubcategories);
router.post('/',authenticateUser, createSubcategory);
router.get('/category/:categoryId', authenticateUser, getSubcategoriesByCategory);
router.get('/:id',authenticateUser, getSubcategoryById);
router.patch('/:id',authenticateUser, updateSubcategory);
router.delete('/:id',authenticateUser, deleteSubcategory);

export default router;