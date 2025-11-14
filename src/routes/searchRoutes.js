import express from 'express';
import {
  search,
  quickSearch,
  getFilterTypes,
  getAllUsers
} from '../controller/searchController.js';
import { authenticateUser } from '../middleware/authMiddleware.js';



const router = express.Router();



router.use(authenticateUser)

/**
 * @route   GET /api/search
 * @desc    Main search endpoint - Search folders and documents by name
 * @query   {string} query - Search term (required, min 2 chars)
 * @query   {string} type - Filter type: 'all', 'folders', 'pdf', 'docs', 'images', 'videos', 'zip' (default: 'all')
 * @query   {string} modifiedFrom - Modified date from (ISO format)
 * @query   {string} modifiedTo - Modified date to (ISO format)
 * @query   {number} page - Page number (default: 1)
 * @query   {number} limit - Results per page (default: 20)
 * @access  Private (add auth middleware as needed)
 * 
 * @example GET /api/search?query=report&type=pdf&page=1&limit=20
 * @example GET /api/search?query=budget&type=all&modifiedFrom=2024-01-01&modifiedTo=2024-12-31
 */
router.get('/', search);

/**
 * @route   GET /api/search/quick
 * @desc    Quick search for autocomplete/suggestions
 * @query   {string} query - Search term (required, min 2 chars)
 * @query   {number} limit - Max results (default: 10)
 * @access  Private (add auth middleware as needed)
 * 
 * @example GET /api/search/quick?query=rep&limit=10
 */
router.get('/quick', quickSearch);

/**
 * @route   GET /api/search/filter-types
 * @desc    Get available filter types with result counts
 * @query   {string} query - Optional search term to get counts for specific search
 * @access  Private (add auth middleware as needed)
 * 
 * @example GET /api/search/filter-types
 * @example GET /api/search/filter-types?query=report
 */
router.get('/filter-types', authenticateUser, getFilterTypes);



router.get("/users",authenticateUser,getAllUsers)

export default router;