// middleware/checkPermission.js

import createHttpError from "http-errors";
import AccessControlModel from "../models/accessControlModel.js";
import FolderModel from "../models/folderModel.js";
import DocumentModel from "../models/documentModel.js";
import DepartmentModel from "../models/departmentModel.js";

const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  DEPARTMENT_OWNER: "DEPARTMENT_OWNER",
};

/**
 * Get department for any resource (folder, document, or department itself)
 * ✅ EXPORTED - Can be used in controllers
 */
export async function getDepartmentForResource(resource, resourceType) {
  if (resourceType === "DEPARTMENT") {
    return resource;
  }

  if (resource.departmentId) {
    return await DepartmentModel.findById(resource.departmentId);
  }

  return null;
}

/**
 * Check if user is admin of the department
 * ✅ EXPORTED - Can be used in controllers
 */
export function isAdminOfDepartment(user, departmentId) {
  if (!user.departments || !departmentId) return false;

  return user.departments.some((dept) => {
    const deptId = dept._id || dept;
    return deptId.toString() === departmentId.toString();
  });
}

/**
 * ✅ NEW: Single source of truth for implicit access check
 * Replaces duplicated role checks across the codebase
 */
export function hasImplicitAccess(user, department) {
  if (!user || !department) return false;

  // 1️⃣ MyDrive Owner → Full access
  if (department.ownerType === "USER") {
    const myDriveId = user.myDriveDepartmentId?._id || user.myDriveDepartmentId;
    return myDriveId && myDriveId.toString() === department._id.toString();
  }

  // 2️⃣ Super Admin → Full access (ORG only)
  if (user.role === ROLES.SUPER_ADMIN && department.ownerType === "ORG") {
    return true;
  }

  // 3️⃣ Admin / Department Owner → Access to assigned departments
  if (user.role === ROLES.ADMIN || user.role === ROLES.DEPARTMENT_OWNER) {
    return isAdminOfDepartment(user, department._id);
  }

  // 4️⃣ Normal user → No implicit access
  return false;
}

/**
 * ✅ NEW: Check if ACL entry is needed
 * Used by controllers to decide whether to create ACL
 */
export function needsACL(user, department) {
  return !hasImplicitAccess(user, department);
}

/**
 * Get resource by type and ID
 * ✅ UPDATED: Now supports DEPARTMENT
 */
export async function getResource(resourceType, resourceId) {
  const type = resourceType.toUpperCase();

  if (type === "FOLDER") {
    return await FolderModel.findById(resourceId);
  } else if (type === "DOCUMENT") {
    return await DocumentModel.findById(resourceId);
  } else if (type === "DEPARTMENT") {
    return await DepartmentModel.findById(resourceId);
  }

  return null;
}

// ============================================
// 🔥 PRIVATE HELPER FUNCTIONS
// ============================================

/**
 * Check ACL permissions for the resource (USER + GROUP permissions)
 */
async function checkACLPermission(
  resource,
  resourceType,
  userId,
  action,
  userGroupIds = []
) {
  return await AccessControlModel.userHasPermission(
    resourceType.toUpperCase(),
    resource._id,
    userId,
    action,
    userGroupIds
  );
}

/**
 * ✅ FIXED: Check if user has permission on ANY ancestor in the hierarchy
 * Handles both direct fields and virtuals/getters
 */
async function checkAncestorPermission(
  resource,
  resourceType,
  userId,
  action,
  userGroupIds = []
) {
  console.log("🔍 checkAncestorPermission START", {
    resourceId: resource._id,
    resourceType,
    userId,
    action,
  });

  let currentResource = resource;
  let currentType = resourceType;
  let level = 0;

  // Traverse up the hierarchy
  while (true) {
    level++;
    console.log(`📍 Level ${level}:`, {
      currentResourceId: currentResource._id,
      currentType,
    });

    // Get parent ID based on current resource type
    let parentId;
    if (currentType === "DOCUMENT") {
      // For documents, try parentId field
      parentId = currentResource.parentId;
    } else if (currentType === "FOLDER") {
      // ✅ FIX: Try multiple ways to get parent
      // Option 1: Direct field
      parentId = currentResource.parentId;
      
      // Option 2: If parent is a function (virtual/getter), call it
      if (!parentId && typeof currentResource.parent === 'function') {
        parentId = currentResource.parent();
      }
      
      // Option 3: If parent is a direct property
      if (!parentId && currentResource.parent && typeof currentResource.parent !== 'function') {
        parentId = currentResource.parent;
      }
    } else {
      console.log("⛔ No parent field for this type, stopping");
      break;
    }

    console.log(`🔗 Parent ID:`, parentId);

    if (!parentId) {
      console.log("⛔ No parent ID, stopping");
      break;
    }

    // Find the parent resource
    let parent = null;
    let parentType = null;

    // Try folder first
    try {
      parent = await FolderModel.findById(parentId);
      console.log("📁 Tried folder lookup:", parent ? "Found" : "Not found");
      
      if (parent && !parent.isDeleted) {
        parentType = "FOLDER";
        console.log("✅ Parent is FOLDER:", parent._id);
      } else {
        if (parent?.isDeleted) {
          console.log("❌ Parent folder is deleted");
        }
        parent = null;
      }
    } catch (error) {
      console.error("❌ Error finding folder parent:", error);
    }

    // If not folder, try department
    if (!parent) {
      try {
        parent = await DepartmentModel.findById(parentId);
        console.log("🏢 Tried department lookup:", parent ? "Found" : "Not found");
        
        if (parent && parent.isActive) {
          parentType = "DEPARTMENT";
          console.log("✅ Parent is DEPARTMENT:", parent._id);
        } else {
          if (parent && !parent.isActive) {
            console.log("❌ Parent department is inactive");
          }
          parent = null;
        }
      } catch (error) {
        console.error("❌ Error finding department parent:", error);
      }
    }

    if (!parent || !parentType) {
      console.log("⛔ Parent not found or invalid, stopping");
      break;
    }

    // ✅ CHECK PERMISSION ON THIS PARENT
    try {
      console.log(`🔐 Checking ACL on ${parentType}:`, {
        parentId: parent._id,
        userId,
        action,
      });

      const hasPermission = await AccessControlModel.userHasPermission(
        parentType,
        parent._id,
        userId,
        action,
        userGroupIds
      );

      console.log(`🔐 Permission result:`, hasPermission);

      if (hasPermission) {
        console.log("✅ PERMISSION GRANTED on ancestor!");
        return true;
      }
    } catch (error) {
      console.error("❌ Error checking ancestor permission:", error);
    }

    // Move up to the next level
    currentResource = parent;
    currentType = parentType;

    // Stop at department level
    if (parentType === "DEPARTMENT") {
      console.log("🏁 Reached DEPARTMENT level, stopping");
      break;
    }
  }

  console.log("❌ No permission found in any ancestor");
  return false;
}

// ============================================
// 🔥 CORE PERMISSION EVALUATOR (REFACTORED)
// ============================================

/**
 * ✅ UPDATED: Respects explicit ACL priority over inheritance
 * Main permission evaluation logic
 * Works for: folders, documents, and parent resources (department/folder)
 */
export async function evaluatePermission(
  user,
  resource,
  resourceType,
  action,
  userGroupIds = []
) {
  // Get department info
  const department = await getDepartmentForResource(resource, resourceType);
  if (!department) {
    return false; // No department = no access
  }

  // ✅ Check implicit access (owner, admin, etc.)
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
    const hasAclPermission = await checkACLPermission(
      resource,
      resourceType,
      user._id,
      action,
      userGroupIds
    );
    return hasAclPermission; // Return early, don't check ancestors
  }

  // ✅ No explicit ACL → Inherit from ancestor hierarchy
  if (resourceType === "FOLDER" || resourceType === "DOCUMENT") {
    const hasAncestorPermission = await checkAncestorPermission(
      resource,
      resourceType,
      user._id,
      action,
      userGroupIds
    );
    return hasAncestorPermission;
  }

  // DENY
  return false;
}

// ============================================
// 🔥 GENERIC PERMISSION MIDDLEWARE
// ============================================

/**
 * Generic permission checker for folders, documents, and their parents
 * @param {string} resourceType - 'FOLDER' | 'DOCUMENT' | 'PARENT'
 * @param {string} action - 'view', 'download', 'upload', 'delete', 'share'
 * @param {string} resourceIdParam - Request param name containing resource ID
 */
export const checkPermission = (
  resourceType,
  action,
  resourceIdParam = "id"
) => {
  return async (req, res, next) => {
    try {
      const user = req.user;
      const resourceId =
        req.params[resourceIdParam] || req.body[resourceIdParam];

      if (!user) {
        throw createHttpError(401, "Authentication required");
      }

      if (!resourceId) {
        throw createHttpError(400, `${resourceIdParam} is required`);
      }

      // ✅ FIX: If body has type field, use it to determine actual resource type
      let actualResourceTypeInput = resourceType.toUpperCase();
      
      if (req.body.type) {
        const bodyType = req.body.type.toUpperCase();
        if (bodyType === 'DOCUMENT') {
          actualResourceTypeInput = 'DOCUMENT';
        } else if (bodyType === 'FOLDER') {
          actualResourceTypeInput = 'FOLDER';
        }
      }

      // Validate resourceType
      if (!["FOLDER", "DOCUMENT", "PARENT"].includes(actualResourceTypeInput)) {
        throw createHttpError(400, "Invalid resource type");
      }

      // Validate action
      const validActions = ["view", "download", "upload", "delete", "share"];
      if (!validActions.includes(action.toLowerCase())) {
        throw createHttpError(400, "Invalid action");
      }

      let resource;
      let actualResourceType;

      // ✅ HANDLE PARENT TYPE (can be FOLDER or DEPARTMENT)
      if (actualResourceTypeInput === "PARENT") {
        // Try folder first
        resource = await FolderModel.findById(resourceId);
        
        if (resource) {
          actualResourceType = "FOLDER";
          
          // Check if deleted
          if (resource.isDeleted) {
            throw createHttpError(404, "Folder has been deleted");
          }
        } else {
          // Try department
          resource = await DepartmentModel.findById(resourceId);
          
          if (resource) {
            actualResourceType = "DEPARTMENT";
            
            // Check if active
            if (!resource.isActive) {
              throw createHttpError(404, "Department is not active");
            }
          } else {
            throw createHttpError(404, "Parent folder or department not found");
          }
        }
      } else {
        // ✅ HANDLE FOLDER or DOCUMENT
        resource = await getResource(actualResourceTypeInput, resourceId);
        actualResourceType = actualResourceTypeInput;

        if (!resource) {
          throw createHttpError(404, `${actualResourceTypeInput} not found`);
        }

        if (resource.isDeleted) {
          throw createHttpError(404, `${actualResourceTypeInput} has been deleted`);
        }
      }

      // Get user's group IDs (if groups are implemented)
      const userGroupIds = user.groups || [];

      // Check permission
      const hasPermission = await evaluatePermission(
        user,
        resource,
        actualResourceType,
        action,
        userGroupIds
      );

      if (!hasPermission) {
        throw createHttpError(
          403,
          `You do not have permission to ${action} this ${actualResourceType.toLowerCase()}`
        );
      }

      // Attach resource to request for later use
      req.resource = resource;
      req.resourceType = actualResourceType;
      
      // ✅ For PARENT type, also attach as parentResource
      if (actualResourceTypeInput === "PARENT") {
        req.parentResource = resource;
        req.parentType = actualResourceType;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
/**
 * Check if user can create inside a parent (folder or department)
 * Used for both folder and document creation
 */
export const canCreate = async (req, res, next) => {
  try {
    const user = req.user;
    const parentId = req.body.parentId;

    if (!user) {
      throw createHttpError(401, "Authentication required");
    }

    if (!parentId) {
      throw createHttpError(400, "Parent ID is required");
    }

    // Try to find parent as folder first
    let parent = await FolderModel.findById(parentId);
    let parentType = "FOLDER";

    // If not found as folder, check if it's a department
    if (!parent) {
      parent = await DepartmentModel.findById(parentId);
      parentType = "DEPARTMENT";
    }

    if (!parent) {
      throw createHttpError(404, "Parent folder or department not found");
    }

    if (parentType === "FOLDER" && parent.isDeleted) {
      throw createHttpError(404, "Parent folder has been deleted");
    }

    // 🔥 SET THESE BEFORE ANY EARLY RETURNS
    req.parentResource = parent;
    req.parentType = parentType;

    // Get user's group IDs
    const userGroupIds = user.groups || [];

    // Check permission using unified evaluator
    // For creation, we check "upload" permission on parent
    const hasPermission = await evaluatePermission(
      user,
      parent,
      parentType,
      "upload",
      userGroupIds
    );

    if (!hasPermission) {
      throw createHttpError(
        403,
        "You do not have permission to create items in this location"
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};

// ============================================
// 🔥 HELPER MIDDLEWARE (Shortcuts)
// ============================================
// ✅ UPDATED: Now works with DEPARTMENT too
export const canView = (resourceType, resourceIdParam = "id") => {
  return checkPermission(resourceType, "view", resourceIdParam);
};

export const canDownload = (resourceType, resourceIdParam = "id") => {
  return checkPermission(resourceType, "download", resourceIdParam);
};

export const canUpload = (resourceIdParam = "id") => {
  return checkPermission("FOLDER", "upload", resourceIdParam);
};

export const canDelete = (resourceType, resourceIdParam = "id") => {
  return checkPermission(resourceType, "delete", resourceIdParam);
};

export const canShare = (resourceType, resourceIdParam = "id") => {
  return checkPermission(resourceType, "share", resourceIdParam);
};

// ✅ NEW: Helper for parent resources (FOLDER or DEPARTMENT)
export const canViewParent = (resourceIdParam = "id") => {
  return checkPermission("PARENT", "view", resourceIdParam);
};

export const canUploadToParent = (resourceIdParam = "id") => {
  return checkPermission("PARENT", "upload", resourceIdParam);
};

export const checkBulkPermissions = (resourceType, action) => {
  return async (req, res, next) => {
    try {
      const user = req.user;
      const resourceIds = req.body.resourceIds || [];

      if (!user) {
        throw createHttpError(401, "Authentication required");
      }

      if (!Array.isArray(resourceIds) || resourceIds.length === 0) {
        throw createHttpError(400, "resourceIds array is required");
      }

      const userGroupIds = user.groups || [];

      // Get all resources
      const resources = await Promise.all(
        resourceIds.map((id) => getResource(resourceType, id))
      );

      // Filter out null/deleted resources
      const validResources = resources.filter((r) => r && !r.isDeleted);

      if (validResources.length === 0) {
        throw createHttpError(404, "No valid resources found");
      }

      // Check permission for each resource
      const permissionChecks = await Promise.all(
        validResources.map((resource) =>
          evaluatePermission(user, resource, resourceType, action, userGroupIds)
        )
      );

      // Find resources without permission
      const unauthorizedResources = validResources.filter(
        (_, index) => !permissionChecks[index]
      );

      if (unauthorizedResources.length > 0) {
        throw createHttpError(
          403,
          `You do not have permission to ${action} ${unauthorizedResources.length} resource(s)`
        );
      }

      // Attach resources to request
      req.resources = validResources;
      req.resourceType = resourceType;

      next();
    } catch (error) {
      next(error);
    }
  };
};

export const getUserPermissions = async (user, resourceType, resourceId) => {
  try {
    const resource = await getResource(resourceType, resourceId);

    if (!resource || resource.isDeleted) {
      return [];
    }

    const userGroupIds = user.groups || [];
    const department = await getDepartmentForResource(resource, resourceType);

    if (!department) {
      return [];
    }

    // ✅ Check implicit access
    if (hasImplicitAccess(user, department)) {
      return ["view", "download", "upload", "delete", "share"];
    }

    // 🔥 NEW: Check if resource has explicit ACL
    const hasExplicitACL = await AccessControlModel.hasAnyACL(
      resourceType.toUpperCase(),
      resource._id
    );

    if (hasExplicitACL) {
      // ✅ Has explicit ACL → return ONLY those permissions
      const aclPermissions = await AccessControlModel.getUserPermissions(
        resourceType.toUpperCase(),
        resource._id,
        user._id,
        userGroupIds
      );
      return aclPermissions;
    }

    // ✅ No explicit ACL → Check ancestor permissions
    if (resourceType === "FOLDER" || resourceType === "DOCUMENT") {
      const allPermissions = new Set();
      const permissionTypes = ["view", "download", "upload", "delete", "share"];
      
      for (const permission of permissionTypes) {
        const hasPermission = await checkAncestorPermission(
          resource,
          resourceType,
          user._id,
          permission,
          userGroupIds
        );
        if (hasPermission) {
          allPermissions.add(permission);
        }
      }
      
      return Array.from(allPermissions);
    }

    return [];
  } catch (error) {
    console.error("Error getting user permissions:", error);
    return [];
  }
};



// ```

// **Key Changes:**

// 1. **Removed** `checkParentHierarchyPermission` 
// 2. **Added** `checkAncestorPermission` - properly traverses up the hierarchy
// 3. **Fixed the logic** to check ancestors (parents) instead of trying to check descendants

// **How it works now:**
// ```
// Your ACL: Folder A (694e714f9efa466b4464cd76) - you have "view"

// Structure:
// Department
//   └── Folder A (you have view here) ✅
//        └── Folder B
//             └── Folder C (694e82435ef073eb422eeb29) ← trying to access

// When accessing Folder C:
// 1. Check direct ACL on Folder C → No
// 2. Check ancestor: Folder B → No ACL
// 3. Check ancestor: Folder A → ✅ HAS "view" permission!
// 4. Access GRANTED ✅