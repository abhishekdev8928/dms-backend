
import ACLModel from '../models/accessControlModel.js';
import FolderModel from '../models/folderModel.js';
import DepartmentModel from '../models/departmentModel.js';
import DocumentModel from '../models/documentModel.js';

/**
 * Get all users who have access to a resource
 * @param {String} resourceId - Folder or file ID
 * @param {String} resourceType - 'folder' or 'file'
 * @returns {Array} Array of user IDs with their permissions
 */
export const getResourceAccessList = async (resourceId, resourceType) => {
  const acl = await ACLModel.findById(resourceId);
  
  if (!acl) {
    return [];
  }

  // For public resources, return special indicator
  if (acl.visibility === 'public') {
    return [{ visibility: 'public', note: 'Everyone can view' }];
  }

  // For private, just return creator
  if (acl.visibility === 'private') {
    return [{
      userId: acl.createdBy,
      permissions: ['view', 'upload', 'download', 'delete', 'change_visibility'],
      role: 'creator'
    }];
  }

  // For restricted, return all granted users
  return acl.users.map(u => ({
    userId: u.userId,
    permissions: u.permissions,
    role: u.userId.toString() === acl.createdBy.toString() ? 'creator' : 'shared'
  }));
};

/**
 * Batch permission check for multiple resources
 * Useful for filtering lists of folders/files
 * 
 * @param {String} userId - User ID to check
 * @param {Array} resourceIds - Array of resource IDs
 * @param {String} resourceType - 'folder' or 'file'
 * @param {String} permission - Permission to check
 * @returns {Object} Map of resourceId -> hasPermission
 */
export const batchCheckPermissions = async (userId, resourceIds, resourceType, permission) => {
  const results = {};

  // Fetch all ACLs in one query
  const acls = await ACLModel.find({
    _id: { $in: resourceIds },
    type: resourceType
  });

  // Create a map for quick lookup
  const aclMap = new Map();
  acls.forEach(acl => aclMap.set(acl._id.toString(), acl));

  // Check each resource
  for (const resourceId of resourceIds) {
    const acl = aclMap.get(resourceId.toString());
    
    if (!acl) {
      results[resourceId] = false;
      continue;
    }

    // Public - only view allowed
    if (acl.visibility === 'public') {
      results[resourceId] = permission === 'view';
      continue;
    }

    // Private - only creator
    if (acl.visibility === 'private') {
      results[resourceId] = acl.createdBy.toString() === userId.toString();
      continue;
    }

    // Restricted - check permissions
    const userGrant = acl.users.find(u => u.userId.toString() === userId.toString());
    results[resourceId] = userGrant ? userGrant.permissions.includes(permission) : false;
  }

  return results;
};

/**
 * Clone ACL from one resource to another
 * Useful when copying/duplicating folders
 * 
 * @param {String} sourceId - Source resource ID
 * @param {String} targetId - Target resource ID
 * @param {String} resourceType - 'folder' or 'file'
 * @param {String} newCreatorId - New creator (optional)
 */
export const cloneACL = async (sourceId, targetId, resourceType, newCreatorId = null) => {
  const sourceACL = await ACLModel.findById(sourceId);
  
  if (!sourceACL) {
    throw new Error('Source ACL not found');
  }

  const newACL = await ACLModel.create({
    _id: targetId,
    type: resourceType,
    visibility: sourceACL.visibility,
    users: newCreatorId 
      ? [
          {
            userId: newCreatorId,
            permissions: ['view', 'upload', 'download', 'delete', 'change_visibility']
          }
        ]
      : sourceACL.users,
    roles: sourceACL.roles,
    memberBanks: sourceACL.memberBanks,
    inheritsFromParent: sourceACL.inheritsFromParent,
    createdBy: newCreatorId || sourceACL.createdBy
  });

  return newACL;
};

/**
 * Get permission summary for a user on a resource
 * Returns a readable object with all permission flags
 * 
 * @param {String} userId - User ID
 * @param {String} resourceId - Resource ID
 * @param {String} resourceType - 'folder' or 'file'
 */
export const getUserPermissionSummary = async (userId, resourceId, resourceType) => {
  const acl = await ACLModel.findById(resourceId);
  
  if (!acl) {
    return {
      hasAccess: false,
      permissions: [],
      visibility: 'unknown',
      reason: 'No ACL found'
    };
  }

  // Public
  if (acl.visibility === 'public') {
    return {
      hasAccess: true,
      permissions: ['view'],
      visibility: 'public',
      reason: 'Public access'
    };
  }

  // Private
  if (acl.visibility === 'private') {
    const isCreator = acl.createdBy.toString() === userId.toString();
    return {
      hasAccess: isCreator,
      permissions: isCreator 
        ? ['view', 'upload', 'download', 'delete', 'change_visibility']
        : [],
      visibility: 'private',
      reason: isCreator ? 'Creator' : 'Private - no access'
    };
  }

  // Restricted
  const userGrant = acl.users.find(u => u.userId.toString() === userId.toString());
  
  if (!userGrant) {
    return {
      hasAccess: false,
      permissions: [],
      visibility: 'restricted',
      reason: 'Not in access list'
    };
  }

  return {
    hasAccess: true,
    permissions: userGrant.permissions,
    visibility: 'restricted',
    reason: 'Explicit grant'
  };
};

/**
 * Bulk update permissions for multiple users
 * Useful for team management
 * 
 * @param {String} resourceId - Resource ID
 * @param {Array} updates - Array of { userId, permissions }
 */
export const bulkUpdatePermissions = async (resourceId, updates) => {
  const acl = await ACLModel.findById(resourceId);
  
  if (!acl) {
    throw new Error('ACL not found');
  }

  for (const update of updates) {
    await acl.addUser(update.userId, update.permissions);
  }

  return acl;
};

/**
 * Remove all access for a user from a resource
 * @param {String} resourceId - Resource ID
 * @param {String} userId - User to remove
 */
export const revokeAccess = async (resourceId, userId) => {
  const acl = await ACLModel.findById(resourceId);
  
  if (!acl) {
    throw new Error('ACL not found');
  }

  // Don't allow removing creator
  if (acl.createdBy.toString() === userId.toString()) {
    throw new Error('Cannot revoke access from creator');
  }

  await acl.removeUser(userId);
  return acl;
};

/**
 * Get all resources a user has access to
 * Useful for "My Files" view
 * 
 * @param {String} userId - User ID
 * @param {String} permission - Specific permission (optional)
 * @param {String} resourceType - 'folder' or 'file' (optional)
 */
export const getUserAccessibleResources = async (userId, permission = null, resourceType = null) => {
  const query = {
    $or: [
      { visibility: 'public' },
      { createdBy: userId },
      { 'users.userId': userId }
    ]
  };

  if (resourceType) {
    query.type = resourceType;
  }

  const acls = await ACLModel.find(query);

  // Filter by specific permission if provided
  if (permission) {
    return acls.filter(acl => {
      if (acl.visibility === 'public' && permission === 'view') return true;
      if (acl.createdBy.toString() === userId.toString()) return true;
      
      const userGrant = acl.users.find(u => u.userId.toString() === userId.toString());
      return userGrant && userGrant.permissions.includes(permission);
    });
  }

  return acls;
};

/**
 * Cascade ACL changes to all descendants
 * When parent ACL changes, optionally update children that inherit
 * 
 * @param {String} folderId - Parent folder ID
 * @param {Object} aclUpdates - ACL properties to update
 */
export const cascadeACLChanges = async (folderId, aclUpdates) => {
  const folder = await FolderModel.findById(folderId);
  
  if (!folder) {
    throw new Error('Folder not found');
  }

  // Get all descendants
  const descendants = await folder.getAllDescendants();

  const updates = [];

  for (const desc of descendants) {
    const descACL = await ACLModel.findById(desc._id);
    
    // Only update if it inherits from parent
    if (descACL && descACL.inheritsFromParent) {
      Object.assign(descACL, aclUpdates);
      descACL.updatedAt = Date.now();
      updates.push(descACL.save());
    }
  }

  await Promise.all(updates);
  
  return {
    updated: updates.length,
    message: `Updated ${updates.length} descendant ACLs`
  };
};

/**
 * Validate permission array
 * @param {Array} permissions - Permissions to validate
 * @returns {Boolean}
 */
export const validatePermissions = (permissions) => {
  const validPermissions = ['view', 'upload', 'download', 'delete', 'change_visibility'];
  
  if (!Array.isArray(permissions)) {
    return false;
  }

  return permissions.every(p => validPermissions.includes(p));
};

/**
 * Get permission combinations (presets)
 * Common permission sets for easy sharing
 */
export const PERMISSION_PRESETS = {
  VIEWER: ['view'],
  VIEWER_DOWNLOAD: ['view', 'download'],
  CONTRIBUTOR: ['view', 'upload', 'download'],
  EDITOR: ['view', 'upload', 'download', 'delete'],
  OWNER: ['view', 'upload', 'download', 'delete', 'change_visibility']
};

/**
 * Apply permission preset to user
 * @param {String} resourceId - Resource ID
 * @param {String} userId - User ID
 * @param {String} preset - Preset name from PERMISSION_PRESETS
 */
export const applyPermissionPreset = async (resourceId, userId, preset) => {
  const permissions = PERMISSION_PRESETS[preset];
  
  if (!permissions) {
    throw new Error(`Invalid preset: ${preset}`);
  }

  const acl = await ACLModel.findById(resourceId);
  
  if (!acl) {
    throw new Error('ACL not found');
  }

  await acl.addUser(userId, permissions);
  return acl;
};

/**
 * Check if ACL needs repair (missing or inconsistent)
 * @param {String} resourceId - Resource ID
 * @param {String} resourceType - 'folder' or 'file'
 */
export const checkACLHealth = async (resourceId, resourceType) => {
  const acl = await ACLModel.findById(resourceId);
  
  const health = {
    exists: !!acl,
    issues: []
  };

  if (!acl) {
    health.issues.push('ACL does not exist');
    return health;
  }

  // Check if resource exists
  let resource;
  if (resourceType === 'folder') {
    resource = await FolderModel.findById(resourceId);
  } else {
    resource = await DocumentModel.findById(resourceId);
  }

  if (!resource) {
    health.issues.push('Resource does not exist but ACL does (orphaned ACL)');
  }

  // Check creator exists in users array for restricted
  if (acl.visibility === 'restricted') {
    const creatorInUsers = acl.users.some(
      u => u.userId.toString() === acl.createdBy.toString()
    );
    
    if (!creatorInUsers) {
      health.issues.push('Creator not in users array for restricted resource');
    }
  }

  // Check for empty permissions
  const emptyPerms = acl.users.filter(u => u.permissions.length === 0);
  if (emptyPerms.length > 0) {
    health.issues.push(`${emptyPerms.length} users have no permissions`);
  }

  health.healthy = health.issues.length === 0;
  
  return health;
};

/**
 * Repair ACL - fix common issues
 * @param {String} resourceId - Resource ID
 * @param {String} resourceType - 'folder' or 'file'
 */
export const repairACL = async (resourceId, resourceType) => {
  const health = await checkACLHealth(resourceId, resourceType);
  
  if (health.healthy) {
    return { repaired: false, message: 'ACL is healthy' };
  }

  let acl = await ACLModel.findById(resourceId);
  const repairs = [];

  // Create ACL if missing
  if (!acl) {
    let resource;
    if (resourceType === 'folder') {
      resource = await FolderModel.findById(resourceId);
    } else {
      resource = await DocumentModel.findById(resourceId);
    }

    if (resource) {
      acl = await ACLModel.createPrivate(resourceId, resourceType, resource.createdBy);
      repairs.push('Created missing ACL');
    }
  }

  // Add creator to users if missing
  if (acl && acl.visibility === 'restricted') {
    const creatorInUsers = acl.users.some(
      u => u.userId.toString() === acl.createdBy.toString()
    );
    
    if (!creatorInUsers) {
      await acl.addUser(
        acl.createdBy, 
        ['view', 'upload', 'download', 'delete', 'change_visibility']
      );
      repairs.push('Added creator to users array');
    }
  }

  // Remove users with no permissions
  if (acl) {
    const emptyPerms = acl.users.filter(u => u.permissions.length === 0);
    for (const user of emptyPerms) {
      await acl.removeUser(user.userId);
      repairs.push(`Removed user ${user.userId} with no permissions`);
    }
  }

  return {
    repaired: true,
    repairs,
    acl
  };
};

export default {
  getResourceAccessList,
  batchCheckPermissions,
  cloneACL,
  getUserPermissionSummary,
  bulkUpdatePermissions,
  revokeAccess,
  getUserAccessibleResources,
  cascadeACLChanges,
  validatePermissions,
  PERMISSION_PRESETS,
  applyPermissionPreset,
  checkACLHealth,
  repairACL
};