import { z } from "zod";
import FolderModel from "../models/folderModel.js";
import ActivityLogModel from "../models/activityModel.js";
import DocumentModel from "../models/documentModel.js";
import { sanitizeAndValidateId, validateRequest } from "../utils/helper.js";

const bulkDeleteSchema = z.object({
  body: z.object({
    fileIds: z.array(z.string()).optional().default([]),
    folderIds: z.array(z.string()).optional().default([])
  }).refine(
    (data) => data.fileIds.length > 0 || data.folderIds.length > 0,
    { message: 'At least one fileId or folderId must be provided' }
  )
});

/**
 * Unified soft delete endpoint for files and folders
 * Supports both single and bulk deletion
 * Creates a SINGLE activity log entry for bulk operations
 *
 * @route DELETE /api/v1/items
 * @body { fileIds?: string[], folderIds?: string[] }
 */
export const bulkSoftDelete = async (req, res, next) => {
  try {
    // Validate request
    const parsed = bulkDeleteSchema.safeParse({ body: req.body });
    validateRequest(parsed);

    const { fileIds = [], folderIds = [] } = parsed.data.body;
    const userId = req.user.id;

    // Sanitize and validate all IDs
    const sanitizedFileIds = fileIds.map((id) =>
      sanitizeAndValidateId(id, "File ID")
    );
    const sanitizedFolderIds = folderIds.map((id) =>
      sanitizeAndValidateId(id, "Folder ID")
    );

    const results = {
      files: { deleted: [], notFound: [], alreadyDeleted: [], errors: [] },
      folders: { deleted: [], notFound: [], alreadyDeleted: [], errors: [] },
    };

    // Prepare user info for activity logging
    const userInfo = {
      name: req.user.username,
      email: req.user.email,
      avatar: req.user.avatar || null
    };

    // Collect all items being deleted (for bulk logging)
    const itemsBeingDeleted = [];

    // Process file deletions
    for (const fileId of sanitizedFileIds) {
      try {
        const document = await DocumentModel.findById(fileId);

        if (!document) {
          results.files.notFound.push(fileId);
          continue;
        }

        if (document.isDeleted) {
          results.files.alreadyDeleted.push(fileId);
          continue;
        }

        await document.softDelete();

        // Add to items being deleted (for bulk log)
        itemsBeingDeleted.push({
          _id: document._id,
          id: document._id,
          name: document.displayName || document.name,
          extension: document.extension || '',
          type: document.mimeType || document.type || '',
          itemType: 'file',
          size: document.size || 0,
          parent_id: document.parent_id || document.parentId
        });

        results.files.deleted.push({
          id: fileId,
          name: document.displayName || document.name,
        });
      } catch (error) {
        results.files.errors.push({
          id: fileId,
          error: error.message,
        });
      }
    }

    // Process folder deletions
    for (const folderId of sanitizedFolderIds) {
      try {
        const folder = await FolderModel.findById(folderId);

        if (!folder) {
          results.folders.notFound.push(folderId);
          continue;
        }

        if (folder.isDeleted) {
          results.folders.alreadyDeleted.push(folderId);
          continue;
        }

        // Get count of items inside the folder before deletion
        const itemsInside = await FolderModel.countDocuments({
          parent_id: folderId,
          isDeleted: false
        });
        const filesInside = await DocumentModel.countDocuments({
          parent_id: folderId,
          isDeleted: false
        });
        const totalItemsInside = itemsInside + filesInside;

        await folder.softDelete();

        // Add to items being deleted (for bulk log)
        itemsBeingDeleted.push({
          _id: folder._id,
          id: folder._id,
          name: folder.name,
          parent_id: folder.parent_id || folder.parentId,
          itemType: 'folder',
          nestedItemsCount: totalItemsInside
        });

        results.folders.deleted.push({
          id: folderId,
          name: folder.name,
          itemsDeletedInside: totalItemsInside
        });
      } catch (error) {
        results.folders.errors.push({
          id: folderId,
          error: error.message,
        });
      }
    }

    // ✅ FIXED: Create a SINGLE bulk activity log instead of multiple logs
    if (itemsBeingDeleted.length > 0) {
      try {
        if (itemsBeingDeleted.length === 1) {
          // Single item deletion - use specific log method
          const item = itemsBeingDeleted[0];
          if (item.itemType === 'file') {
            await ActivityLogModel.logFileDelete(userId, item, userInfo);
          } else {
            await ActivityLogModel.logFolderDelete(userId, item, userInfo, item.nestedItemsCount || 0);
          }
        } else {
          // Multiple items deletion - create ONE bulk log entry
          // Similar to logBulkRestore but for deletion
          await ActivityLogModel.logBulkDelete(userId, itemsBeingDeleted, userInfo);
        }
      } catch (activityError) {
        console.error('Error logging bulk deletion:', activityError);
        // Don't fail the deletion if activity logging fails
      }
    }

    // Calculate totals
    const totalDeleted =
      results.files.deleted.length + results.folders.deleted.length;
    const totalRequested = sanitizedFileIds.length + sanitizedFolderIds.length;
    const hasErrors =
      results.files.errors.length > 0 || results.folders.errors.length > 0;
    const hasNotFound =
      results.files.notFound.length > 0 || results.folders.notFound.length > 0;

    // Determine response status and message
    let statusCode = 200;
    let message = `Successfully deleted ${totalDeleted} item(s)`;

    if (totalDeleted === 0) {
      statusCode = 400;
      message = "No items were deleted";
    } else if (totalDeleted < totalRequested) {
      if (hasErrors || hasNotFound) {
        statusCode = 207; // Multi-Status
        message = `Partially completed: ${totalDeleted} of ${totalRequested} item(s) deleted`;
      }
    }

    res.status(statusCode).json({
      success: totalDeleted > 0,
      message,
      data: {
        summary: {
          requested: totalRequested,
          deleted: totalDeleted,
          failed: totalRequested - totalDeleted,
        },
        results,
      },
    });
  } catch (error) {
    next(error);
  }
};