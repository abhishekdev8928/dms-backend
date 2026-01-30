/** 
 * TRASH CONTROLLER - Complete Activity Logging Implementation
 * ✅ All restore activities logged
 * ✅ All delete activities logged (NEW)
 * ✅ All permanent delete activities logged (NEW)
 */
import createHttpError from 'http-errors';
import FolderModel from '../models/folderModel.js';
import DocumentModel from '../models/documentModel.js';
import ActivityLog from '../models/activityModel.js';
import mongoose from 'mongoose';
import { 
  sanitizeInputWithXSS, 
  sanitizeAndValidateId,
  validateRequest, 
  sanitizeAndValidateIds
} from '../utils/helper.js';
import { bulkRestoreSchema } from '../validation/commonValidation.js';

/**
 * Helper function to get user info for activity logging
 */
const getUserInfo = (user) => ({
  name: user.name || user.username || 'Unknown User',
  email: user.email || '',
  avatar: user.avatar || user.profilePicture || user.profilePic || null
});

/**
 * Get all deleted items (folders + documents) with pagination
 * Route: GET /api/trash
 * Access: Private
 */
export const getTrashItems = async (req, res, next) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const baseQuery = {
      isDeleted: true,
      deletedAt: { $gte: thirtyDaysAgo, $ne: null }
    };

    // Get all deleted folders
    const [folders, totalFolders] = await Promise.all([
      FolderModel.find(baseQuery)
        .populate("createdBy", "name username email profilePic")
        .sort({ deletedAt: -1 })
        .lean(),
      FolderModel.countDocuments(baseQuery)
    ]);

    // Get all deleted documents
    const [documents, totalDocuments] = await Promise.all([
      DocumentModel.find(baseQuery)
        .populate("deletedBy", "name username email profilePic")
        .sort({ deletedAt: -1 })
        .lean(),
      DocumentModel.countDocuments(baseQuery)
    ]);

    console.log('=== TRASH FILTERING DEBUG ===');
    console.log('Deleted folders:', folders.map(f => ({ 
      id: f._id, 
      name: f.name, 
      path: f.path
    })));
    console.log('Deleted documents:', documents.map(d => ({ 
      id: d._id, 
      name: d.name, 
      path: d.path 
    })));

    // Create a Map of deleted folder full paths for efficient lookup
    const deletedFolderMap = new Map();
    folders.forEach(folder => {
      // The folder.path already contains the full path to this folder
      // We just need to ensure it ends with a slash
      let fullPath = folder.path;
      if (!fullPath.startsWith('/')) fullPath = '/' + fullPath;
      if (!fullPath.endsWith('/')) fullPath = fullPath + '/';
      
      // Normalize by removing duplicate slashes
      fullPath = fullPath.replace(/\/+/g, '/');
      
      deletedFolderMap.set(fullPath, folder);
      console.log(`Folder "${folder.name}" full path: "${fullPath}"`);
    });

    // Filter out folders whose parent folders are also deleted
    const filteredFolders = folders.filter(folder => {
      let folderPath = folder.path;
      if (!folderPath.startsWith('/')) folderPath = '/' + folderPath;
      if (!folderPath.endsWith('/')) folderPath = folderPath + '/';
      
      // Normalize path
      folderPath = folderPath.replace(/\/+/g, '/');
      
      // Root level folders (no parent) - always show
      if (folderPath === '/') return true;
      
      // Check if this folder's path starts with any deleted folder's full path
      for (const [deletedPath, deletedFolder] of deletedFolderMap) {
        // Skip checking against itself
        if (deletedFolder._id.toString() === folder._id.toString()) continue;
        
        // If this folder's path starts with a deleted folder's full path,
        // it means that deleted folder is a parent - exclude this folder
        if (folderPath.startsWith(deletedPath)) {
          console.log(`❌ Excluding folder "${folder.name}" (path: "${folderPath}") - parent "${deletedFolder.name}" (path: "${deletedPath}") is deleted`);
          return false;
        }
      }
      
      console.log(`✅ Including folder "${folder.name}" (path: "${folderPath}")`);
      return true;
    });

    // Filter out documents whose parent folders are deleted
    const filteredDocuments = documents.filter(doc => {
      // Get the document's parent path (the folder it's in)
      // For a document at /welcome/testing/file.jpg
      // We need to check if /welcome/testing/ is a deleted folder
      let docPath = doc.path;
      if (!docPath) docPath = '/';
      if (!docPath.startsWith('/')) docPath = '/' + docPath;
      if (!docPath.endsWith('/')) docPath = docPath + '/';
      
      // Normalize path
      docPath = docPath.replace(/\/+/g, '/');
      
      console.log(`\nChecking document: "${doc.name}" with path: "${docPath}"`);
      
      // Check if the document's path matches or starts with any deleted folder's full path
      for (const [deletedPath, deletedFolder] of deletedFolderMap) {
        console.log(`  Comparing with deleted folder: "${deletedFolder.name}" (${deletedPath})`);
        console.log(`  Does "${docPath}" start with "${deletedPath}"? ${docPath.startsWith(deletedPath)}`);
        console.log(`  Does "${docPath}" equal "${deletedPath}"? ${docPath === deletedPath}`);
        
        // The document is inside this deleted folder if its path equals or starts with the folder's full path
        if (docPath === deletedPath || docPath.startsWith(deletedPath)) {
          console.log(`❌ Excluding document "${doc.name}" (path: "${docPath}") - parent folder "${deletedFolder.name}" (path: "${deletedPath}") is deleted`);
          return false;
        }
      }
      
      console.log(`✅ Including document "${doc.name}" (path: "${docPath}")`);
      return true;
    });

    console.log('=== FILTERING RESULTS ===');
    console.log('Filtered folders:', filteredFolders.length);
    console.log('Filtered documents:', filteredDocuments.length);
    console.log('===========================');

    // Combine and sort filtered items
    let items = [...filteredFolders, ...filteredDocuments].sort(
      (a, b) => new Date(b.deletedAt) - new Date(a.deletedAt)
    );

    const totalItems = filteredFolders.length + filteredDocuments.length;
    items = items.slice(skip, skip + limit);

    const data = items.map((item) => {
      const deletedAt = new Date(item.deletedAt);
      const autoDeleteDate = new Date(deletedAt);
      autoDeleteDate.setDate(autoDeleteDate.getDate() + 30);

      const now = new Date();
      const diffDays = Math.ceil(
        (autoDeleteDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      const deletedByUser = item.deletedBy || item.createdBy;

      return {
        id: item._id,
        name: item.name,
        type: item.type,
        path: item.path,
        deletedAt,
        daysUntilAutoDelete: Math.max(diffDays, 0),
        autoDeleteDate,
        size: item.size || null,
        description: item.description || null,
        deletedBy: deletedByUser
          ? {
              id: deletedByUser._id,
              name: deletedByUser.name,
              username: deletedByUser.username,
              email: deletedByUser.email,
              profilePic: deletedByUser.profilePic || null
            }
          : null
      };
    });

    res.status(200).json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total: totalItems,
        totalPages: Math.ceil(totalItems / limit)
      },
      message: "Trash items retrieved successfully"
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ✅ ACTIVITY LOGGED: Restore a single item
 * Route: POST /api/trash/restore/:id
 * Activity: FILE_RESTORED or FOLDER_RESTORED
 */
export const restoreItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const sanitizedId = sanitizeAndValidateId(id, 'Item ID');

    let item = await FolderModel.findById(sanitizedId);
    let itemType = 'folder';

    if (!item) {
      item = await DocumentModel.findById(sanitizedId);
      itemType = 'document';
    }

    if (!item) {
      throw createHttpError(404, 'Item not found');
    }

    if (!item.isDeleted) {
      throw createHttpError(400, 'Item is not deleted');
    }

    const FolderModelRef = mongoose.model('Folder');
    const DepartmentModel = mongoose.model('Department');

    let parent = await FolderModelRef.findById(item.parentId);

    
    if (!parent) {
      parent = await DepartmentModel.findById(item.parentId);
    }

    if (!parent) {
      throw createHttpError(400, 'Parent folder/department not found');
    }

    if (parent.isDeleted) {
      throw createHttpError(400, 'Cannot restore. Parent is deleted. Please restore parent first.');
    }

    await item.restore();

    if (itemType === 'folder') {
      const escapedPath = item.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      await FolderModelRef.updateMany(
        { path: new RegExp(`^${escapedPath}/`), isDeleted: true },
        { isDeleted: false, deletedAt: null }
      );

      await DocumentModel.updateMany(
        { path: new RegExp(`^${escapedPath}/`), isDeleted: true },
        { isDeleted: false, deletedAt: null }
      );
    }

    // ✅ ACTIVITY LOG: FILE_RESTORED or FOLDER_RESTORED
    const userInfo = getUserInfo(req.user);
    const restoredItem = {
      id: item._id,
      name: item.name,
      type: itemType,
      itemType: itemType,
      path: item.path,
      parent_id: item.parent_id
    };

    if (itemType === 'document') {
      restoredItem.extension = item.extension || '';
      restoredItem.size = item.size || 0;
    }

    await ActivityLog.logBulkRestore(userId, [restoredItem], userInfo);

    res.status(200).json({
      success: true,
      data: {
        id: item._id,
        name: item.name,
        type: itemType,
      },
      message: `${itemType === 'folder' ? 'Folder' : 'Document'} restored successfully`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ✅ ACTIVITY LOGGED: Permanently delete a single item
 * Route: DELETE /api/trash/:id
 * Activity: Logged via logBulkPermanentDelete
 */
export const permanentlyDeleteItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const confirmation = req.query.confirmation === 'true';
    const userId = req.user.id;

    if (!confirmation) {
      throw createHttpError(400, 'Confirmation required to permanently delete item');
    }

    const sanitizedId = sanitizeAndValidateId(id, 'Item ID');

    let item = await FolderModel.findById(sanitizedId);
    let itemType = 'folder';

    if (!item) {
      item = await DocumentModel.findById(sanitizedId);
      itemType = 'document';
    }

    if (!item) {
      throw createHttpError(404, 'Item not found');
    }

    // 🆕 Prepare item data for activity log BEFORE deletion
    const itemData = {
      id: item._id,
      name: item.name,
      type: itemType,
      itemType: itemType,
      path: item.path,
      parent_id: item.parent_id
    };

    if (itemType === 'document') {
      itemData.extension = item.extension || '';
      itemData.size = item.size || 0;
    }

    // Delete descendants if folder
    if (itemType === 'folder') {
      const escapedPath = item.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      await FolderModel.deleteMany({
        path: new RegExp(`^${escapedPath}/`)
      });

      await DocumentModel.deleteMany({
        path: new RegExp(`^${escapedPath}/`)
      });
    }

    // Delete the item
    if (itemType === 'folder') {
      await FolderModel.findByIdAndDelete(sanitizedId);
    } else {
      await DocumentModel.findByIdAndDelete(sanitizedId);
    }

    // ✅ ACTIVITY LOG: Log permanent deletion (uses single item via logBulkPermanentDelete)
    const userInfo = getUserInfo(req.user);
    await ActivityLog.logBulkPermanentDelete(userId, [itemData], userInfo);

    res.status(200).json({
      success: true,
      message: `${itemType === 'folder' ? 'Folder' : 'Document'} permanently deleted`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ✅ ACTIVITY LOGGED: Bulk restore multiple items
 * Route: POST /api/trash/restore/bulk
 * Activity: ITEMS_RESTORED
 */
export const bulkRestoreItems = async (req, res, next) => {
  try {
    console.log("Bulk restore requested...");
    
    const userId = req.user.id;
    
    const parsed = bulkRestoreSchema.safeParse(req);
    if (!parsed.success) {
      throw createHttpError(400, 'Invalid request payload');
    }

    const { itemIds } = parsed.data.body;
    const sanitizedIds = sanitizeAndValidateIds(itemIds, 'Item ID');

    const restored = [];
    const failed = [];
    const restoredItems = [];

    for (const itemId of sanitizedIds) {
      try {
        let item = await FolderModel.findById(itemId);
        let itemType = 'folder';

        if (!item) {
          item = await DocumentModel.findById(itemId);
          itemType = 'document';
        }

        if (!item) {
          failed.push({ id: itemId, reason: 'Item not found' });
          continue;
        }

        if (!item.isDeleted) {
          failed.push({ id: itemId, reason: 'Item is not deleted' });
          continue;
        }

        const FolderModelRef = mongoose.model('Folder');
        const DepartmentModel = mongoose.model('Department');

        let parent = await FolderModelRef.findById(item.parent_id);
        if (!parent) parent = await DepartmentModel.findById(item.parent_id);

        if (!parent || parent.isDeleted) {
          failed.push({ id: itemId, reason: 'Parent is deleted or not found' });
          continue;
        }

        await item.restore();

        if (itemType === 'folder') {
          const escapedPath = item.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          await FolderModelRef.updateMany(
            { path: new RegExp(`^${escapedPath}/`), isDeleted: true },
            { isDeleted: false, deletedAt: null }
          );
          await DocumentModel.updateMany(
            { path: new RegExp(`^${escapedPath}/`), isDeleted: true },
            { isDeleted: false, deletedAt: null }
          );
        }

        restored.push({ id: itemId, type: itemType, name: item.name });

        const restoredItem = {
          id: item._id,
          name: item.name,
          type: itemType,
          itemType: itemType,
          path: item.path,
          parent_id: item.parent_id
        };

        if (itemType === 'document') {
          restoredItem.extension = item.extension || '';
          restoredItem.size = item.size || 0;
        }

        restoredItems.push(restoredItem);

      } catch (err) {
        failed.push({ id: itemId, reason: err.message });
      }
    }

    // ✅ ACTIVITY LOG: ITEMS_RESTORED
    if (restoredItems.length > 0) {
      const userInfo = getUserInfo(req.user);
      await ActivityLog.logBulkRestore(userId, restoredItems, userInfo);
    }

    res.status(200).json({
      success: true,
      data: { 
        restored, 
        failed, 
        total: itemIds.length, 
        restoredCount: restored.length, 
        failedCount: failed.length
      },
      message: `Restored ${restored.length} of ${itemIds.length} items`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ✅ ACTIVITY LOGGED: Bulk permanently delete multiple items
 * Route: POST /api/trash/delete/bulk
 * Activity: ITEMS_PERMANENTLY_DELETED
 */
export const bulkPermanentlyDeleteItems = async (req, res, next) => {
  try {
    const { itemIds, confirmation } = req.body;
    const userId = req.user.id;

    if (!confirmation) {
      throw createHttpError(400, 'Confirmation required to permanently delete items');
    }

    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      throw createHttpError(400, 'itemIds array is required');
    }

    const deleted = [];
    const failed = [];
    const deletedItems = []; // For activity logging

    for (const itemId of itemIds) {
      try {
        const sanitizedId = sanitizeAndValidateId(itemId, 'Item ID');

        let item = await FolderModel.findById(sanitizedId);
        let itemType = 'folder';

        if (!item) {
          item = await DocumentModel.findById(sanitizedId);
          itemType = 'document';
        }

        if (!item) {
          failed.push({ id: itemId, reason: 'Item not found' });
          continue;
        }

        // 🆕 Prepare item data for activity log BEFORE deletion
        const itemData = {
          id: item._id,
          name: item.name,
          type: itemType,
          itemType: itemType,
          path: item.path,
          parent_id: item.parent_id
        };

        if (itemType === 'document') {
          itemData.extension = item.extension || '';
          itemData.size = item.size || 0;
        }

        // Delete descendants if folder
        if (itemType === 'folder') {
          const escapedPath = item.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          
          await FolderModel.deleteMany({
            path: new RegExp(`^${escapedPath}/`)
          });

          await DocumentModel.deleteMany({
            path: new RegExp(`^${escapedPath}/`)
          });

          await FolderModel.findByIdAndDelete(sanitizedId);
        } else {
          await DocumentModel.findByIdAndDelete(sanitizedId);
        }

        deleted.push({ id: itemId, type: itemType, name: item.name });
        deletedItems.push(itemData);

      } catch (error) {
        failed.push({ id: itemId, reason: error.message });
      }
    }

    // ✅ ACTIVITY LOG: ITEMS_PERMANENTLY_DELETED
    if (deletedItems.length > 0) {
      const userInfo = getUserInfo(req.user);
      await ActivityLog.logBulkPermanentDelete(userId, deletedItems, userInfo);
    }

    res.status(200).json({
      success: true,
      data: {
        deleted,
        failed,
        total: itemIds.length,
        deletedCount: deleted.length,
        failedCount: failed.length,
      },
      message: `Permanently deleted ${deleted.length} of ${itemIds.length} items`,
    });
  } catch (error) {
    next(error);
  }
};