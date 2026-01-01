// helpers/aclHelpers.js

import AccessControlModel from "../../models/accessControlModel.js";
import FolderModel from "../../models/folderModel.js";
import DocumentModel from "../../models/documentModel.js";
import DepartmentModel from "../../models/departmentModel.js";

const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  DEPARTMENT_OWNER: "DEPARTMENT_OWNER",
};

/**
 * Get resource (folder or document) by ID
 * @param {string} resourceType - 'FOLDER' | 'DOCUMENT'
 * @param {string} resourceId - MongoDB ObjectId
 * @returns {Promise<Object|null>}
 */
export async function getResource(resourceType, resourceId) {
  const type = resourceType.toUpperCase();

  if (type === "FOLDER") {
    return await FolderModel.findById(resourceId);
  } else if (type === "DOCUMENT") {
    return await DocumentModel.findById(resourceId);
  }

  return null;
}

/**
 * Get department for folder or document
 * @param {Object} resource - Folder or Document
 * @returns {Promise<Object|null>}
 */
export async function getDepartment(resource) {
  if (!resource?.departmentId) return null;
  return await DepartmentModel.findById(resource.departmentId);
}

/**
 * Check if user is admin of the department
 * @param {Object} user - User document
 * @param {string} departmentId - Department ObjectId
 * @returns {boolean}
 */
export function isAdminOfDepartment(user, departmentId) {
  if (!user.departments || !departmentId) return false;

  return user.departments.some((dept) => {
    const deptId = dept._id || dept;
    return deptId.toString() === departmentId.toString();
  });
}

/**
 * Check if user has implicit access (no ACL needed)
 * Works for both folders and documents
 * @param {Object} user - User document
 * @param {Object} department - Department document
 * @returns {boolean}
 */
export function hasImplicitAccess(user, department) {
  if (!user || !department) return false;

  // MyDrive Owner → Full access
  if (department.ownerType === "USER") {
    const myDriveId = user.myDriveDepartmentId?._id || user.myDriveDepartmentId;
    return myDriveId && myDriveId.toString() === department._id.toString();
  }

  // Super Admin → Full access to ORG departments
  if (user.role === ROLES.SUPER_ADMIN && department.ownerType === "ORG") {
    return true;
  }

  // Admin / Department Owner → Access to assigned departments
  if (user.role === ROLES.ADMIN || user.role === ROLES.DEPARTMENT_OWNER) {
    return isAdminOfDepartment(user, department._id);
  }

  return false;
}

/**
 * Check if user has direct ACL permission on resource
 * Works for both folders and documents
 * @param {Object} resource - Folder or Document
 * @param {string} resourceType - 'FOLDER' | 'DOCUMENT'
 * @param {string} userId - User ObjectId
 * @param {string} action - 'view' | 'download' | 'upload' | 'delete' | 'share'
 * @param {Array} userGroupIds - User's group IDs
 * @returns {Promise<boolean>}
 */
export async function hasDirectACL(resource, resourceType, userId, action, userGroupIds = []) {
  return await AccessControlModel.userHasPermission(
    resourceType.toUpperCase(),
    resource._id,
    userId,
    action,
    userGroupIds
  );
}

/**
 * Check if user has permission on any parent in the hierarchy
 * Works for both folders and documents
 * @param {Object} resource - Folder or Document
 * @param {string} resourceType - 'FOLDER' | 'DOCUMENT'
 * @param {string} userId - User ObjectId
 * @param {string} action - Permission to check
 * @param {Array} userGroupIds - User's group IDs
 * @returns {Promise<boolean>}
 */
export async function hasParentACL(resource, resourceType, userId, action, userGroupIds = []) {
  let currentResource = resource;
  let currentType = resourceType;

  // Traverse up the hierarchy
  while (true) {
    // Get parent ID
    const parentId = currentResource.parentId;
    if (!parentId) break;

    // Find parent (try folder first, then department)
    let parent = await FolderModel.findById(parentId);
    let parentType = "FOLDER";

    if (!parent || parent.isDeleted) {
      parent = await DepartmentModel.findById(parentId);
      parentType = "DEPARTMENT";
      
      if (!parent || !parent.isActive) break;
    }

    // Check ACL on this parent
    const hasPermission = await AccessControlModel.userHasPermission(
      parentType,
      parent._id,
      userId,
      action,
      userGroupIds
    );

    if (hasPermission) return true;

    // Stop at department level
    if (parentType === "DEPARTMENT") break;

    // Move up to next level
    currentResource = parent;
    currentType = parentType;
  }

  return false;
}

/**
 * Main permission evaluator
 * Works for both folders and documents
 * @param {Object} user - User document
 * @param {Object} resource - Folder or Document
 * @param {string} resourceType - 'FOLDER' | 'DOCUMENT'
 * @param {string} action - Permission to check
 * @param {Array} userGroupIds - User's group IDs
 * @returns {Promise<boolean>}
 */
export async function hasPermission(user, resource, resourceType, action, userGroupIds = []) {
  // Get department
  const department = await getDepartment(resource);
  if (!department) return false;

  // Check 1: Implicit access (owner, admin, etc.)
  if (hasImplicitAccess(user, department)) {
    return true;
  }

  // 🔥 NEW: Check if resource has ANY explicit ACL entries
  const hasExplicitACL = await AccessControlModel.hasAnyACL(
    resourceType.toUpperCase(),
    resource._id
  );

  if (hasExplicitACL) {
    // ✅ Resource has explicit ACL → Check ONLY direct permissions, NO inheritance
    const directAccess = await hasDirectACL(resource, resourceType, user._id, action, userGroupIds);
    return directAccess; // Return early, don't check parents
  }

  // ✅ No explicit ACL → Inherit from parent hierarchy
  const parentAccess = await hasParentACL(resource, resourceType, user._id, action, userGroupIds);
  return parentAccess;
}

/**
 * Check if user needs ACL entry (opposite of hasImplicitAccess)
 * Used by controllers to decide whether to create ACL
 * @param {Object} user - User document
 * @param {Object} department - Department document
 * @returns {boolean}
 */
export function needsACL(user, department) {
  return !hasImplicitAccess(user, department);
}

/**
 * Check if user can create subfolders in a folder
 * @param {Object} user - User document
 * @param {Object} folder - Folder document
 * @param {Array} userGroupIds - User's group IDs
 * @returns {Promise<boolean>}
 */
export async function canCreateSubfolder(user, folder, userGroupIds = []) {
  // Creating subfolder = "upload" permission on parent folder
  return await hasPermission(user, folder, "FOLDER", "upload", userGroupIds);
}

/**
 * Check if user can upload files in a folder
 * @param {Object} user - User document
 * @param {Object} folder - Folder document
 * @param {Array} userGroupIds - User's group IDs
 * @returns {Promise<boolean>}
 */
export async function canUploadFile(user, folder, userGroupIds = []) {
  // Uploading file = "upload" permission on parent folder
  return await hasPermission(user, folder, "FOLDER", "upload", userGroupIds);
}

/**
 * Get all permissions user has on a resource
 * Works for both folders and documents
 * @param {Object} user - User document
 * @param {string} resourceType - 'FOLDER' | 'DOCUMENT'
 * @param {string} resourceId - Resource ObjectId
 * @returns {Promise<Object>} Object with permissions array and flags
 */
export async function getUserPermissions(user, resourceType, resourceId) {
  const resource = await getResource(resourceType, resourceId);
  if (!resource || resource.isDeleted) {
    return { permissions: [], canCreateSubfolder: false, canUploadFile: false };
  }

  const department = await getDepartment(resource);
  if (!department) {
    return { permissions: [], canCreateSubfolder: false, canUploadFile: false };
  }

  const userGroupIds = user.groups || [];

  // Implicit access = all permissions
  if (hasImplicitAccess(user, department)) {
    return {
      permissions: ["view", "download", "upload", "delete", "share"],
      canCreateSubfolder: resourceType === "FOLDER",
      canUploadFile: resourceType === "FOLDER",
    };
  }

  // Get direct ACL permissions
  const aclPermissions = await AccessControlModel.getUserPermissions(
    resourceType.toUpperCase(),
    resource._id,
    user._id,
    userGroupIds
  );

  if (aclPermissions.length > 0) {
    const hasUpload = aclPermissions.includes("upload");
    return {
      permissions: aclPermissions,
      canCreateSubfolder: resourceType === "FOLDER" && hasUpload,
      canUploadFile: resourceType === "FOLDER" && hasUpload,
    };
  }

  // Check each permission on parents
  const allPermissions = new Set();
  const permissionTypes = ["view", "download", "upload", "delete", "share"];

  for (const permission of permissionTypes) {
    const hasParent = await hasParentACL(resource, resourceType, user._id, permission, userGroupIds);
    if (hasParent) {
      allPermissions.add(permission);
    }
  }

  const permissions = Array.from(allPermissions);
  const hasUpload = permissions.includes("upload");

  return {
    permissions,
    canCreateSubfolder: resourceType === "FOLDER" && hasUpload,
    canUploadFile: resourceType === "FOLDER" && hasUpload,
  };
}

/**
 * Attach allowed actions to a single resource for frontend
 * Works for both folders and documents
 * @param {Object} resource - Folder or Document (plain object or Mongoose doc)
 * @param {Object} user - User document
 * @param {string} resourceType - 'FOLDER' | 'DOCUMENT'
 * @returns {Promise<Object>} Resource with actions field
 */
export async function attachActions(resource, user, resourceType) {
  const department = await getDepartment(resource);
  if (!department) {
    return {
      ...resource,
      actions: {
        canView: false,
        canDownload: false,
        canUpload: false,
        canDelete: false,
        canShare: false,
        ...(resourceType === "FOLDER" && { canCreateFolder: false }),
      },
    };
  }

  const userGroupIds = user.groups || [];

  // Check implicit access first (fast path)
  if (hasImplicitAccess(user, department)) {
    return {
      ...resource,
      actions: {
        canView: true,
        canDownload: true,
        canUpload: true, // ✅ For FOLDER = upload files, For DOCUMENT = reupload/new version
        canDelete: true,
        canShare: true,
        ...(resourceType === "FOLDER" && { canCreateFolder: true }),
      },
    };
  }

  // Check each permission
  const [canView, canDownload, canUpload, canDelete, canShare] = await Promise.all([
    hasPermission(user, resource, resourceType, "view", userGroupIds),
    hasPermission(user, resource, resourceType, "download", userGroupIds),
    hasPermission(user, resource, resourceType, "upload", userGroupIds),
    hasPermission(user, resource, resourceType, "delete", userGroupIds),
    hasPermission(user, resource, resourceType, "share", userGroupIds),
  ]);

  return {
    ...resource,
    actions: {
      canView,
      canDownload,
      canUpload, // ✅ For FOLDER = upload files, For DOCUMENT = reupload/new version
      canDelete,
      canShare,
      ...(resourceType === "FOLDER" && canUpload && { canCreateFolder: true }),
    },
  };
}

/**
 * Attach allowed actions to multiple resources (bulk)
 * Works for both folders and documents
 * @param {Array} resources - Array of folders/documents
 * @param {Object} user - User document
 * @returns {Promise<Array>} Resources with actions field
 */
export async function attachActionsBulk(resources, user) {
  if (!resources || resources.length === 0) return [];

  return await Promise.all(
    resources.map(async (resource) => {
      // Determine resource type from model or type field
      const resourceType =
        resource.constructor?.modelName === "Folder" || resource.type === "folder"
          ? "FOLDER"
          : "DOCUMENT";

      return await attachActions(resource, user, resourceType);
    })
  );
}



/**
 * Check if user is the owner/creator of a folder or has implicit access to its department
 * @param {Object} folder - Folder document
 * @param {Object} user - User document
 * @returns {Promise<boolean>}
 */
export async function isOwnerOfFolder(folder, user) {
  // Check 1: Is user the creator?
  if (folder.createdBy && folder.createdBy.toString() === user._id.toString()) {
    return true;
  }

  // Check 2: Does user have implicit access to the department?
  const department = await getDepartment(folder);
  if (department && hasImplicitAccess(user, department)) {
    return true;
  }

  return false;
}