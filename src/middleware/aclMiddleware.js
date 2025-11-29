// middleware/aclMiddleware.js

import createHttpError from "http-errors";
import ACLModel from "../models/accessControlModel.js";
import FolderModel from "../models/folderModel.js";
import DepartmentModel from "../models/departmentModel.js";
import UserModel from "../models/userModel.js";

/**
 * ============================================
 * ACL MIDDLEWARE - Two-Layer Permission System
 * ============================================
 *
 * Layer 1: Role-Based Access Control (System Level)
 * Layer 2: Visibility-Based Access Control (Item Level)
 */

/**
 * Helper: Check if user has required role for department access
 * Layer 1: Role Check
 */
const checkRoleAccess = async (userId, departmentId, userRole) => {
  // Super Admin has access to everything
  if (userRole === "super_admin") {
    return true;
  }

  // Get user with populated departments
  const user = await UserModel.findById(userId).populate("departments");

  if (!user) {
    return false;
  }

  // Admin: Check if they have access to this department
  if (userRole === "admin") {
    const hasAccess = user.departments.some(
      (dept) => dept._id.toString() === departmentId.toString()
    );
    return hasAccess;
  }

  // Department Owner: Check if they own this department
  if (userRole === "department_owner") {
    const hasAccess = user.departments.some(
      (dept) => dept._id.toString() === departmentId.toString()
    );
    return hasAccess;
  }

  // Member Bank User: Check if they have access (implement your bank logic)
  if (userRole === "member_bank") {
    // TODO: Implement member bank specific access check
    return true; // Placeholder
  }

  // General User: Has basic access
  if (userRole === "user") {
    return true;
  }

  return false;
};

/**
 * Helper: Get ACL for a resource with inheritance
 * Layer 2: Visibility & Permission Check
 */
const getEffectiveACL = async (resourceId, resourceType) => {
  // Try to find direct ACL
  let acl = await ACLModel.findById(resourceId);

  // If ACL exists and doesn't inherit, return it
  if (acl && !acl.inheritsFromParent) {
    return acl;
  }

  // If ACL inherits or doesn't exist, walk up the tree
  if (resourceType === "folder") {
    const folder = await FolderModel.findById(resourceId);

    if (!folder) {
      return null;
    }

    // If folder has parent, check parent's ACL
    if (folder.parent_id) {
      // Check if parent is a folder or department
      const parentFolder = await FolderModel.findById(folder.parent_id);

      if (parentFolder) {
        return getEffectiveACL(folder.parent_id, "folder");
      } else {
        // Parent might be a department
        const parentDept = await DepartmentModel.findById(folder.parent_id);
        if (parentDept) {
          // Department level - check if there's an ACL
          const deptACL = await ACLModel.findById(folder.parent_id);
          return deptACL || null;
        }
      }
    }
  }

  return acl; // Return whatever we have (might be null)
};

/**
 * Helper: Check if user has specific permission on resource
 */
const hasPermission = async (userId, userRole, resourceId, resourceType, requiredPermission) => {
  // Super Admin bypasses everything
  if (userRole === "super_admin") {
    return true;
  }

  const acl = await getEffectiveACL(resourceId, resourceType);

  if (!acl) {
    return false;
  }

  // Normal logic for other roles
  if (acl.visibility === "public") {
    if (requiredPermission === "view") return true;
  }

  if (acl.visibility === "private") {
    const isCreator = acl.createdBy.toString() === userId.toString();
    return isCreator;
  }

  if (acl.visibility === "restricted") {
    const userGrant = acl.users.find(u => u.userId.toString() === userId.toString());
    return userGrant?.permissions.includes(requiredPermission) || false;
  }

  return false;
};


/**
 * Main ACL Middleware
 * Checks both Layer 1 (Role) and Layer 2 (Visibility + Permissions)
 */
export const checkFolderPermission = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      const folderId = req.params.id;
      const userId = req.user.id;
      const userRole = req.user.role;

      let folder = await FolderModel.findById(folderId);
      let parentType = "folder";

      if (!folder) {
        // Maybe it's a department
        const dept = await DepartmentModel.findById(folderId);

        if (!dept) {
          throw createHttpError(404, "Folder or department not found");
        }

        req.isDepartment = true;
        req.departmentId = dept._id;
        return next();
      }

      // Get department for this folder
      const department = await folder.getDepartment();

      if (!department) {
        throw createHttpError(404, "Department not found for this folder");
      }

      // ====================================
      // LAYER 1: ROLE CHECK (System Level)
      // ====================================
      const hasRoleAccess = await checkRoleAccess(
        userId,
        department._id,
        userRole
      );

      if (!hasRoleAccess) {
        throw createHttpError(403, "You do not have access to this department");
      }

      // ====================================
      // LAYER 2: VISIBILITY & PERMISSION CHECK
      // ====================================
      const hasItemPermission = await hasPermission(
        userId,
        userRole,
        folderId,
        "folder",
        requiredPermission
      );

      if (!hasItemPermission) {
        throw createHttpError(
          403,
          `You do not have '${requiredPermission}' permission on this folder`
        );
      }

      // Both layers passed - grant access
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Check if user can access parent (for create operations)
 */
export const checkParentPermission = async (req, res, next) => {
  try {
    const { parent_id } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!parent_id) {
      throw createHttpError(400, "parent_id is required");
    }

    // Check if parent is folder or department
    let parent = await FolderModel.findById(parent_id);
    let parentType = "folder";
    let departmentId = null;

    if (parent) {
      // Parent is a folder
      const department = await parent.getDepartment();
      departmentId = department._id;
    } else {
      // Check if parent is department
      parent = await DepartmentModel.findById(parent_id);

      if (!parent) {
        throw createHttpError(404, "Parent folder or department not found");
      }

      parentType = "department";
      departmentId = parent._id;
    }

    // LAYER 1: Role Check
    const hasRoleAccess = await checkRoleAccess(userId, departmentId, userRole);

    if (!hasRoleAccess) {
      throw createHttpError(403, "You do not have access to this department");
    }

    // LAYER 2: Permission Check (need 'upload' permission)
    if (parentType === "folder") {
      const hasUploadPermission = await hasPermission(
        userId,
        userRole,
        parent_id,
        "folder",
        "upload"
      );

      if (!hasUploadPermission) {
        throw createHttpError(
          403,
          "You do not have upload permission in this folder"
        );
      }
    } else {
      // Department level - check if user is admin/owner
      if (!["super_admin", "admin", "department_owner"].includes(userRole)) {
        throw createHttpError(
          403,
          "Only admins and department owners can create folders at department level"
        );
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to attach user's effective permissions on a folder
 * Useful for frontend to show/hide buttons
 */
export const attachUserPermissions = async (req, res, next) => {
  try {
    const folderId = req.params.id;
    const userId = req.user.id;
    const userRole = req.user.role;

    const folder = await FolderModel.findById(folderId);

    if (!folder) {
      return next();
    }

    // Get effective ACL
    const acl = await getEffectiveACL(folderId, "folder");

    // Build permissions object
    const permissions = {
      canView: await hasPermission(
        userId,
        userRole,
        folderId,
        "folder",
        "view"
      ),
      canUpload: await hasPermission(
        userId,
        userRole,
        folderId,
        "folder",
        "upload"
      ),
      canDownload: await hasPermission(
        userId,
        userRole,
        folderId,
        "folder",
        "download"
      ),
      canDelete: await hasPermission(
        userId,
        userRole,
        folderId,
        "folder",
        "delete"
      ),
      canChangeVisibility: await hasPermission(
        userId,
        userRole,
        folderId,
        "folder",
        "change_visibility"
      ),
      visibility: acl?.visibility || "private",
      inheritsFromParent: acl?.inheritsFromParent || false,
    };

    // Attach to request
    req.folderPermissions = permissions;

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Export helper functions for use in controllers
 */
export const ACLHelpers = {
  checkRoleAccess,
  getEffectiveACL,
  hasPermission,
};
