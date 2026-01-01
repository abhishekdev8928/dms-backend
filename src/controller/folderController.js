// controllers/folderController.js

import createHttpError from "http-errors";
import mongoose from "mongoose";
import FolderModel from "../models/folderModel.js";
import DepartmentModel from "../models/departmentModel.js";
import DocumentModel from "../models/documentModel.js";
import ActivityLog from "../models/activityModel.js";
import AccessControlModel from "../models/accessControlModel.js";
import { formatBytes, getUserInfo } from "../utils/helper/folderHelper.js";
import {
  hasPermission,
  attachActions,
  attachActionsBulk,
  hasImplicitAccess, isOwnerOfFolder 
 
} from "../utils/helper/aclHelpers.js";
import {
  sanitizeInputWithXSS,
  sanitizeAndValidateId,
  validateRequest,
} from "../utils/helper.js";
import {
  createFolderSchema,
  getFolderByIdSchema,
  getChildFoldersQuerySchema,
  updateFolderSchema,
  moveFolderSchema,
  searchFoldersSchema,
  shareFolderSchema,
} from "../validation/folderValidation.js";
import StarredModel from "../models/starredModel.js";

/**
 * @route   POST /api/folders
 * @desc    Create a new folder inside parent
 * @access  Private - Requires 'upload' permission on parent
 */
export const createFolder = async (req, res, next) => {
  try {
    const { name, parentId, description, color } = validateRequest(
      createFolderSchema.safeParse(req.body)
    );

    const sanitizedName = sanitizeInputWithXSS(name);
    const sanitizedParentId = sanitizeAndValidateId(parentId, "Parent ID");
    const sanitizedDescription = description
      ? sanitizeInputWithXSS(description)
      : undefined;

    // Parent is already validated in middleware (canCreate)
    const parent = req.parentResource;
    const parentType = req.parentType;

    // Get departmentId
    let departmentId;
    if (parentType === "DEPARTMENT") {
      departmentId = parent._id;
    } else {
      departmentId = parent.departmentId;
    }

    // Generate unique folder name if duplicate exists
    let uniqueFolderName = sanitizedName;
    let counter = 1;
    let existingFolder = await FolderModel.findOne({
      parentId: sanitizedParentId,
      name: {
        $regex: new RegExp(
          `^${sanitizedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          "i"
        ),
      },
    });

    while (existingFolder) {
      uniqueFolderName = `${sanitizedName} (${counter})`;
      existingFolder = await FolderModel.findOne({
        parentId: sanitizedParentId,
        name: {
          $regex: new RegExp(
            `^${uniqueFolderName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
            "i"
          ),
        },
      });
      counter++;
    }

    // Create folder
    const folder = await FolderModel.create({
      name: uniqueFolderName,
      parentId: sanitizedParentId,
      departmentId,
      description: sanitizedDescription,
      color: color || "#3B82F6",
      createdBy: req.user.id,
    });

    // Log activity
    await ActivityLog.logFolderCreate(
      req.user.id,
      folder,
      sanitizedParentId,
      getUserInfo(req.user)
    );

    res.status(201).json({
      success: true,
      message:
        uniqueFolderName !== sanitizedName
          ? `Folder created as "${uniqueFolderName}" (name was taken)`
          : "Folder created successfully",
      data: folder,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/folders/:id
 * @desc    Get folder by ID with details
 * @access  Private - Requires 'view' permission
 */
export const getFolderById = async (req, res, next) => {
  try {
    const { id } = validateRequest(getFolderByIdSchema.safeParse(req.params));

    // Folder is already validated and attached by middleware (canView)
    const folder = req.resource;

    const department = await folder.getDepartment();
    const breadcrumbs = folder.getBreadcrumbs();

    // Attach actions for frontend
    const folderWithActions = await attachActions(
      folder.toObject(),
      req.user,
      "FOLDER"
    );

    res.status(200).json({
      success: true,
      data: {
        ...folderWithActions,
        department: department
          ? {
              _id: department._id,
              name: department.name,
              ownerType: department.ownerType,
            }
          : null,
        breadcrumbs,
      },
    });
  } catch (error) {
    next(error);
  }
};



/**
 * @route   GET /api/folders/:id/children
 * @desc    Get direct child folders and documents
 * @access  Private - Requires 'view' permission on parent
 */
export const getChildFolders = async (req, res, next) => {
  try {
    const { id } = validateRequest(getFolderByIdSchema.safeParse(req.params));
    const { includeDeleted, type, userEmail } = validateRequest(
      getChildFoldersQuerySchema.safeParse(req.query)
    );

    const parent = req.parentResource;
    const parentType = req.parentType;

    // ✅ FIX: Pass req.user to buildBreadcrumbs
    const breadcrumbs = await buildBreadcrumbs(parent, parentType, req.user);

    let children = [];

    if (parentType === "FOLDER") {
      // 🔥 ENSURE getChildren RETURNS LEAN DATA
      children = await parent.getChildren(includeDeleted === "true", {
        lean: true,
      });
    } else {
      const query = {
        parentId: parent._id,
        ...(includeDeleted !== "true" && { isDeleted: false }),
      };

      const [folders, documents] = await Promise.all([
        FolderModel.find(query)
          .populate("createdBy", "email username")
          .populate("updatedBy", "email username")
          .sort({ createdAt: -1 })
          .lean(), // ✅ KEY FIX

        DocumentModel.find(query)
          .populate("createdBy", "email username")
          .populate("updatedBy", "email username")
          .sort({ createdAt: -1 })
          .lean(), // ✅ KEY FIX
      ]);

      children = [...folders, ...documents];
    }

    // 🔍 Apply filters
    let filteredChildren = children;

    if (type) {
      filteredChildren = filteredChildren.filter(
        (child) => child.type && child.type.toLowerCase() === type.toLowerCase()
      );
    }

    if (userEmail) {
      const emailLower = userEmail.trim().toLowerCase();
      filteredChildren = filteredChildren.filter((child) => {
        const email =
          child.createdBy?.email || child.updatedBy?.email || child.userEmail;
        return email && email.toLowerCase() === emailLower;
      });
    }

    // 📁 Sort: folders first, then by createdAt
    filteredChildren.sort((a, b) => {
      const aIsFolder = a.type === "folder";
      const bIsFolder = b.type === "folder";

      if (aIsFolder && !bIsFolder) return -1;
      if (!aIsFolder && bIsFolder) return 1;

      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    // ⭐ Get starred status for all items
    const itemIds = filteredChildren.map(child => child._id);
    const starredItems = await StarredModel.find({
      userId: req.user._id,
      itemId: { $in: itemIds }
    }).lean();

    // Create a Set of starred item IDs for O(1) lookup
    const starredItemIds = new Set(
      starredItems.map(item => item.itemId.toString())
    );

    // Add isStarred field to each child
    const childrenWithStarred = filteredChildren.map(child => ({
      ...child,
      isStarred: starredItemIds.has(child._id.toString())
    }));

    // 🔐 Attach actions AFTER lean conversion
    const childrenWithActions = await attachActionsBulk(
      childrenWithStarred,
      req.user
    );

    res.status(200).json({
      success: true,
      count: childrenWithActions.length,
      parentType,
      breadcrumbs, // ✅ Now includes correct breadcrumbs with isShared flags
      filters: {
        type: type || null,
        userEmail: userEmail || null,
      },
      children: childrenWithActions,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Build breadcrumbs - shows real path for owners, virtual path for shared users
 * @param {Object} parent - Parent folder or department
 * @param {string} parentType - 'FOLDER' | 'DEPARTMENT'
 * @param {Object} user - Current user
 * @returns {Promise<Array>} Breadcrumbs array
 */
async function buildBreadcrumbs(parent, parentType, user) {
  const breadcrumbs = [];

  // ============================================
  // CASE 1: Parent is a DEPARTMENT
  // ============================================
  if (parentType === "DEPARTMENT") {
    const isOwner = hasImplicitAccess(user, parent);
    
    if (!isOwner) {
      // 🎯 User is viewing a SHARED department
      return [
        {
          id: "shared-root",
          name: "Shared with me",
          type: "virtual",
          isShared: true,
        },
        {
          id: parent._id.toString(),
          name: parent.name,
          type: "department",
          isShared: true,
        }
      ];
    }
    
    // ✅ Owner sees normal department breadcrumb
    breadcrumbs.push({
      id: parent._id.toString(),
      name: parent.name,
      type: "department",
      ownerType: parent.ownerType,
      isShared: false,
    });
    
    return breadcrumbs;
  }

  // ============================================
  // CASE 2: Parent is a FOLDER
  // ============================================
  if (parentType === "FOLDER") {
    const isOwner = await isOwnerOfFolder(parent, user);
    
    if (!isOwner) {
      // 🎯 User is viewing a SHARED folder
      return [
        {
          id: "shared-root",
          name: "Shared with me",
          type: "virtual",
          isShared: true,
        },
        {
          id: parent._id.toString(),
          name: parent.name,
          type: "folder",
          isShared: true,
        }
      ];
    }
    
    // ✅ Owner sees FULL PATH - build it normally
    return await buildRealPathBreadcrumbs(parent);
  }

  return breadcrumbs;
}

/**
 * Build full breadcrumb path for owners
 * (This is your existing logic, just extracted)
 */
async function buildRealPathBreadcrumbs(parent) {
  const breadcrumbs = [];
  const pathParts = parent.path.split("/").filter((p) => p.length > 0);
  
  if (pathParts.length === 0) return breadcrumbs;

  // Get department
  const department = await DepartmentModel.findOne({
    name: pathParts[0],
    isActive: true,
  });

  if (department) {
    breadcrumbs.push({
      id: department._id.toString(),
      name: department.name,
      type: "department",
      ownerType: department.ownerType,
      isShared: false,
    });
  }

  // Build folder paths
  const folderPaths = [];
  let currentPath = `/${pathParts[0]}`;
  for (let i = 1; i < pathParts.length; i++) {
    currentPath += `/${pathParts[i]}`;
    folderPaths.push(currentPath);
  }

  // Fetch all folders in one query
  if (folderPaths.length > 0) {
    const folders = await FolderModel.find({
      path: { $in: folderPaths },
      isDeleted: false,
    }).lean();

    const folderMap = new Map();
    folders.forEach((f) => folderMap.set(f.path, f));

    folderPaths.forEach((path) => {
      const folder = folderMap.get(path);
      if (folder) {
        breadcrumbs.push({
          id: folder._id.toString(),
          name: folder.name,
          type: "folder",
          isShared: false,
        });
      }
    });
  }

  return breadcrumbs;
}

/**
 * Build breadcrumbs for folder or department
 */
// async function buildBreadcrumbs(parent, parentType) {
//   const breadcrumbs = [];

//   if (parentType === "DEPARTMENT") {
//     breadcrumbs.push({
//       id: parent._id.toString(),
//       name: parent.name,
//       type: "department",
//       ownerType: parent.ownerType,
//     });
//   } else if (parentType === "FOLDER") {
//     const pathParts = parent.path.split("/").filter((p) => p.length > 0);
//     if (pathParts.length === 0) return breadcrumbs;

//     // Get department
//     const department = await DepartmentModel.findOne({
//       name: pathParts[0],
//       isActive: true,
//     });

//     if (department) {
//       breadcrumbs.push({
//         id: department._id.toString(),
//         name: department.name,
//         type: "department",
//         ownerType: department.ownerType,
//       });
//     }

//     // Build folder paths
//     const folderPaths = [];
//     let currentPath = `/${pathParts[0]}`;
//     for (let i = 1; i < pathParts.length; i++) {
//       currentPath += `/${pathParts[i]}`;
//       folderPaths.push(currentPath);
//     }

//     // Fetch all folders in one query
//     if (folderPaths.length > 0) {
//       const folders = await FolderModel.find({
//         path: { $in: folderPaths },
//         isDeleted: false,
//       }).lean();

//       const folderMap = new Map();
//       folders.forEach((f) => folderMap.set(f.path, f));

//       folderPaths.forEach((path) => {
//         const folder = folderMap.get(path);
//         if (folder) {
//           breadcrumbs.push({
//             id: folder._id.toString(),
//             name: folder.name,
//             type: "folder",
//           });
//         }
//       });
//     }
//   }

//   return breadcrumbs;
// }




/**
 * @route   GET /api/folders/:id/breadcrumbs
 * @desc    Get breadcrumbs for folder
 * @access  Private - Requires 'view' permission
 */
// export const getFolderBreadcrumbs = async (req, res, next) => {
//   try {
//     const { id } = validateRequest(getFolderByIdSchema.safeParse(req.params));

//     // Folder is already validated by middleware
//     const folder = req.resource;
//     const breadcrumbs = folder.getBreadcrumbs();

//     res.status(200).json({
//       success: true,
//       data: {
//         path: folder.path,
//         breadcrumbs,
//       },
//     });
//   } catch (error) {
//     next(error);
//   }
// };

/**
 * @route   PUT /api/folders/:id
 * @desc    Update folder details
 * @access  Private - Requires 'upload' permission
 */
export const updateFolder = async (req, res, next) => {
  try {
    const { id } = validateRequest(getFolderByIdSchema.safeParse(req.params));
    const { name, description, color } = validateRequest(
      updateFolderSchema.safeParse(req.body)
    );

    // Folder is already validated by middleware
    const folder = req.resource;
    const oldName = folder.name;
    let hasChanges = false;

    // Handle name change
    if (name && name !== folder.name) {
      const sanitizedName = sanitizeInputWithXSS(name);
      const oldPath = folder.path;

      folder.name = sanitizedName;
      await folder.buildPath();
      await folder.updateDescendantsPaths(oldPath, folder.path);

      // Log rename
      await ActivityLog.logFolderRename(
        req.user.id,
        folder,
        oldName,
        sanitizedName,
        getUserInfo(req.user)
      );
      hasChanges = true;
    }

    // Handle description change
    if (description !== undefined && description !== folder.description) {
      folder.description = sanitizeInputWithXSS(description);
      hasChanges = true;
    }

    // Handle color change
    if (color && color !== folder.color) {
      folder.color = color;
      hasChanges = true;
    }

    if (hasChanges) {
      folder.updatedBy = req.user.id;
      await folder.save();
    }

    res.status(200).json({
      success: true,
      message: "Folder updated successfully",
      data: folder,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/folders/:id/move
 * @desc    Move folder to new parent
 * @access  Private - Requires 'delete' on source, 'upload' on destination
 */
export const moveFolder = async (req, res, next) => {
  try {
    const { id } = validateRequest(getFolderByIdSchema.safeParse(req.params));
    const { newParentId } = validateRequest(
      moveFolderSchema.safeParse(req.body)
    );

    const sanitizedParentId = sanitizeAndValidateId(
      newParentId,
      "New Parent ID"
    );

    // Folder is already validated by middleware (has delete permission)
    const folder = req.resource;
    const oldParentId = folder.parentId;

    // Find new parent
    let newParent = await FolderModel.findById(sanitizedParentId);
    let newParentType = "FOLDER";

    if (!newParent || newParent.isDeleted) {
      newParent = await DepartmentModel.findById(sanitizedParentId);
      newParentType = "DEPARTMENT";

      if (!newParent || !newParent.isActive) {
        throw createHttpError(404, "New parent not found");
      }
    }

    // Check upload permission on destination
    const userGroupIds = req.user.groups || [];
    let canUpload = false;

    if (newParentType === "FOLDER") {
      canUpload = await hasPermission(
        req.user,
        newParent,
        "FOLDER",
        "upload",
        userGroupIds
      );
    } else {
      // For department, check implicit access
      const { hasImplicitAccess } = await import(
        "../utils/helper/aclHelpers.js"
      );

      canUpload = hasImplicitAccess(req.user, newParent);
    }

    if (!canUpload) {
      throw createHttpError(
        403,
        "You do not have permission to move folder here"
      );
    }

    // Move folder
    await folder.moveTo(sanitizedParentId);

    // Log activity
    await ActivityLog.logFolderMove(
      req.user.id,
      folder,
      oldParentId,
      sanitizedParentId,
      getUserInfo(req.user)
    );

    res.status(200).json({
      success: true,
      message: "Folder moved successfully",
      data: folder,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   DELETE /api/folders/:id
 * @desc    Soft delete folder
 * @access  Private - Requires 'delete' permission
 */
export const softDeleteFolder = async (req, res, next) => {
  try {
    const { id } = validateRequest(getFolderByIdSchema.safeParse(req.params));

    // Folder is already validated by middleware
    const folder = req.resource;

    if (folder.isDeleted) {
      throw createHttpError(400, "Folder is already deleted");
    }

    await folder.softDelete();

    // Log activity
    await ActivityLog.logFolderDelete(
      req.user.id,
      folder,
      getUserInfo(req.user)
    );

    res.status(200).json({
      success: true,
      message: "Folder deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/folders/:id/restore
 * @desc    Restore soft deleted folder
 * @access  Private - Requires 'delete' permission
 */
export const restoreFolder = async (req, res, next) => {
  try {
    const { id } = validateRequest(getFolderByIdSchema.safeParse(req.params));

    // Folder is already validated by middleware
    const folder = req.resource;

    if (!folder.isDeleted) {
      throw createHttpError(400, "Folder is not deleted");
    }

    await folder.restore();

    // Log activity
    const item = {
      id: folder._id,
      name: folder.name,
      type: "folder",
      itemType: "folder",
      path: folder.path,
      parentId: folder.parentId,
    };
    await ActivityLog.logBulkRestore(
      req.user.id,
      [item],
      getUserInfo(req.user)
    );

    res.status(200).json({
      success: true,
      message: "Folder restored successfully",
      data: folder,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/folders/:id/stats
 * @desc    Get folder statistics
 * @access  Private - Requires 'view' permission
 */
export const getFolderStats = async (req, res, next) => {
  try {
    const { id } = validateRequest(getFolderByIdSchema.safeParse(req.params));

    // Folder is already validated by middleware
    const folder = req.resource;

    const [childFolders, documents, sizeResult] = await Promise.all([
      FolderModel.countDocuments({
        parentId: folder._id,
        isDeleted: false,
      }),
      DocumentModel.countDocuments({
        parentId: folder._id,
        isDeleted: false,
      }),
      DocumentModel.aggregate([
        {
          $match: {
            path: new RegExp(
              `^${folder.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`
            ),
            isDeleted: false,
          },
        },
        {
          $group: {
            _id: null,
            totalSize: { $sum: "$size" },
          },
        },
      ]),
    ]);

    const totalSize = sizeResult.length > 0 ? sizeResult[0].totalSize : 0;

    res.status(200).json({
      success: true,
      data: {
        childFolders,
        documents,
        totalSize,
        totalSizeFormatted: formatBytes(totalSize),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/folders/search
 * @desc    Search folders by name
 * @access  Private
 */
export const searchFolders = async (req, res, next) => {
  try {
    const { q, departmentName } = validateRequest(
      searchFoldersSchema.safeParse(req.query)
    );

    const sanitizedQuery = sanitizeInputWithXSS(q);
    const escapedQuery = sanitizedQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const query = {
      name: { $regex: escapedQuery, $options: "i" },
      isDeleted: false,
    };

    if (departmentName) {
      const sanitizedDeptName = sanitizeInputWithXSS(departmentName);
      const escapedDeptName = sanitizedDeptName.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );
      query.path = new RegExp(`^/${escapedDeptName}/`);
    }

    const folders = await FolderModel.find(query)
      .sort({ name: 1 })
      .limit(50)
      .populate("parentId", "name path");

    // Enrich with department info
    const enrichedFolders = await Promise.all(
      folders.map(async (folder) => {
        const department = await folder.getDepartment();
        return {
          ...folder.toObject(),
          department: department
            ? { _id: department._id, name: department.name }
            : null,
          breadcrumbs: folder.getBreadcrumbs(),
        };
      })
    );

    res.status(200).json({
      success: true,
      count: enrichedFolders.length,
      data: enrichedFolders,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/folders/:id/share
 * @desc    Share folder with users/groups
 * @access  Private - Requires 'share' permission
 */
export const shareFolder = async (req, res, next) => {
  try {
    const { id } = validateRequest(getFolderByIdSchema.safeParse(req.params));
    const { users = [], groups = [] } = validateRequest(
      shareFolderSchema.safeParse(req.body)
    );

    // Folder is already validated by middleware (canShare)
    const folder = req.resource;

    if (folder.isDeleted) {
      throw createHttpError(400, "Cannot share deleted folder");
    }

    const department = await folder.getDepartment();
    if (!department) {
      throw createHttpError(500, "Department not found");
    }

    const sharedWith = [];
    const errors = [];

    // Share with users
    for (const userShare of users) {
      try {
        const targetUserId = sanitizeAndValidateId(userShare.userId, "User ID");

        const targetUser = await mongoose.model("User").findById(targetUserId);
        if (!targetUser || !targetUser.isActive) {
          throw new Error("User not found or inactive");
        }

        // Check if user needs ACL
        const { needsACL } = await import("../utils/helper/aclHelpers.js");

        if (needsACL(targetUser, department)) {
          const acl = await AccessControlModel.grantToSubject(
            "FOLDER",
            folder._id,
            "USER",
            targetUserId,
            userShare.permissions,
            req.user.id
          );

          sharedWith.push({
            subjectType: "USER",
            subjectId: targetUserId,
            subjectName: targetUser.username || targetUser.email,
            permissions: acl.permissions,
          });
        } else {
          sharedWith.push({
            subjectType: "USER",
            subjectId: targetUserId,
            subjectName: targetUser.username || targetUser.email,
            permissions: ["view", "download", "upload", "delete", "share"],
            note: "User has implicit access (admin/owner)",
          });
        }
      } catch (error) {
        errors.push({
          userId: userShare.userId,
          type: "USER",
          error: error.message,
        });
      }
    }

    // Share with groups
    for (const groupShare of groups) {
      try {
        const targetGroupId = sanitizeAndValidateId(
          groupShare.groupId,
          "Group ID"
        );

        const GroupModel = mongoose.model("Group");
        const targetGroup = await GroupModel.findById(targetGroupId);

        if (!targetGroup || !targetGroup.isActive) {
          throw new Error("Group not found or inactive");
        }

        const acl = await AccessControlModel.grantToSubject(
          "FOLDER",
          folder._id,
          "GROUP",
          targetGroupId,
          groupShare.permissions,
          req.user.id
        );

        sharedWith.push({
          subjectType: "GROUP",
          subjectId: targetGroupId,
          subjectName: targetGroup.name,
          permissions: acl.permissions,
        });
      } catch (error) {
        errors.push({
          groupId: groupShare.groupId,
          type: "GROUP",
          error: error.message,
        });
      }
    }

    // Log activity
    if (sharedWith.length > 0) {
      await ActivityLog.logFolderShare(
        req.user.id,
        folder,
        sharedWith,
        getUserInfo(req.user)
      );
    }

    res.status(200).json({
      success: true,
      message: `Folder shared with ${sharedWith.length} subject(s)`,
      data: {
        folder: {
          _id: folder._id,
          name: folder.name,
          path: folder.path,
        },
        sharedWith,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (error) {
    next(error);
  }
};
