// routes/shareRoutes.js

import express from "express";
import {
  getResourceAccessDetailsSchema,
  shareResourceSchema,
  updateUserPermissionsSchema,
  updateGroupPermissionsSchema,
  removeUserAccessSchema,
  removeGroupAccessSchema,
  bulkRemoveAccessSchema
} from "../validation/shareValidation.js";
import {
  getResourceAccessDetails,
  shareResource,
  updateUserPermissions,
  updateGroupPermissions,
  removeUserAccess,
  removeGroupAccess,
  bulkRemoveAccess
} from "../controller/shareController.js";
import { authenticateUser } from "../middleware/authMiddleware.js";
import { canShare } from "../middleware/checkPermission.js";

const router = express.Router();

// ============================================================
// AUTHENTICATION - All routes require authentication
// ============================================================
router.use(authenticateUser);

// ============================================================
// GET ACCESS DETAILS
// ============================================================
/**
 * @route   GET /api/v1/share/:resourceType/:resourceId
 * @desc    Get complete access details for a resource (users & groups with permissions)
 * @access  Private - User must have access to the resource
 * @example GET /api/v1/share/folder/507f1f77bcf86cd799439011
 * @example GET /api/v1/share/document/507f1f77bcf86cd799439012
 */
router.get(
  "/:resourceType/:resourceId",
  getResourceAccessDetails
);

// ============================================================
// SHARE RESOURCE (ADD/UPDATE ACCESS)
// ============================================================
/**
 * @route   POST /api/v1/share/:resourceType/:resourceId
 * @desc    Share resource with users and/or groups (add or update permissions)
 * @access  Private - Requires 'share' permission on resource
 * @body    { users: [{ userId, permissions }], groups: [{ groupId, permissions }] }
 * @example POST /api/v1/share/folder/507f1f77bcf86cd799439011
 *          Body: { 
 *            "users": [{ "userId": "507f1f77bcf86cd799439013", "permissions": ["view", "download"] }],
 *            "groups": [{ "groupId": "507f1f77bcf86cd799439014", "permissions": ["view"] }]
 *          }
 */
router.post(
  "/:resourceType/:resourceId",
  shareResource
);

// ============================================================
// UPDATE USER PERMISSIONS
// ============================================================
/**
 * @route   PATCH /api/v1/share/:resourceType/:resourceId/user/:userId
 * @desc    Update permissions for a specific user on resource
 * @access  Private - Requires 'share' permission on resource
 * @body    { permissions: ["view", "download", "upload"] }
 * @example PATCH /api/v1/share/folder/507f1f77bcf86cd799439011/user/507f1f77bcf86cd799439013
 *          Body: { "permissions": ["view", "download", "upload"] }
 */
router.patch(
  "/:resourceType/:resourceId/user/:userId",
  updateUserPermissions
);

// ============================================================
// UPDATE GROUP PERMISSIONS
// ============================================================
/**
 * @route   PATCH /api/v1/share/:resourceType/:resourceId/group/:groupId
 * @desc    Update permissions for a specific group on resource
 * @access  Private - Requires 'share' permission on resource
 * @body    { permissions: ["view", "download"] }
 * @example PATCH /api/v1/share/folder/507f1f77bcf86cd799439011/group/507f1f77bcf86cd799439014
 *          Body: { "permissions": ["view", "download"] }
 */
router.patch(
  "/:resourceType/:resourceId/group/:groupId",
  updateGroupPermissions
);

// ============================================================
// REMOVE USER ACCESS
// ============================================================
/**
 * @route   DELETE /api/v1/share/:resourceType/:resourceId/user/:userId
 * @desc    Remove a specific user's access from resource
 * @access  Private - Requires 'share' permission on resource
 * @example DELETE /api/v1/share/folder/507f1f77bcf86cd799439011/user/507f1f77bcf86cd799439013
 */
router.delete(
  "/:resourceType/:resourceId/user/:userId",
  removeUserAccess
);

// ============================================================
// REMOVE GROUP ACCESS
// ============================================================
/**
 * @route   DELETE /api/v1/share/:resourceType/:resourceId/group/:groupId
 * @desc    Remove a specific group's access from resource
 * @access  Private - Requires 'share' permission on resource
 * @example DELETE /api/v1/share/folder/507f1f77bcf86cd799439011/group/507f1f77bcf86cd799439014
 */
router.delete(
  "/:resourceType/:resourceId/group/:groupId",
  removeGroupAccess
);

// ============================================================
// BULK REMOVE ACCESS
// ============================================================
/**
 * @route   DELETE /api/v1/share/:resourceType/:resourceId/bulk
 * @desc    Remove multiple users and/or groups access from resource at once
 * @access  Private - Requires 'share' permission on resource
 * @body    { users: ["userId1", "userId2"], groups: ["groupId1"] }
 * @example DELETE /api/v1/share/folder/507f1f77bcf86cd799439011/bulk
 *          Body: { 
 *            "users": ["507f1f77bcf86cd799439013", "507f1f77bcf86cd799439015"],
 *            "groups": ["507f1f77bcf86cd799439014"]
 *          }
 */
router.delete(
  "/:resourceType/:resourceId/bulk",
  bulkRemoveAccess
);

export default router;