// controllers/trashController.js

import createHttpError from 'http-errors';
import FolderModel from '../models/folderModel.js';
import DocumentModel from '../models/documentModel.js';
import mongoose from 'mongoose';
import { 
  sanitizeInputWithXSS, 
  sanitizeAndValidateId,
  validateRequest, 
  sanitizeAndValidateIds
} from '../utils/helper.js';
import { bulkRestoreSchema } from '../validation/commonValidation.js';

const getParentFolderInfo = async (parentId) => {
  if (!parentId) return null;

  try {
    const FolderModelRef = mongoose.model('Folder');
    const DepartmentModel = mongoose.model('Department');

    let parent = await FolderModelRef.findById(parentId);
    if (!parent) {
      parent = await DepartmentModel.findById(parentId);
    }

    if (parent) {
      return {
        id: parent._id.toString(),
        name: parent.name,
        path: parent.path || '/'
      };
    }
  } catch (error) {
    console.error('Error fetching parent folder:', error);
  }

  return null;
};

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

    const [folders, totalFolders] = await Promise.all([
      FolderModel.find(baseQuery)
        .populate("deletedBy", "name email profilePic") // <- populate name, not username
        .sort({ deletedAt: -1 })
        .lean(),
      FolderModel.countDocuments(baseQuery)
    ]);

    const [documents, totalDocuments] = await Promise.all([
      DocumentModel.find(baseQuery)
        .populate("deletedBy", "username email profilePic") // <- populate name, not username
        .sort({ deletedAt: -1 })
        .lean(),
      DocumentModel.countDocuments(baseQuery)
    ]);

    let items = [...folders, ...documents].sort(
      (a, b) => new Date(b.deletedAt) - new Date(a.deletedAt)
    );

    const totalItems = totalFolders + totalDocuments;

    items = items.slice(skip, skip + limit);

    const data = items.map((item) => {
      const deletedAt = new Date(item.deletedAt);
      const autoDeleteDate = new Date(deletedAt);
      autoDeleteDate.setDate(autoDeleteDate.getDate() + 30);

      const now = new Date();
      const diffDays = Math.ceil(
        (autoDeleteDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

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
        deletedBy: item.deletedBy
          ? {
              id: item.deletedBy._id,
              username: item.deletedBy.username, // <- corrected
              email: item.deletedBy.email,
              profilePic: item.deletedBy.profilePic || null
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
 * Restore a single item (auto-detect folder or document)
 * Route: POST /api/trash/restore/:id
 * Access: Private
 */
export const restoreItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const sanitizedId = sanitizeAndValidateId(id, 'Item ID');

    // Try to find as folder first
    let item = await FolderModel.findById(sanitizedId);
    let itemType = 'folder';

    // If not found, try document
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

    // Check if parent exists and is not deleted
    const FolderModelRef = mongoose.model('Folder');
    const DepartmentModel = mongoose.model('Department');

    let parent = await FolderModelRef.findById(item.parent_id);
    if (!parent) {
      parent = await DepartmentModel.findById(item.parent_id);
    }

    if (!parent) {
      throw createHttpError(400, 'Parent folder/department not found');
    }

    if (parent.isDeleted) {
      throw createHttpError(400, 'Cannot restore. Parent is deleted. Please restore parent first.');
    }

    // Restore the item
    await item.restore();

    // If folder, restore all descendants
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
 * Permanently delete a single item (auto-detect folder or document)
 * Route: DELETE /api/trash/:id
 * Access: Private
 */
export const permanentlyDeleteItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const confirmation = req.query.confirmation === 'true';

    if (!confirmation) {
      throw createHttpError(400, 'Confirmation required to permanently delete item');
    }

    const sanitizedId = sanitizeAndValidateId(id, 'Item ID');

    // Try to find as folder first
    let item = await FolderModel.findById(sanitizedId);
    let itemType = 'folder';

    // If not found, try document
    if (!item) {
      item = await DocumentModel.findById(sanitizedId);
      itemType = 'document';
    }

    if (!item) {
      throw createHttpError(404, 'Item not found');
    }

    // If it's a folder, delete all descendants
    if (itemType === 'folder') {
      const escapedPath = item.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      await FolderModel.deleteMany({
        path: new RegExp(`^${escapedPath}/`)
      });

      await DocumentModel.deleteMany({
        path: new RegExp(`^${escapedPath}/`)
      });
    }

    // Delete the item itself
    if (itemType === 'folder') {
      await FolderModel.findByIdAndDelete(sanitizedId);
    } else {
      await DocumentModel.findByIdAndDelete(sanitizedId);
    }

    res.status(200).json({
      success: true,
      message: `${itemType === 'folder' ? 'Folder' : 'Document'} permanently deleted`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Bulk restore multiple items
 * Route: POST /api/trash/restore/bulk
 * Access: Private
 */
export const bulkRestoreItems = async (req, res, next) => {
  try {

    console.log("requested received here .......")
    // Validate request
    const parsed = bulkRestoreSchema.safeParse(req);
    if (!parsed.success) {
      throw createHttpError(400, 'Invalid request payload');
    }

    const { itemIds } = parsed.data.body;

    // Sanitize all IDs
    const sanitizedIds = sanitizeAndValidateIds(itemIds, 'Item ID');

    const restored = [];
    const failed = [];

    for (const itemId of sanitizedIds) {
      try {
        // Try folder first
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

        // Check parent
        const FolderModelRef = mongoose.model('Folder');
        const DepartmentModel = mongoose.model('Department');

        let parent = await FolderModelRef.findById(item.parent_id);
        if (!parent) parent = await DepartmentModel.findById(item.parent_id);

        if (!parent || parent.isDeleted) {
          failed.push({ id: itemId, reason: 'Parent is deleted or not found' });
          continue;
        }

        // Restore item
        await item.restore();

        // If folder, restore descendants
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
      } catch (err) {
        failed.push({ id: itemId, reason: err.message });
      }
    }

    res.status(200).json({
      success: true,
      data: { restored, failed, total: itemIds.length, restoredCount: restored.length, failedCount: failed.length },
      message: `Restored ${restored.length} of ${itemIds.length} items`,
    });
  } catch (error) {
    next(error);
  }
};


/**
 * Bulk permanently delete multiple items
 * Route: POST /api/trash/delete/bulk
 * Access: Private
 */
export const bulkPermanentlyDeleteItems = async (req, res, next) => {
  try {
    const { itemIds, confirmation } = req.body;

    if (!confirmation) {
      throw createHttpError(400, 'Confirmation required to permanently delete items');
    }

    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      throw createHttpError(400, 'itemIds array is required');
    }

    const deleted = [];
    const failed = [];

    for (const itemId of itemIds) {
      try {
        const sanitizedId = sanitizeAndValidateId(itemId, 'Item ID');

        // Try folder first
        let item = await FolderModel.findById(sanitizedId);
        let itemType = 'folder';

        // If not folder, try document
        if (!item) {
          item = await DocumentModel.findById(sanitizedId);
          itemType = 'document';
        }

        if (!item) {
          failed.push({ id: itemId, reason: 'Item not found' });
          continue;
        }

        // If it's a folder, delete all descendants
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
      } catch (error) {
        failed.push({ id: itemId, reason: error.message });
      }
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