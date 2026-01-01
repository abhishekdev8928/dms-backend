import express from 'express';
import { createUserBySuperAdmin, updateUserDepartments } from '../controller/userManagementController.js';
import { authenticateUser, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateUser);

/**
 * @route   PATCH /api/admin/users/:id
 * @desc    Assign/Update departments for a user
 * @access  SUPER_ADMIN only
 */
router.patch(
  '/:id',
  authorizeRoles('SUPER_ADMIN'),
  updateUserDepartments
);

router.post(
  "/",
  authenticateUser,
  createUserBySuperAdmin
);

export default router;