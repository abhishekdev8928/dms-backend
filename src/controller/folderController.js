/** 
 * FOLDER CONTROLLERS - Complete Activity Logging Implementation
 * ✅ All folder activities logged using new Activity Model static methods
 * ✅ Proper userInfo object passed (name, email, avatar)
 */
import createHttpError from 'http-errors';
import mongoose from 'mongoose';
import FolderModel from '../models/folderModel.js';
import DepartmentModel from '../models/departmentModel.js';
import ActivityLog from '../models/activityModel.js';
import { 
  sanitizeInputWithXSS, 
  sanitizeAndValidateId,
  validateRequest 
} from '../utils/helper.js';
import {
  createFolderSchema,
  getRootFoldersSchema,
  getRootFoldersQuerySchema,
  getFolderByIdSchema,
  getChildFoldersQuerySchema,
  getAllDescendantsQuerySchema,
  updateFolderSchema,
  moveFolderSchema,
  searchFoldersSchema,
  getFolderByPathSchema
} from '../validation/folderValidation.js';
import DocumentModel from '../models/documentModel.js';

/**
 * Helper function to get user info for activity logging
 */
const getUserInfo = (user) => ({
  name: user.name || user.username || 'Unknown User',
  email: user.email || '',
  avatar: user.avatar || user.profilePicture || null
});

/**
 * ✅ ACTIVITY LOGGED: Create a new folder
 * Route: POST /api/folders
 * Activity: FOLDER_CREATED
 */
export const createFolder = async (req, res, next) => {
  try {
    const parsedData = createFolderSchema.safeParse(req.body);
    validateRequest(parsedData);

    const { name, parent_id, description, color } = parsedData.data;
    const createdBy = req.user.id;

    const sanitizedName = sanitizeInputWithXSS(name);
    const sanitizedParentId = sanitizeAndValidateId(parent_id, 'Parent ID');
    const sanitizedDescription = description ? sanitizeInputWithXSS(description) : undefined;

    // Find parent (Department or Folder)
    let parent = await DepartmentModel.findById(sanitizedParentId);
    let parentType = 'Department';
    
    if (!parent) {
      parent = await FolderModel.findById(sanitizedParentId);
      parentType = 'Folder';
    }

    if (!parent) {
      throw createHttpError(404, 'Parent (Department or Folder) not found');
    }

    // Generate unique folder name if duplicate exists
    let uniqueFolderName = sanitizedName;
    let counter = 1;
    let existingFolder = await FolderModel.findOne({
      parent_id: sanitizedParentId,
      name: { $regex: new RegExp(`^${sanitizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });

    while (existingFolder) {
      uniqueFolderName = `${sanitizedName} (${counter})`;
      existingFolder = await FolderModel.findOne({
        parent_id: sanitizedParentId,
        name: { $regex: new RegExp(`^${uniqueFolderName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      });
      counter++;
    }

    // Create the folder
    const folder = await FolderModel.create({
      name: uniqueFolderName,
      parent_id: sanitizedParentId,
      description: sanitizedDescription,
      color: color || '#3B82F6',
      createdBy
    });

    // ✅ ACTIVITY LOG: FOLDER_CREATED
    const userInfo = getUserInfo(req.user);
    await ActivityLog.logFolderCreate(
      createdBy,
      folder,
      sanitizedParentId,
      userInfo
    );

    res.status(201).json({
      success: true,
      message: uniqueFolderName !== sanitizedName 
        ? `Folder created successfully as "${uniqueFolderName}" (original name was already in use)`
        : 'Folder created successfully',
      data: folder
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all root folders of a department
 */
export const getRootFolders = async (req, res, next) => {
  try {
    const paramsData = getRootFoldersSchema.safeParse(req.params);
    validateRequest(paramsData);

    const queryData = getRootFoldersQuerySchema.safeParse(req.query);
    validateRequest(queryData);

    const { departmentId } = paramsData.data;
    const { includeDeleted } = queryData.data;

    const sanitizedDeptId = sanitizeAndValidateId(departmentId, 'Department ID');

    const department = await DepartmentModel.findById(sanitizedDeptId);
    if (!department) {
      throw createHttpError(404, 'Department not found');
    }

    const folders = await FolderModel.getRootFoldersForDepartment(
      sanitizedDeptId,
      includeDeleted === 'true'
    );

    res.status(200).json({
      success: true,
      count: folders.length,
      data: folders
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get folder by ID
 */
export const getFolderById = async (req, res, next) => {
  try {
    const parsedData = getFolderByIdSchema.safeParse(req.params);
    validateRequest(parsedData);

    const { id } = parsedData.data;
    const sanitizedId = sanitizeAndValidateId(id, 'Folder ID');

    const folder = await FolderModel.findById(sanitizedId)
      .populate('parent_id', 'name path')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!folder) {
      throw createHttpError(404, 'Folder not found');
    }

    const department = await folder.getDepartment();
    const breadcrumbs = folder.getBreadcrumbs();

    res.status(200).json({
      success: true,
      data: {
        ...folder.toObject(),
        department: department ? { _id: department._id, name: department.name } : null,
        breadcrumbs
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get child folders/files with advanced filtering
 */
export const getChildFolders = async (req, res, next) => {
  try {
    const paramsData = getFolderByIdSchema.safeParse(req.params);
    validateRequest(paramsData);

    const queryData = getChildFoldersQuerySchema.safeParse(req.query);
    validateRequest(queryData);

    const { id } = paramsData.data;
    const { includeDeleted, type, userEmail } = queryData.data;

    const sanitizedId = sanitizeAndValidateId(id, "Parent ID");

    let parent;
    let parentType;
    
    parent = await FolderModel.findById(sanitizedId);
    
    if (parent) {
      parentType = "folder";
    } else {
      parent = await DepartmentModel.findById(sanitizedId);
      
      if (parent) {
        parentType = "department";
      } else {
        throw createHttpError(404, "Parent folder or department not found");
      }
    }

    let children;
    let mode = "direct";

    const hasFilters = type || userEmail;

    if (hasFilters) {
      children = await getAllNestedChildren(
        sanitizedId,
        includeDeleted === "true"
      );
      mode = "nested";
    } else {
      if (parentType === "folder") {
        children = await parent.getChildren(includeDeleted === "true");
      } else {
        const query = { 
          parent_id: sanitizedId,
          ...(includeDeleted === "true" ? {} : { isDeleted: false })
        };

        const folders = await FolderModel.find(query).sort({ createdAt: -1 });
        const documents = await DocumentModel.find(query).sort({ createdAt: -1 });

        children = [...folders, ...documents];
      }
      
      await FolderModel.populate(children, [
        { path: 'createdBy', select: 'email username' },
        { path: 'updatedBy', select: 'email username' }
      ]);
    }

    let filteredChildren = children;

    if (type) {
      const typeFilter = type.toLowerCase();
      filteredChildren = filteredChildren.filter(
        (child) => child.type && child.type.toLowerCase() === typeFilter
      );
    }

    if (userEmail) {
      const emailLower = userEmail.trim().toLowerCase();
      filteredChildren = filteredChildren.filter((child) => {
        const createdByEmail = child.createdBy?.email;
        const updatedByEmail = child.updatedBy?.email;
        const directEmail = child.userEmail;
        
        const matchedEmail = createdByEmail || updatedByEmail || directEmail;
        return matchedEmail && matchedEmail.toLowerCase() === emailLower;
      });
    }

    res.status(200).json({
      success: true,
      count: filteredChildren.length,
      mode: mode,
      parentType: parentType,
      filters: {
        type: type || null,
        userEmail: userEmail || null,
      },
      children: filteredChildren,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Recursively get all nested children from a folder
 */
async function getAllNestedChildren(folderId, includeDeleted = false) {
  const allChildren = [];
  const queue = [{ id: folderId, path: "", depth: 0 }];
  const visited = new Set();

  while (queue.length > 0) {
    const { id, path, depth } = queue.shift();

    if (visited.has(id)) {
      continue;
    }
    visited.add(id);

    let parent = await FolderModel.findById(id);
    let children;
    
    if (parent) {
      children = await parent.getChildren(includeDeleted);
    } else {
      parent = await DepartmentModel.findById(id);
      if (!parent) {
        continue;
      }
      
      const query = { 
        parent_id: id,
        ...(includeDeleted ? {} : { isDeleted: false })
      };
      
      const folders = await FolderModel.find(query).sort({ createdAt: -1 });
      const documents = await DocumentModel.find(query).sort({ createdAt: -1 });
      children = [...folders, ...documents];
    }
    
    await FolderModel.populate(children, [
      { path: 'createdBy', select: 'email username' },
      { path: 'updatedBy', select: 'email username' }
    ]);

    for (const child of children) {
      const childPath = path ? `${path}/${child.name}` : child.name;
      const childDepth = path.split("/").filter(Boolean).length;

      const childData = {
        ...(child.toObject ? child.toObject() : child),
        path: childPath,
        parentPath: path,
        depth: childDepth,
        parentId: id,
      };

      allChildren.push(childData);

      if (child.type === "folder" && child._id) {
        queue.push({ 
          id: child._id, 
          path: childPath,
          depth: depth + 1 
        });
      }
    }
  }

  return allChildren;
}

/**
 * Get all descendants
 */
export const getAllDescendants = async (req, res, next) => {
  try {
    const paramsData = getFolderByIdSchema.safeParse(req.params);
    validateRequest(paramsData);

    const queryData = getAllDescendantsQuerySchema.safeParse(req.query);
    validateRequest(queryData);

    const { id } = paramsData.data;
    const { includeDeleted, type } = queryData.data;

    const sanitizedId = sanitizeAndValidateId(id, 'Folder ID');

    const folder = await FolderModel.findById(sanitizedId);

    if (!folder) {
      throw createHttpError(404, 'Folder not found');
    }

    let descendants = await folder.getAllDescendants(includeDeleted === 'true');

    if (type) {
      descendants = descendants.filter(desc => desc.type === type);
    }

    res.status(200).json({
      success: true,
      count: descendants.length,
      data: descendants
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get breadcrumbs
 */
export const getFolderBreadcrumbs = async (req, res, next) => {
  try {
    const parsedData = getFolderByIdSchema.safeParse(req.params);
    validateRequest(parsedData);

    const { id } = parsedData.data;
    const sanitizedId = sanitizeAndValidateId(id, 'Folder ID');

    const folder = await FolderModel.findById(sanitizedId);

    if (!folder) {
      throw createHttpError(404, 'Folder not found');
    }

    const breadcrumbs = folder.getBreadcrumbs();

    res.status(200).json({
      success: true,
      data: {
        path: folder.path,
        breadcrumbs
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ✅ ACTIVITY LOGGED: Update folder with rename
 * Route: PUT /api/folders/:id
 * Activity: FOLDER_RENAMED (if name changes)
 */
export const updateFolder = async (req, res, next) => {
  try {
    const paramsData = getFolderByIdSchema.safeParse(req.params);
    validateRequest(paramsData);

    const bodyData = updateFolderSchema.safeParse(req.body);
    validateRequest(bodyData);

    const { id } = paramsData.data;
    const { name, description, color } = bodyData.data;
    const updatedBy = req.user.id;

    const sanitizedId = sanitizeAndValidateId(id, 'Folder ID');

    const oldFolder = await FolderModel.findById(sanitizedId);

    if (!oldFolder) {
      throw createHttpError(404, 'Folder not found');
    }

    const oldName = oldFolder.name;
    let hasChanges = false;

    // Handle name change with activity logging
    if (name && name !== oldFolder.name) {
      const sanitizedName = sanitizeInputWithXSS(name);
      
      const oldPath = oldFolder.path;
      oldFolder.name = sanitizedName;
      await oldFolder.buildPath();
      const newPath = oldFolder.path;
      
      await oldFolder.updateDescendantsPaths(oldPath, newPath);
      
      // ✅ ACTIVITY LOG: FOLDER_RENAMED
      const userInfo = getUserInfo(req.user);
      await ActivityLog.logFolderRename(
        updatedBy,
        oldFolder,
        oldName,
        sanitizedName,
        userInfo
      );
      
      hasChanges = true;
    }
    
    if (description !== undefined && description !== oldFolder.description) {
      const sanitizedDesc = sanitizeInputWithXSS(description);
      oldFolder.description = sanitizedDesc;
      hasChanges = true;
    }
    
    if (color && color !== oldFolder.color) {
      oldFolder.color = color;
      hasChanges = true;
    }

    if (hasChanges) {
      oldFolder.updatedBy = updatedBy;
      await oldFolder.save();
    }

    res.status(200).json({
      success: true,
      message: 'Folder updated successfully',
      data: oldFolder
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ✅ ACTIVITY LOGGED: Move folder
 * Route: PUT /api/folders/:id/move
 * Activity: FOLDER_MOVED
 */
export const moveFolder = async (req, res, next) => {
  try {
    const paramsData = getFolderByIdSchema.safeParse(req.params);
    validateRequest(paramsData);

    const bodyData = moveFolderSchema.safeParse(req.body);
    validateRequest(bodyData);

    const { id } = paramsData.data;
    const { newParentId } = bodyData.data;
    const userId = req.user.id;

    const sanitizedId = sanitizeAndValidateId(id, 'Folder ID');
    const sanitizedParentId = sanitizeAndValidateId(newParentId, 'New Parent ID');

    const folder = await FolderModel.findById(sanitizedId);

    if (!folder) {
      throw createHttpError(404, 'Folder not found');
    }

    const oldParentId = folder.parent_id;

    // Move the folder
    await folder.moveTo(sanitizedParentId);

    // ✅ ACTIVITY LOG: FOLDER_MOVED
    const userInfo = getUserInfo(req.user);
    await ActivityLog.logFolderMove(
      userId,
      folder,
      oldParentId,
      sanitizedParentId,
      userInfo
    );

    res.status(200).json({
      success: true,
      message: 'Folder moved successfully',
      data: folder
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ✅ ACTIVITY LOGGED: Soft delete folder
 * Route: DELETE /api/folders/:id
 * Activity: FOLDER_DELETED
 */
export const softDeleteFolder = async (req, res, next) => {
  try {
    const parsedData = getFolderByIdSchema.safeParse(req.params);
    validateRequest(parsedData);

    const { id } = parsedData.data;
    const userId = req.user.id;

    const sanitizedId = sanitizeAndValidateId(id, 'Folder ID');

    const folder = await FolderModel.findById(sanitizedId);

    if (!folder) {
      throw createHttpError(404, 'Folder not found');
    }

    if (folder.isDeleted) {
      throw createHttpError(400, 'Folder is already deleted');
    }

    await folder.softDelete();

    // ✅ ACTIVITY LOG: FOLDER_DELETED
    const userInfo = getUserInfo(req.user);
    await ActivityLog.logFolderDelete(userId, folder, userInfo);

    res.status(200).json({
      success: true,
      message: 'Folder deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ✅ ACTIVITY LOGGED: Restore folder
 * Route: POST /api/folders/:id/restore
 * Activity: FOLDER_RESTORED (single item via logBulkRestore)
 */
export const restoreFolder = async (req, res, next) => {
  try {
    const parsedData = getFolderByIdSchema.safeParse(req.params);
    validateRequest(parsedData);

    const { id } = parsedData.data;
    const userId = req.user.id;

    const sanitizedId = sanitizeAndValidateId(id, 'Folder ID');

    const folder = await FolderModel.findById(sanitizedId);

    if (!folder) {
      throw createHttpError(404, 'Folder not found');
    }

    if (!folder.isDeleted) {
      throw createHttpError(400, 'Folder is not deleted');
    }

    await folder.restore();

    // ✅ ACTIVITY LOG: FOLDER_RESTORED (via logBulkRestore with single item)
    const userInfo = getUserInfo(req.user);
    const item = {
      id: folder._id,
      name: folder.name,
      type: 'folder',
      itemType: 'folder',
      path: folder.path,
      parent_id: folder.parent_id
    };
    
    await ActivityLog.logBulkRestore(userId, [item], userInfo);

    res.status(200).json({
      success: true,
      message: 'Folder restored successfully',
      data: folder
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ✅ ACTIVITY LOGGED: Bulk restore folders and files
 * Route: POST /api/folders/bulk-restore
 * Activity: ITEMS_RESTORED (via logBulkRestore)
 */
export const bulkRestoreFolders = async (req, res, next) => {
  try {
    const { items } = req.body; // Array of {id, type: 'folder' | 'file'}
    const userId = req.user.id;

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw createHttpError(400, 'Items array is required');
    }

    const restoredItems = [];
    const errors = [];

    // Restore each item
    for (const item of items) {
      try {
        if (item.type === 'folder') {
          const folder = await FolderModel.findById(item.id);
          if (folder && folder.isDeleted) {
            await folder.restore();
            restoredItems.push({
              id: folder._id,
              name: folder.name,
              type: 'folder',
              itemType: 'folder',
              path: folder.path,
              parent_id: folder.parent_id
            });
          }
        } else if (item.type === 'file') {
          const file = await DocumentModel.findById(item.id);
          if (file && file.isDeleted) {
            await file.restore();
            restoredItems.push({
              id: file._id,
              name: file.name,
              extension: file.extension || '',
              type: 'file',
              itemType: 'file',
              size: file.size || 0,
              path: file.path,
              parent_id: file.parent_id
            });
          }
        }
      } catch (error) {
        errors.push({
          id: item.id,
          type: item.type,
          error: error.message
        });
      }
    }

    // ✅ ACTIVITY LOG: ITEMS_RESTORED (bulk restore)
    if (restoredItems.length > 0) {
      const userInfo = getUserInfo(req.user);
      await ActivityLog.logBulkRestore(userId, restoredItems, userInfo);
    }

    res.status(200).json({
      success: true,
      message: `Successfully restored ${restoredItems.length} items`,
      data: {
        restored: restoredItems,
        errors: errors
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get folder stats
 */
export const getFolderStats = async (req, res, next) => {
  try {
    const parsedData = getFolderByIdSchema.safeParse(req.params);
    validateRequest(parsedData);

    const { id } = parsedData.data;
    const sanitizedId = sanitizeAndValidateId(id, 'Folder ID');

    const folder = await FolderModel.findById(sanitizedId);

    if (!folder) {
      throw createHttpError(404, 'Folder not found');
    }

    const Item = mongoose.model('Item');
    const childFolders = await Item.countDocuments({
      parent_id: sanitizedId,
      type: 'folder',
      isDeleted: false
    });

    const documents = await DocumentModel.countDocuments({
      parent_id: sanitizedId,
      isDeleted: false
    });

    const escapedPath = folder.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const sizeResult = await DocumentModel.aggregate([
      {
        $match: {
          path: new RegExp(`^${escapedPath}/`),
          isDeleted: false
        }
      },
      {
        $group: {
          _id: null,
          totalSize: { $sum: '$size' }
        }
      }
    ]);

    const totalSize = sizeResult.length > 0 ? sizeResult[0].totalSize : 0;

    res.status(200).json({
      success: true,
      data: {
        childFolders,
        documents,
        totalSize,
        totalSizeFormatted: formatBytes(totalSize)
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Search folders
 */
export const searchFolders = async (req, res, next) => {
  try {
    const parsedData = searchFoldersSchema.safeParse(req.query);
    validateRequest(parsedData);

    const { q, departmentName } = parsedData.data;

    const sanitizedQuery = sanitizeInputWithXSS(q);
    const escapedQuery = sanitizedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const query = {
      name: { $regex: escapedQuery, $options: 'i' },
      isDeleted: false
    };

    if (departmentName) {
      const sanitizedDeptName = sanitizeInputWithXSS(departmentName);
      const escapedDeptName = sanitizedDeptName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.path = new RegExp(`^/${escapedDeptName}/`);
    }

    const folders = await FolderModel.find(query)
      .sort({ name: 1 })
      .limit(50)
      .populate('parent_id', 'name path');

    const enrichedFolders = await Promise.all(
      folders.map(async (folder) => {
        const department = await folder.getDepartment();
        return {
          ...folder.toObject(),
          department: department ? { _id: department._id, name: department.name } : null,
          breadcrumbs: folder.getBreadcrumbs()
        };
      })
    );

    res.status(200).json({
      success: true,
      count: enrichedFolders.length,
      data: enrichedFolders
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get folder by path
 */
export const getFolderByPath = async (req, res, next) => {
  try {
    const parsedData = getFolderByPathSchema.safeParse(req.query);
    validateRequest(parsedData);

    const { path } = parsedData.data;

    const sanitizedPath = sanitizeInputWithXSS(path);

    const folder = await FolderModel.findByPath(sanitizedPath);

    if (!folder) {
      throw createHttpError(404, 'Folder not found at specified path');
    }

    const department = await folder.getDepartment();

    res.status(200).json({
      success: true,
      data: {
        ...folder.toObject(),
        department: department ? { _id: department._id, name: department.name } : null,
        breadcrumbs: folder.getBreadcrumbs()
      }
    });
  } catch (error) {
    next(error);
  }
};

// Helper function
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}