import createHttpError from 'http-errors';
import mongoose from 'mongoose';
import FolderModel from '../models/folderModel.js';
import DepartmentModel from '../models/departmentModel.js';
import ActivityLogModel from '../models/activityModel.js';
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
import { ALLOWED_EXTENSIONS } from '../validation/documentValidation.js';

/**
 * Create a new folder
 * Route: POST /api/folders
 * Access: Private
 * Required Fields in body: 
 *   - name: string (required)
 *   - parent_id: string (required) - Department ID or Folder ID
 * Optional Fields in body:
 *   - description: string (optional)
 *   - color: string (optional - hex color code, default: #3B82F6)
 * Auth: req.user.id (from authenticateUser middleware)
 * Response: { success: true, message: string, data: folder }
 */
export const createFolder = async (req, res, next) => {
  try {
    // Debug: Check if body exists
    console.log('Request Body:', req.body);
    
    // Validate body - pass req.body directly to safeParse
    const parsedData = createFolderSchema.safeParse(req.body);
    
    // Debug: Check parse result
    console.log('Parse Success:', parsedData.success);
    if (!parsedData.success) {
      console.log('Parse Errors:', parsedData.error);
    }
    
    validateRequest(parsedData);

    // Extract validated data
    const { name, parent_id, description, color } = parsedData.data;
    const createdBy = req.user.id;

    // Sanitize inputs
    const sanitizedName = sanitizeInputWithXSS(name);
    const sanitizedParentId = sanitizeAndValidateId(parent_id, 'Parent ID');
    const sanitizedDescription = description ? sanitizeInputWithXSS(description) : undefined;

    // Verify parent exists
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

    // Create folder with unique name
    const folder = await FolderModel.create({
      name: uniqueFolderName,
      parent_id: sanitizedParentId,
      description: sanitizedDescription,
      color: color || '#3B82F6',
      createdBy
    });

    const department = await folder.getDepartment();

    // Log activity
    await ActivityLogModel.logActivity({
      action: 'FOLDER_CREATED',
      entityType: 'Folder',
      entityId: folder._id,
      entityName: folder.name,
      performedBy: createdBy,
      performedByName: req.user.name,
      performedByEmail: req.user.email,
      departmentId: department?._id,
      folderId: folder._id,
      description: `Created folder "${folder.name}" in ${parentType} "${parent.name}"${uniqueFolderName !== sanitizedName ? ' (name automatically adjusted to avoid duplicate)' : ''}`,
      metadata: { 
        path: folder.path, 
        parentType,
        originalName: sanitizedName !== uniqueFolderName ? sanitizedName : undefined
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

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
    // Validate params
    const paramsData = getRootFoldersSchema.safeParse(req.params);
    validateRequest(paramsData);

    // Validate query
    const queryData = getRootFoldersQuerySchema.safeParse(req.query);
    validateRequest(queryData);

    const { departmentId } = paramsData.data;
    const { includeDeleted } = queryData.data;

    const sanitizedDeptId = sanitizeAndValidateId(departmentId, 'Department ID');

    // Verify department exists
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
    // Validate params
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
 * - No filters: Returns only direct children
 * - With filters: Returns ALL nested children matching criteria
 * 
 * @route GET /api/folders/:id/children
 * @query type - Filter by type: "folder" or "documents"
 * @query extension - Filter by extension: "pdf", "docx", "xlsx", "jpg", "png", "zip"
 * @query userEmail - Filter by owner/creator email
 * @query search - Search by name
 * @query includeDeleted - Include deleted items
 * @access Private
 * 
 * SMART FILTERING LOGIC:
 * - type=documents → All nested documents (any extension)
 * - extension=pdf → All nested PDFs only
 * - userEmail=xyz → All nested folders + documents by that user
 * - extension=pdf&userEmail=xyz → All nested PDFs by that user
 * - type=folder&userEmail=xyz → All nested folders by that user
 * - No filters → Direct children only
 * 
 * @example
 * GET /api/folders/123/children - Direct children only
 * GET /api/folders/123/children?type=documents - All nested documents
 * GET /api/folders/123/children?extension=pdf - All nested PDFs
 * GET /api/folders/123/children?userEmail=user@example.com - All items by user (folders + docs)
 * GET /api/folders/123/children?extension=pdf&userEmail=user@example.com - PDFs by user
 * GET /api/folders/123/children?type=folder&userEmail=user@example.com - Folders by user
 */
export const getChildFolders = async (req, res, next) => {
  try {
    console.log("🔍 Raw query params:", req.query);
    console.log("🔍 Raw params:", req.params);
    
    // Validate params
    const paramsData = getFolderByIdSchema.safeParse(req.params);
    validateRequest(paramsData);

    // Validate query
    const queryData = getChildFoldersQuerySchema.safeParse(req.query);
    console.log("🔍 Query validation result:", queryData);
    validateRequest(queryData);

    const { id } = paramsData.data;
    const { includeDeleted, type, extension, userEmail, search } = queryData.data;
    
    console.log("🔍 Extracted values:", { includeDeleted, type, extension, userEmail, search });

    const sanitizedId = sanitizeAndValidateId(id, "Parent ID");

    // 🔥 Check if parent is a Folder OR Department
    let parent;
    let parentType;
    
    // Try to find as Folder first
    parent = await FolderModel.findById(sanitizedId);
    
    if (parent) {
      parentType = "folder";
      console.log(`✅ Parent found: Folder "${parent.name}"`);
    } else {
      // If not found as folder, try Department
      parent = await DepartmentModel.findById(sanitizedId);
      
      if (parent) {
        parentType = "department";
        console.log(`✅ Parent found: Department "${parent.name}"`);
      } else {
        throw createHttpError(404, "Parent folder or department not found");
      }
    }

    let children;
    let mode = "direct";

    // If ANY filter is provided, get ALL nested children (Google Drive behavior)
    const hasFilters = type || extension || userEmail || search;

    if (hasFilters) {
      console.log(`🔍 Starting NESTED search from ${parentType}: ${parent.name} (ID: ${sanitizedId})`);
      console.log(`📋 Filters requested: type=${type}, extension=${extension}, userEmail=${userEmail}, search=${search}`);
      
      children = await getAllNestedChildren(
        sanitizedId,
        includeDeleted === "true"
      );
      
      console.log(`📦 Total items found at all depths: ${children.length}`);
      mode = "nested";
    } else {
      // No filters: just get direct children
      // 🔥 FIX: Handle both Folder and Department differently
      if (parentType === "folder") {
        children = await parent.getChildren(includeDeleted === "true");
      } else {
        // For departments, manually query folders with parent_id
        const query = { 
          parent_id: sanitizedId,
          ...(includeDeleted === "true" ? {} : { isDeleted: false })
        };
        children = await FolderModel.find(query).sort({ createdAt: -1 });
      }
      
      // Populate createdBy and updatedBy for direct children
      await FolderModel.populate(children, [
        { path: 'createdBy', select: 'email username' },
        { path: 'updatedBy', select: 'email username' }
      ]);
      
      console.log(`📦 Direct children only: ${children.length} items`);
    }

    // Apply filters in smart order
    let filteredChildren = children;

    // STEP 1: Filter by extension FIRST (most specific)
    if (extension) {
      const ext = extension.toLowerCase();
      
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        throw createHttpError(400, `Invalid extension. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`);
      }

      filteredChildren = filteredChildren.filter((child) => {
        if (child.type === "folder") return false;
        const fileExt = child.extension?.toLowerCase() || child.name?.split(".").pop()?.toLowerCase();
        return fileExt === ext;
      });
      console.log(`🔧 After extension filter (${ext}): ${filteredChildren.length} items`);
    }
    // STEP 2: If no extension, apply type filter
    else if (type) {
      const typeFilter = type.toLowerCase();
      
      if (typeFilter !== "folder" && typeFilter !== "documents") {
        throw createHttpError(400, 'Invalid type. Allowed: "folder" or "documents"');
      }
      
      filteredChildren = filteredChildren.filter(
        (child) => child.type === typeFilter
      );
      console.log(`🔧 After type filter (${typeFilter}): ${filteredChildren.length} items`);
    }

    // STEP 3: Filter by user email
    if (userEmail) {
      const emailLower = userEmail.trim().toLowerCase();
      
      filteredChildren = filteredChildren.filter((child) => {
        const createdByEmail = child.createdBy?.email;
        const updatedByEmail = child.updatedBy?.email;
        const directEmail = child.userEmail;
        
        const matchedEmail = createdByEmail || updatedByEmail || directEmail;
        
        if (matchedEmail && matchedEmail.toLowerCase() === emailLower) {
          console.log(`   ✅ Matched by email: ${child.name} (${matchedEmail})`);
          return true;
        }
        return false;
      });
      console.log(`🔧 After userEmail filter (${emailLower}): ${filteredChildren.length} items`);
    }

    // STEP 4: Filter by search query
    if (search && search.trim().length > 0) {
      const searchLower = search.trim().toLowerCase();
      
      filteredChildren = filteredChildren.filter((child) =>
        child.name.toLowerCase().includes(searchLower) ||
        (child.path && child.path.toLowerCase().includes(searchLower))
      );
      console.log(`🔧 After search filter ("${searchLower}"): ${filteredChildren.length} items`);
    }

    console.log(`✅ Final results: ${filteredChildren.length} items returned`);

    console.log({
      success: true,
      count: filteredChildren.length,
      mode: mode,
      parentType: parentType,
      filters: {
        type: type || null,
        extension: extension || null,
        userEmail: userEmail || null,
        search: search || null,
      },
      data: filteredChildren,
    })

    res.status(200).json({
      success: true,
      count: filteredChildren.length,
      mode: mode,
      parentType: parentType,
      filters: {
        type: type || null,
        extension: extension || null,
        userEmail: userEmail || null,
        search: search || null,
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

  console.log(`🚀 getAllNestedChildren started for folder: ${folderId}`);

  while (queue.length > 0) {
    const { id, path, depth } = queue.shift();

    if (visited.has(id)) {
      console.log(`⚠️ Skipping already visited folder: ${id}`);
      continue;
    }
    visited.add(id);

    console.log(`📂 Processing folder at depth ${depth}: ${id}, path: "${path}"`);

    // 🔥 Try to find as Folder first, then Department
    let parent = await FolderModel.findById(id);
    let children;
    
    if (parent) {
      // It's a folder - use getChildren method
      children = await parent.getChildren(includeDeleted);
    } else {
      // Try as Department
      parent = await DepartmentModel.findById(id);
      if (!parent) {
        console.log(`❌ Parent not found: ${id}`);
        continue;
      }
      
      // For departments, manually query folders
      const query = { 
        parent_id: id,
        ...(includeDeleted ? {} : { isDeleted: false })
      };
      children = await FolderModel.find(query).sort({ createdAt: -1 });
    }
    
    // Populate createdBy and updatedBy
    await FolderModel.populate(children, [
      { path: 'createdBy', select: 'email username' },
      { path: 'updatedBy', select: 'email username' }
    ]);
    
    console.log(`   Found ${children.length} direct children in this folder`);

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
      console.log(`   ✅ Added: [${child.type}] ${child.name} at depth ${childDepth}`);

      if (child.type === "folder" && child._id) {
        queue.push({ 
          id: child._id, 
          path: childPath,
          depth: depth + 1 
        });
        console.log(`   🔽 Queued subfolder for deep search: ${child.name}`);
      }
    }
  }

  console.log(`✨ getAllNestedChildren completed. Total items collected: ${allChildren.length}`);
  
  const folderCount = allChildren.filter(c => c.type === "folder").length;
  const docCount = allChildren.filter(c => c.type === "documents").length;
  console.log(`   📊 Summary: ${folderCount} folders, ${docCount} documents`);

  return allChildren;
}

/**
 * Debug helper to visualize the folder structure
 */
async function debugFolderStructure(folderId, depth = 0) {
  const folder = await FolderModel.findById(folderId);
  if (!folder) return;

  const indent = "  ".repeat(depth);
  console.log(`${indent}📁 ${folder.name} (${folderId})`);

  const children = await folder.getChildren(false);
  for (const child of children) {
    const icon = child.type === "folder" ? "📁" : "📄";
    console.log(`${indent}  ${icon} ${child.name} [${child.type}]`);
    
    if (child.type === "folder") {
      await debugFolderStructure(child._id, depth + 1);
    }
  }
}

/**
 * Get all descendants
 */
export const getAllDescendants = async (req, res, next) => {
  try {
    // Validate params
    const paramsData = getFolderByIdSchema.safeParse(req.params);
    validateRequest(paramsData);

    // Validate query
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
    // Validate params
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
 * Update folder
 */
export const updateFolder = async (req, res, next) => {
  try {
    // Validate params
    const paramsData = getFolderByIdSchema.safeParse(req.params);
    validateRequest(paramsData);

    // Validate body
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

    const changes = {};

    if (name && name !== oldFolder.name) {
      const sanitizedName = sanitizeInputWithXSS(name);
      changes.name = { before: oldFolder.name, after: sanitizedName };
      
      const oldPath = oldFolder.path;
      oldFolder.name = sanitizedName;
      await oldFolder.buildPath();
      const newPath = oldFolder.path;
      
      await oldFolder.updateDescendantsPaths(oldPath, newPath);
    }
    
    if (description !== undefined && description !== oldFolder.description) {
      const sanitizedDesc = sanitizeInputWithXSS(description);
      changes.description = { before: oldFolder.description, after: sanitizedDesc };
      oldFolder.description = sanitizedDesc;
    }
    
    if (color && color !== oldFolder.color) {
      changes.color = { before: oldFolder.color, after: color };
      oldFolder.color = color;
    }

    oldFolder.updatedBy = updatedBy;
    await oldFolder.save();

    const department = await oldFolder.getDepartment();

    await ActivityLogModel.logActivity({
      action: 'FOLDER_UPDATED',
      entityType: 'Folder',
      entityId: oldFolder._id,
      entityName: oldFolder.name,
      performedBy: updatedBy,
      performedByName: req.user.name,
      performedByEmail: req.user.email,
      departmentId: department?._id,
      folderId: oldFolder._id,
      description: `Updated folder "${oldFolder.name}"`,
      changes,
      metadata: { path: oldFolder.path },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

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
 * Move folder
 */
export const moveFolder = async (req, res, next) => {
  try {
    // Validate params
    const paramsData = getFolderByIdSchema.safeParse(req.params);
    validateRequest(paramsData);

    // Validate body
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
    const oldPath = folder.path;
    
    let oldParent = await DepartmentModel.findById(oldParentId);
    if (!oldParent) {
      oldParent = await FolderModel.findById(oldParentId);
    }
    const oldParentName = oldParent?.name || 'Unknown';

    await folder.moveTo(sanitizedParentId);

    let newParent = await DepartmentModel.findById(sanitizedParentId);
    let newParentType = 'Department';
    if (!newParent) {
      newParent = await FolderModel.findById(sanitizedParentId);
      newParentType = 'Folder';
    }
    const newParentName = newParent?.name || 'Unknown';

    const department = await folder.getDepartment();

    await ActivityLogModel.logActivity({
      action: 'FOLDER_MOVED',
      entityType: 'Folder',
      entityId: folder._id,
      entityName: folder.name,
      performedBy: userId,
      performedByName: req.user.name,
      performedByEmail: req.user.email,
      departmentId: department?._id,
      folderId: folder._id,
      description: `Moved folder "${folder.name}" from "${oldParentName}" to "${newParentName}"`,
      changes: {
        parent_id: { before: oldParentId, after: sanitizedParentId },
        path: { before: oldPath, after: folder.path }
      },
      metadata: { newParentType },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

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
 * Soft delete folder
 */
export const softDeleteFolder = async (req, res, next) => {
  try {
    // Validate params
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

    const department = await folder.getDepartment();

    await folder.softDelete();

    await ActivityLogModel.logActivity({
      action: 'FOLDER_DELETED',
      entityType: 'Folder',
      entityId: folder._id,
      entityName: folder.name,
      performedBy: userId,
      performedByName: req.user.name,
      performedByEmail: req.user.email,
      departmentId: department?._id,
      folderId: folder._id,
      description: `Deleted folder "${folder.name}"`,
      metadata: { path: folder.path },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(200).json({
      success: true,
      message: 'Folder deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Restore folder
 */
export const restoreFolder = async (req, res, next) => {
  try {
    // Validate params
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

    const department = await folder.getDepartment();

    await ActivityLogModel.logActivity({
      action: 'FOLDER_RESTORED',
      entityType: 'Folder',
      entityId: folder._id,
      entityName: folder.name,
      performedBy: userId,
      performedByName: req.user.name,
      performedByEmail: req.user.email,
      departmentId: department?._id,
      folderId: folder._id,
      description: `Restored folder "${folder.name}"`,
      metadata: { path: folder.path },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

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
 * Get folder stats
 */
export const getFolderStats = async (req, res, next) => {
  try {
    // Validate params
    const parsedData = getFolderByIdSchema.safeParse(req.params);
    validateRequest(parsedData);

    const { id } = parsedData.data;
    const sanitizedId = sanitizeAndValidateId(id, 'Folder ID');

    const folder = await FolderModel.findById(sanitizedId);

    if (!folder) {
      throw createHttpError(404, 'Folder not found');
    }

    const DocumentModel = (await import('../models/documentModel.js')).default;

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
    // Validate query
    const parsedData = searchFoldersSchema.safeParse(req.query);
    validateRequest(parsedData);

    const { q, departmentName } = parsedData.data;

    // Sanitize search query
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
    // Validate query
    const parsedData = getFolderByPathSchema.safeParse(req.query);
    validateRequest(parsedData);

    const { path } = parsedData.data;

    // Sanitize path
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