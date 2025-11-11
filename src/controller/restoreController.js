import createHttpError from 'http-errors';
import FolderModel from '../models/folderModel.js';
import DocumentModel from '../models/documentModel.js';
import mongoose from 'mongoose';
import { 
  sanitizeInputWithXSS, 
  sanitizeAndValidateId,
  validateRequest 
} from '../utils/helper.js';
import {
  getTrashItemsSchema,
  restoreFromTrashSchema,
  permanentDeleteSchema,
  emptyTrashSchema,
  bulkRestoreSchema,
} from '../validation/restoreValidation.js';

/**
 * Get all deleted items (folders and documents) with filters
 * Route: GET /api/trash
 * Access: Private
 * Query:
 *   - page: number (optional, default: 1) - Page number
 *   - limit: number (optional, default: 20, max: 100) - Items per page
 *   - search: string (optional) - Search by name or email
 *   - sortBy: string (optional, default: 'deletedAt') - Field to sort by
 *   - order: 'asc' | 'desc' (optional, default: 'desc') - Sort order
 *   - type: 'all' | 'folder' | 'document' (optional, default: 'all') - Filter by item type
 *   - deletedBy: 'anyone' | 'me' (optional, default: 'anyone') - Filter by who deleted
 *   - dateDeleted: 'all' | 'last7days' | 'last30days' | 'older' (optional, default: 'all') - Filter by deletion date
 * Response: { success: true, data: [items], pagination: {...}, filters: {...}, message }
 */
export const getTrashItems = async (req, res, next) => {
  try {
    // Validate query params
    const parsedData = getTrashItemsSchema.safeParse(req.query);
    validateRequest(parsedData);

    const {
      page = 1,
      limit = 20,
      search = '',
      sortBy = 'deletedAt',
      order = 'desc',
      type = 'all',
      deletedBy = 'anyone',
      dateDeleted = 'all',
    } = parsedData.data;

    const skip = (page - 1) * limit;
    const sortOrder = order === 'asc' ? 1 : -1;

    // Calculate 30 days ago for auto-delete check
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Base query - items deleted within last 30 days
    const baseQuery = {
      isDeleted: true,
      deletedAt: { $gte: thirtyDaysAgo, $ne: null },
    };

    // Filter by deleted by (who deleted it)
    if (deletedBy === 'me') {
      baseQuery.updatedBy = req.user?._id || req.user?.id;
    }

    // Filter by date deleted
    if (dateDeleted === 'last7days') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      baseQuery.deletedAt = { $gte: sevenDaysAgo };
    } else if (dateDeleted === 'older') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      baseQuery.deletedAt = { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo };
    }

    // Search by name
    if (search) {
      const sanitizedSearch = sanitizeInputWithXSS(search);
      baseQuery.name = { $regex: sanitizedSearch, $options: 'i' };
    }

    let folders = [];
    let documents = [];
    let totalFolders = 0;
    let totalDocuments = 0;

    // Fetch folders if needed
    if (type === 'all' || type === 'folder') {
      [folders, totalFolders] = await Promise.all([
        FolderModel.find(baseQuery)
          .populate('createdBy', 'name email avatar')
          .populate('updatedBy', 'name email avatar')
          .sort({ [sortBy]: sortOrder })
          .lean(),
        FolderModel.countDocuments(baseQuery),
      ]);
    }

    // Fetch documents if needed
    if (type === 'all' || type === 'document') {
      [documents, totalDocuments] = await Promise.all([
        DocumentModel.find(baseQuery)
          .populate('createdBy', 'name email avatar')
          .populate('updatedBy', 'name email avatar')
          .sort({ [sortBy]: sortOrder })
          .lean(),
        DocumentModel.countDocuments(baseQuery),
      ]);
    }

    // Combine and sort items
    let items = [];
    let totalItems = 0;

    if (type === 'all') {
      const foldersWithType = folders.map((f) => ({ 
        ...f, 
        itemType: 'folder',
        icon: 'folder' 
      }));
      const documentsWithType = documents.map((d) => ({ 
        ...d, 
        itemType: 'document',
        icon: 'file'
      }));

      items = [...foldersWithType, ...documentsWithType].sort((a, b) => {
        const aValue = a[sortBy];
        const bValue = b[sortBy];

        if (aValue < bValue) return sortOrder === 1 ? -1 : 1;
        if (aValue > bValue) return sortOrder === 1 ? 1 : -1;
        return 0;
      });

      totalItems = totalFolders + totalDocuments;
    } else if (type === 'folder') {
      items = folders.map((f) => ({ ...f, itemType: 'folder', icon: 'folder' }));
      totalItems = totalFolders;
    } else if (type === 'document') {
      items = documents.map((d) => ({ ...d, itemType: 'document', icon: 'file' }));
      totalItems = totalDocuments;
    }

    // Paginate
    items = items.slice(skip, skip + limit);

    // Add days until auto-delete and deletedBy info
    const itemsWithMetadata = items.map((item) => {
      const deletedDate = new Date(item.deletedAt);
      const autoDeleteDate = new Date(deletedDate);
      autoDeleteDate.setDate(autoDeleteDate.getDate() + 30);
      
      const now = new Date();
      const daysLeft = Math.ceil((autoDeleteDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      return {
        id: item._id,
        name: item.name,
        itemType: item.itemType,
        icon: item.icon,
        path: item.path,
        deletedBy: {
          id: item.updatedBy?._id,
          name: item.updatedBy?.name || 'Unknown',
          email: item.updatedBy?.email || '',
          avatar: item.updatedBy?.avatar || null,
        },
        deletedAt: item.deletedAt,
        daysUntilAutoDelete: daysLeft > 0 ? daysLeft : 0,
        autoDeleteDate,
        size: item.size || null,
        description: item.description || null,
      };
    });

    res.status(200).json({
      success: true,
      data: itemsWithMetadata,
      pagination: {
        page,
        limit,
        total: totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
      filters: {
        deletedBy,
        type,
        dateDeleted,
        search,
      },
      message: 'Trash items retrieved successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Restore a folder and all its descendants
 * Route: POST /api/trash/restore/folder/:id
 * Access: Private
 * Params:
 *   - id: ObjectId (required) - Folder ID
 * Response: { success: true, data: folder, message }
 */
export const restoreFolder = async (req, res, next) => {
  try {
    // Validate params
    const parsedData = restoreFromTrashSchema.safeParse(req.params);
    validateRequest(parsedData);

    const { id } = parsedData.data;
    const sanitizedId = sanitizeAndValidateId(id, 'Folder ID');

    const folder = await FolderModel.findById(sanitizedId);

    if (!folder) {
      throw createHttpError(404, 'Folder not found');
    }

    if (!folder.isDeleted) {
      throw createHttpError(400, 'Folder is not deleted');
    }

    // Check if parent exists and is not deleted
    const FolderModelRef = mongoose.model('Folder');
    const DepartmentModel = mongoose.model('Department');

    let parent = await FolderModelRef.findById(folder.parent_id);
    if (!parent) {
      parent = await DepartmentModel.findById(folder.parent_id);
    }

    if (!parent) {
      throw createHttpError(400, 'Parent folder/department not found');
    }

    if (parent.isDeleted) {
      throw createHttpError(400, 'Cannot restore. Parent is deleted. Please restore parent first.');
    }

    // Restore the folder
    await folder.restore();

    // Restore all descendant folders
    const escapedPath = folder.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await FolderModelRef.updateMany(
      { path: new RegExp(`^${escapedPath}/`), isDeleted: true },
      { isDeleted: false, deletedAt: null }
    );

    // Restore all descendant documents
    await DocumentModel.updateMany(
      { path: new RegExp(`^${escapedPath}/`), isDeleted: true },
      { isDeleted: false, deletedAt: null }
    );

    res.status(200).json({
      success: true,
      data: folder,
      message: 'Folder restored successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Restore a document
 * Route: POST /api/trash/restore/document/:id
 * Access: Private
 * Params:
 *   - id: ObjectId (required) - Document ID
 * Response: { success: true, data: document, message }
 */
export const restoreDocument = async (req, res, next) => {
  try {
    // Validate params
    const parsedData = restoreItemSchema.safeParse(req.params);
    validateRequest(parsedData);

    const { id } = parsedData.data;
    const sanitizedId = sanitizeAndValidateId(id, 'Document ID');

    const document = await DocumentModel.findById(sanitizedId);

    if (!document) {
      throw createHttpError(404, 'Document not found');
    }

    if (!document.isDeleted) {
      throw createHttpError(400, 'Document is not deleted');
    }

    // Check if parent exists and is not deleted
    const FolderModel = mongoose.model('Folder');
    const DepartmentModel = mongoose.model('Department');

    let parent = await FolderModel.findById(document.parent_id);
    if (!parent) {
      parent = await DepartmentModel.findById(document.parent_id);
    }

    if (!parent) {
      throw createHttpError(400, 'Parent folder/department not found');
    }

    if (parent.isDeleted) {
      throw createHttpError(400, 'Cannot restore. Parent is deleted. Please restore parent first.');
    }

    // Restore the document
    await document.restore();

    res.status(200).json({
      success: true,
      data: document,
      message: 'Document restored successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Bulk restore items (folders and documents)
 * Route: POST /api/trash/restore/bulk
 * Access: Private
 * Body:
 *   - itemIds: array of ObjectId (required) - Array of item IDs to restore
 *   - conflictResolution: 'rename' | 'replace' | 'skip' (optional, default: 'rename') - How to handle conflicts
 * Response: { success: true, data: { restored: [], failed: [] }, message }
 */
export const bulkRestore = async (req, res, next) => {
  try {
    // Validate body
    const parsedData = bulkRestoreSchema.safeParse(req.body);
    validateRequest(parsedData);

    const { itemIds, conflictResolution = 'rename' } = parsedData.data;

    const restored = [];
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

        if (!item.isDeleted) {
          failed.push({ id: itemId, reason: 'Item is not deleted' });
          continue;
        }

        // Check parent
        const FolderModelRef = mongoose.model('Folder');
        const DepartmentModel = mongoose.model('Department');

        let parent = await FolderModelRef.findById(item.parent_id);
        if (!parent) {
          parent = await DepartmentModel.findById(item.parent_id);
        }

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
      } catch (error) {
        failed.push({ id: itemId, reason: error.message });
      }
    }

    res.status(200).json({
      success: true,
      data: {
        restored,
        failed,
        total: itemIds.length,
        restoredCount: restored.length,
        failedCount: failed.length,
      },
      message: `Restored ${restored.length} of ${itemIds.length} items`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Permanently delete a folder
 * Route: DELETE /api/trash/folder/:id
 * Access: Private
 * Params:
 *   - id: ObjectId (required) - Folder ID
 * Query:
 *   - confirmation: boolean (optional) - Confirmation flag
 * Response: { success: true, message }
 */
export const permanentlyDeleteFolder = async (req, res, next) => {
  try {
    // Validate params
    const parsedData = permanentDeleteSchema.safeParse({
      ...req.params,
      confirmation: req.query.confirmation === 'true'
    });
    validateRequest(parsedData);

    const { id } = parsedData.data;
    const sanitizedId = sanitizeAndValidateId(id, 'Folder ID');

    const folder = await FolderModel.findById(sanitizedId);

    if (!folder) {
      throw createHttpError(404, 'Folder not found');
    }

    // Delete all descendant folders and documents
    const escapedPath = folder.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await FolderModel.deleteMany({
      path: new RegExp(`^${escapedPath}/`)
    });

    await DocumentModel.deleteMany({
      path: new RegExp(`^${escapedPath}/`)
    });

    // Delete the folder itself
    await FolderModel.findByIdAndDelete(sanitizedId);

    res.status(200).json({
      success: true,
      message: 'Folder permanently deleted',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Permanently delete a document
 * Route: DELETE /api/trash/document/:id
 * Access: Private
 * Params:
 *   - id: ObjectId (required) - Document ID
 * Query:
 *   - confirmation: boolean (optional) - Confirmation flag
 * Response: { success: true, message }
 */
export const permanentlyDeleteDocument = async (req, res, next) => {
  try {
    // Validate params
    const parsedData = permanentDeleteSchema.safeParse({
      ...req.params,
      confirmation: req.query.confirmation === 'true'
    });
    validateRequest(parsedData);

    const { id } = parsedData.data;
    const sanitizedId = sanitizeAndValidateId(id, 'Document ID');

    const document = await DocumentModel.findByIdAndDelete(sanitizedId);

    if (!document) {
      throw createHttpError(404, 'Document not found');
    }

    res.status(200).json({
      success: true,
      message: 'Document permanently deleted',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Empty trash - permanently delete all items
 * Route: DELETE /api/trash/empty
 * Access: Private
 * Body:
 *   - confirmation: boolean (required) - Must be true to proceed
 *   - olderThanDays: number (optional) - Only delete items older than X days
 * Response: { success: true, data: { deleted: { folders, documents } }, message }
 */
export const emptyTrash = async (req, res, next) => {
  try {
    // Validate body
    const parsedData = emptyTrashSchema.safeParse(req.body);
    validateRequest(parsedData);

    const { olderThanDays = 0 } = parsedData.data;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const query = {
      isDeleted: true,
      deletedAt: { $lt: cutoffDate, $ne: null },
    };

    // Delete old folders and documents
    const [deletedFolders, deletedDocuments] = await Promise.all([
      FolderModel.deleteMany(query),
      DocumentModel.deleteMany(query),
    ]);

    res.status(200).json({
      success: true,
      data: {
        deleted: {
          folders: deletedFolders.deletedCount,
          documents: deletedDocuments.deletedCount,
          total: deletedFolders.deletedCount + deletedDocuments.deletedCount,
        },
      },
      message: 'Trash emptied successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Empty trash cron job - automatically delete items older than 30 days
 * Route: Internal cron job only
 * Access: System
 * Response: { success: true, deleted: { folders, documents } }
 */
export const emptyTrashCronJob = async () => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const query = {
      isDeleted: true,
      deletedAt: { $lt: thirtyDaysAgo, $ne: null },
    };

    // Delete old folders and documents
    const [deletedFolders, deletedDocuments] = await Promise.all([
      FolderModel.deleteMany(query),
      DocumentModel.deleteMany(query),
    ]);

    console.log(`Trash cleanup: Deleted ${deletedFolders.deletedCount} folders and ${deletedDocuments.deletedCount} documents`);

    return {
      success: true,
      deleted: {
        folders: deletedFolders.deletedCount,
        documents: deletedDocuments.deletedCount,
      },
    };
  } catch (error) {
    console.error('Error emptying trash:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Get trash statistics
 * Route: GET /api/trash/stats
 * Access: Private
 * Response: { success: true, data: { totalFolders, totalDocuments, totalItems, totalSize }, message }
 */
export const getTrashStats = async (req, res, next) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [folderCount, documentCount, totalSize] = await Promise.all([
      FolderModel.countDocuments({
        isDeleted: true,
        deletedAt: { $gte: thirtyDaysAgo, $ne: null },
      }),
      DocumentModel.countDocuments({
        isDeleted: true,
        deletedAt: { $gte: thirtyDaysAgo, $ne: null },
      }),
      DocumentModel.aggregate([
        {
          $match: {
            isDeleted: true,
            deletedAt: { $gte: thirtyDaysAgo, $ne: null },
          },
        },
        {
          $group: {
            _id: null,
            totalSize: { $sum: '$size' },
          },
        },
      ]),
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalFolders: folderCount,
        totalDocuments: documentCount,
        totalItems: folderCount + documentCount,
        totalSize: totalSize[0]?.totalSize || 0,
      },
      message: 'Trash statistics retrieved successfully',
    });
  } catch (error) {
    next(error);
  }
};