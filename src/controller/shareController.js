// controllers/shareController.js

import mongoose from "mongoose";
import createHttpError from "http-errors";
import FolderModel from "../models/folderModel.js";
import DocumentModel from "../models/documentModel.js";
import DepartmentModel from "../models/departmentModel.js";
import ActivityLog from "../models/activityModel.js";
import AccessControlModel from "../models/accessControlModel.js";
import UserModel from "../models/userModel.js";
import {
  sanitizeAndValidateId,
  validateRequest
} from "../utils/helper.js";
import {
  getResourceAccessDetailsSchema,
  shareResourceSchema,
  updateUserPermissionsSchema,
  updateGroupPermissionsSchema,
  removeUserAccessSchema,
  removeGroupAccessSchema,
  bulkRemoveAccessSchema
} from "../validation/shareValidation.js";

/**
 * Helper function to get user info for activity logging
 */
const getUserInfo = (user) => ({
  name: user.name || user.username || "Unknown User",
  email: user.email || "",
  avatar: user.avatar || user.profilePicture || null
});

/**
 * Helper function to get the appropriate model based on resource type
 */
const getResourceModel = (resourceType) => {
  const normalizedType = resourceType.toUpperCase();

  switch (normalizedType) {
    case "FOLDER":
      return FolderModel;
    case "DOCUMENT":
      return DocumentModel;
    default:
      throw createHttpError(400, `Invalid resource type: ${resourceType}`);
  }
};

/**
 * Helper function to get department for a resource
 */
const getResourceDepartment = async (resource, resourceType) => {
  const normalizedType = resourceType.toUpperCase();

  // Direct departmentId lookup for both folders and documents
  if (resource.departmentId) {
    return await DepartmentModel.findById(resource.departmentId);
  }

  // Fallback: For folders, use getDepartment method if available
  if (normalizedType === "FOLDER" && typeof resource.getDepartment === "function") {
    return await resource.getDepartment();
  }

  return null;
};

/**
 * Helper function to log share activity based on resource type
 */
const logShareActivity = async (userId, resource, resourceType, sharedWith, userInfo) => {
  const normalizedType = resourceType.toUpperCase();

  try {
    if (normalizedType === "FOLDER") {
      await ActivityLog.logFolderShare(userId, resource, sharedWith, userInfo);
    } else if (normalizedType === "DOCUMENT") {
      await ActivityLog.logFileShare(userId, resource, sharedWith, userInfo);
    }
  } catch (logError) {
    console.error("Failed to log share activity:", logError);
    // Don't throw - activity log failures shouldn't break the share operation
  }
};

/**
 * @desc    Get complete access details for a resource (for share dialog)
 * @route   GET /api/v1/share/:resourceType/:resourceId
 * @access  Private
 */
export const getResourceAccessDetails = async (req, res, next) => {
  try {
    // ✅ Validate request
    const parsed = getResourceAccessDetailsSchema.safeParse({ params: req.params });
    validateRequest(parsed);

    const { resourceType, resourceId } = parsed.data.params;
    const sanitizedResourceId = sanitizeAndValidateId(resourceId, `${resourceType} ID`);
    const normalizedType = resourceType.toUpperCase();

    // Get the resource model and fetch resource
    const ResourceModel = getResourceModel(resourceType);
    const resource = await ResourceModel.findById(sanitizedResourceId)
      .populate("createdBy", "email username")
      .lean();

    if (!resource) {
      throw createHttpError(404, `${resourceType} not found`);
    }

    // ✅ Get ALL ACL entries for this resource (finds all users with any access)
    const aclEntries = await AccessControlModel.find({
      resourceType: normalizedType,
      resourceId: sanitizedResourceId,
      subjectType: "USER"
    })
      .populate("grantedBy", "email username")
      .lean();

    // ✅ Fetch ALL users who have access
    const userIds = aclEntries.map(acl => acl.subjectId);
    const users = await UserModel.find({ _id: { $in: userIds } })
      .select("email username")
      .lean();

    // ✅ Map each user with their specific permissions
    const userMap = new Map(users.map(u => [u._id.toString(), u]));
    const usersWithAccess = aclEntries.map(acl => {
      const user = userMap.get(acl.subjectId.toString());
      return {
        userId: user?._id,
        email: user?.email,
        username: user?.username,
        permissions: acl.permissions, // Shows what this user can do (view, download, etc.)
        grantedBy: acl.grantedBy,     // Shows who gave them access
        grantedAt: acl.createdAt       // Shows when access was granted
      };
    });

    return res.status(200).json({
      success: true,
      message: "Access details retrieved successfully",
      data: {
        resource: {
          resourceType: normalizedType,
          resourceId: sanitizedResourceId,
          name: resource.name,
          path: resource.path
        },
        owner: {
          userId: resource.createdBy._id,
          email: resource.createdBy.email,
          username: resource.createdBy.username,
          role: "Owner"
        },
        usersWithAccess,  // ✅ Array of ALL users with access and their permissions
        summary: {
          totalUsers: usersWithAccess.length,
          totalAccessEntries: aclEntries.length
        }
      }
    });
  } catch (error) {
    next(error);
  }
};
/**
 * @desc    Share resource with users/groups (add/update permissions)
 * @route   POST /api/v1/share/:resourceType/:resourceId
 * @access  Private - Requires 'share' permission
 */
export const shareResource = async (req, res, next) => {
  try {
    const { resourceType, resourceId } = req.params;
    const { users = [], groups = [] } = req.body;
    const grantedBy = req.user._id || req.user.id;

    // Validate inputs
    if (!resourceId || !resourceType) {
      throw createHttpError(400, "Resource type and ID are required");
    }

    if (!Array.isArray(users) && !Array.isArray(groups)) {
      throw createHttpError(400, "Users or groups must be arrays");
    }

    if (users.length === 0 && groups.length === 0) {
      throw createHttpError(400, "At least one user or group must be specified");
    }

    const sanitizedResourceId = sanitizeAndValidateId(resourceId, `${resourceType} ID`);
    const normalizedType = resourceType.toUpperCase();

    // Check if resource exists
    let resource;
    if (normalizedType === "FOLDER") {
      resource = await FolderModel.findById(sanitizedResourceId);
    } else if (normalizedType === "DOCUMENT") {
      resource = await DocumentModel.findById(sanitizedResourceId);
    } else {
      throw createHttpError(400, `Invalid resource type: ${resourceType}`);
    }

    if (!resource) {
      throw createHttpError(404, `${resourceType} not found`);
    }

    // Check if resource is deleted
    if (resource.isDeleted) {
      throw createHttpError(400, `Cannot share deleted ${resourceType.toLowerCase()}`);
    }

    // Get department for ACL checks
    const department = await DepartmentModel.findById(resource.departmentId);
    if (!department) {
      throw createHttpError(500, 'Department not found');
    }

    const sharedWith = [];
    const errors = [];

    // Import ACL helper
    const { needsACL } = await import('../utils/helper/aclHelpers.js');

    // ✅ Share with USERS
    for (const userShare of users) {
      try {
        // Validate user share object
        if (!userShare.userId) {
          throw new Error("User ID is required");
        }
        
        if (!userShare.permissions || !Array.isArray(userShare.permissions)) {
          throw new Error("Permissions array is required");
        }

        const targetUserId = sanitizeAndValidateId(userShare.userId, 'User ID');

        const targetUser = await UserModel.findById(targetUserId);
        if (!targetUser) {
          throw new Error('User not found');
        }
        
        if (!targetUser.isActive) {
          throw new Error('User is inactive');
        }

        // Check if user needs ACL
        if (needsACL(targetUser, department)) {
          const acl = await AccessControlModel.grantToSubject(
            normalizedType,
            sanitizedResourceId,
            'USER',
            targetUserId,
            userShare.permissions,
            grantedBy
          );

          sharedWith.push({
            subjectType: 'USER',
            subjectId: targetUserId,
            subjectName: targetUser.username || targetUser.email,
            permissions: acl.permissions
          });
        } else {
          // User has implicit access (admin/owner)
          sharedWith.push({
            subjectType: 'USER',
            subjectId: targetUserId,
            subjectName: targetUser.username || targetUser.email,
            permissions: ['view', 'download', 'upload', 'delete', 'share'],
            note: 'User has implicit access (admin/owner)'
          });
        }
      } catch (error) {
        console.error(`Error sharing with user ${userShare.userId}:`, error);
        errors.push({
          userId: userShare.userId,
          type: 'USER',
          error: error.message
        });
      }
    }

    // ✅ Share with GROUPS
    for (const groupShare of groups) {
      try {
        // Validate group share object
        if (!groupShare.groupId) {
          throw new Error("Group ID is required");
        }
        
        if (!groupShare.permissions || !Array.isArray(groupShare.permissions)) {
          throw new Error("Permissions array is required");
        }

        const targetGroupId = sanitizeAndValidateId(groupShare.groupId, 'Group ID');

        // Check if group exists in ACL (since we don't have a Group model)
        // We'll validate by checking if this groupId has been used before
        // or just trust the frontend sends valid groupIds
        
        // Grant permissions via ACL
        const acl = await AccessControlModel.grantToSubject(
          normalizedType,
          sanitizedResourceId,
          'GROUP',
          targetGroupId,
          groupShare.permissions,
          grantedBy
        );

        sharedWith.push({
          subjectType: 'GROUP',
          subjectId: targetGroupId,
          subjectName: groupShare.groupName || `Group ${targetGroupId}`, // Use provided name or fallback
          permissions: acl.permissions
        });
      } catch (error) {
        console.error(`Error sharing with group ${groupShare.groupId}:`, error);
        errors.push({
          groupId: groupShare.groupId,
          type: 'GROUP',
          error: error.message
        });
      }
    }

    // ✅ ACTIVITY LOG
    if (sharedWith.length > 0) {
      try {
        await ActivityLog.logFileShare(
          grantedBy,
          resource,
          sharedWith,
          getUserInfo(req.user)
        );
      } catch (logError) {
        console.error('Failed to log share activity:', logError);
        // Don't fail the request if logging fails
      }
    }

    // Return appropriate status
    if (sharedWith.length === 0 && errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Failed to share resource with any users or groups',
        data: {
          errors
        }
      });
    }

    return res.status(200).json({
      success: true,
      message: `${resourceType} shared with ${sharedWith.length} subject(s)`,
      data: {
        resource: {
          _id: resource._id,
          name: resource.name,
          path: resource.path,
          type: normalizedType
        },
        sharedWith,
        errors: errors.length > 0 ? errors : undefined
      }
    });

  } catch (error) {
    console.error('Share resource error:', error);
    next(error);
  }
};/**
 * @desc    Update user permissions on resource
 * @route   PATCH /api/v1/share/:resourceType/:resourceId/user/:userId
 * @access  Private - Requires 'share' permission
 */
export const updateUserPermissions = async (req, res, next) => {
  try {
    // ✅ Validate request
    const parsed = updateUserPermissionsSchema.safeParse({
      params: req.params,
      body: req.body
    });
    validateRequest(parsed);

    const { resourceType, resourceId, userId } = parsed.data.params;
    const { permissions } = parsed.data.body;
    const grantedBy = req.user.id || req.user._id;

    const sanitizedResourceId = sanitizeAndValidateId(resourceId, `${resourceType} ID`);
    const sanitizedUserId = sanitizeAndValidateId(userId, "User ID");
    const normalizedType = resourceType.toUpperCase();

    // Get resource model and verify resource exists
    const ResourceModel = getResourceModel(resourceType);
    const resource = await ResourceModel.findById(sanitizedResourceId);

    if (!resource) {
      throw createHttpError(404, `${resourceType} not found`);
    }

    // Check if user exists
    const user = await UserModel.findById(sanitizedUserId);
    if (!user || !user.isActive) {
      throw createHttpError(404, "User not found or inactive");
    }

    // Update permissions
    const acl = await AccessControlModel.grantToSubject(
      normalizedType,
      sanitizedResourceId,
      "USER",
      sanitizedUserId,
      permissions,
      grantedBy
    );

    return res.status(200).json({
      success: true,
      message: "User permissions updated successfully",
      data: {
        subjectType: "USER",
        subjectId: sanitizedUserId,
        subjectName: user.username || user.email,
        permissions: acl.permissions
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update group permissions on resource
 * @route   PATCH /api/v1/share/:resourceType/:resourceId/group/:groupId
 * @access  Private - Requires 'share' permission
 */
export const updateGroupPermissions = async (req, res, next) => {
  try {
    // ✅ Validate request
    const parsed = updateGroupPermissionsSchema.safeParse({
      params: req.params,
      body: req.body
    });
    validateRequest(parsed);

    const { resourceType, resourceId, groupId } = parsed.data.params;
    const { permissions } = parsed.data.body;
    const grantedBy = req.user.id || req.user._id;

    const sanitizedResourceId = sanitizeAndValidateId(resourceId, `${resourceType} ID`);
    const sanitizedGroupId = sanitizeAndValidateId(groupId, "Group ID");
    const normalizedType = resourceType.toUpperCase();

    // Get resource model and verify resource exists
    const ResourceModel = getResourceModel(resourceType);
    const resource = await ResourceModel.findById(sanitizedResourceId);

    if (!resource) {
      throw createHttpError(404, `${resourceType} not found`);
    }

    // Check if group exists
    const GroupModel = mongoose.model("Group");
    const group = await GroupModel.findById(sanitizedGroupId);
    if (!group || !group.isActive) {
      throw createHttpError(404, "Group not found or inactive");
    }

    // Update permissions
    const acl = await AccessControlModel.grantToSubject(
      normalizedType,
      sanitizedResourceId,
      "GROUP",
      sanitizedGroupId,
      permissions,
      grantedBy
    );

    return res.status(200).json({
      success: true,
      message: "Group permissions updated successfully",
      data: {
        subjectType: "GROUP",
        subjectId: sanitizedGroupId,
        subjectName: group.name,
        permissions: acl.permissions
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Remove user access from resource
 * @route   DELETE /api/v1/share/:resourceType/:resourceId/user/:userId
 * @access  Private - Requires 'share' permission
 */
export const removeUserAccess = async (req, res, next) => {
  try {
    // ✅ Validate request
    const parsed = removeUserAccessSchema.safeParse({ params: req.params });
    validateRequest(parsed);

    const { resourceType, resourceId, userId } = parsed.data.params;

    const sanitizedResourceId = sanitizeAndValidateId(resourceId, `${resourceType} ID`);
    const sanitizedUserId = sanitizeAndValidateId(userId, "User ID");
    const normalizedType = resourceType.toUpperCase();

    // Get resource model and verify resource exists
    const ResourceModel = getResourceModel(resourceType);
    const resource = await ResourceModel.findById(sanitizedResourceId);

    if (!resource) {
      throw createHttpError(404, `${resourceType} not found`);
    }

    // Remove access
    const result = await AccessControlModel.revokeFromSubject(
      normalizedType,
      sanitizedResourceId,
      "USER",
      sanitizedUserId
    );

    if (result.deletedCount === 0) {
      throw createHttpError(404, "Access entry not found for this user");
    }

    return res.status(200).json({
      success: true,
      message: "User access removed successfully"
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Remove group access from resource
 * @route   DELETE /api/v1/share/:resourceType/:resourceId/group/:groupId
 * @access  Private - Requires 'share' permission
 */
export const removeGroupAccess = async (req, res, next) => {
  try {
    // ✅ Validate request
    const parsed = removeGroupAccessSchema.safeParse({ params: req.params });
    validateRequest(parsed);

    const { resourceType, resourceId, groupId } = parsed.data.params;

    const sanitizedResourceId = sanitizeAndValidateId(resourceId, `${resourceType} ID`);
    const sanitizedGroupId = sanitizeAndValidateId(groupId, "Group ID");
    const normalizedType = resourceType.toUpperCase();

    // Get resource model and verify resource exists
    const ResourceModel = getResourceModel(resourceType);
    const resource = await ResourceModel.findById(sanitizedResourceId);

    if (!resource) {
      throw createHttpError(404, `${resourceType} not found`);
    }

    // Remove access
    const result = await AccessControlModel.revokeFromSubject(
      normalizedType,
      sanitizedResourceId,
      "GROUP",
      sanitizedGroupId
    );

    if (result.deletedCount === 0) {
      throw createHttpError(404, "Access entry not found for this group");
    }

    return res.status(200).json({
      success: true,
      message: "Group access removed successfully"
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Bulk remove access from resource (users and groups)
 * @route   DELETE /api/v1/share/:resourceType/:resourceId/bulk
 * @access  Private - Requires 'share' permission
 */
export const bulkRemoveAccess = async (req, res, next) => {
  try {
    // ✅ Validate request
    const parsed = bulkRemoveAccessSchema.safeParse({
      params: req.params,
      body: req.body
    });
    validateRequest(parsed);

    const { resourceType, resourceId } = parsed.data.params;
    const { users = [], groups = [] } = parsed.data.body;

    const sanitizedResourceId = sanitizeAndValidateId(resourceId, `${resourceType} ID`);
    const normalizedType = resourceType.toUpperCase();

    // Verify resource exists
    const ResourceModel = getResourceModel(resourceType);
    const resource = await ResourceModel.findById(sanitizedResourceId);

    if (!resource) {
      throw createHttpError(404, `${resourceType} not found`);
    }

    const removed = [];
    const errors = [];

    // Remove user access
    for (const userId of users) {
      try {
        const sanitizedUserId = sanitizeAndValidateId(userId, "User ID");

        const result = await AccessControlModel.revokeFromSubject(
          normalizedType,
          sanitizedResourceId,
          "USER",
          sanitizedUserId
        );

        if (result.deletedCount > 0) {
          removed.push({
            subjectType: "USER",
            subjectId: sanitizedUserId
          });
        }
      } catch (error) {
        errors.push({
          userId,
          type: "USER",
          error: error.message
        });
      }
    }

    // Remove group access
    for (const groupId of groups) {
      try {
        const sanitizedGroupId = sanitizeAndValidateId(groupId, "Group ID");

        const result = await AccessControlModel.revokeFromSubject(
          normalizedType,
          sanitizedResourceId,
          "GROUP",
          sanitizedGroupId
        );

        if (result.deletedCount > 0) {
          removed.push({
            subjectType: "GROUP",
            subjectId: sanitizedGroupId
          });
        }
      } catch (error) {
        errors.push({
          groupId,
          type: "GROUP",
          error: error.message
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: `Access removed for ${removed.length} subject(s)`,
      data: {
        removed,
        errors: errors.length > 0 ? errors : undefined
      }
    });
  } catch (error) {
    next(error);
  }
};