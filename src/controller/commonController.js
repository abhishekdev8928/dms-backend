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

        // Log activity
        await ActivityLogModel.logActivity({
          action: "DOCUMENT_DELETED",
          entityType: "Document",
          entityId: document._id,
          entityName: document.name,
          performedBy: userId,
          performedByName: req.user.name,
          performedByEmail: req.user.email,
          description: `Deleted document "${document.displayName}"`,
          ipAddress: req.ip,
          userAgent: req.get("user-agent"),
        });

        results.files.deleted.push({
          id: fileId,
          name: document.displayName,
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

        await folder.softDelete();

        // Log activity
        await ActivityLogModel.logActivity({
          action: "FOLDER_DELETED",
          entityType: "Folder",
          entityId: folder._id,
          entityName: folder.name,
          performedBy: userId,
          performedByName: req.user.name,
          performedByEmail: req.user.email,
          description: `Deleted folder "${folder.name}"`,
          ipAddress: req.ip,
          userAgent: req.get("user-agent"),
        });

        results.folders.deleted.push({
          id: folderId,
          name: folder.name,
        });
      } catch (error) {
        results.folders.errors.push({
          id: folderId,
          error: error.message,
        });
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

// Example route registration
// router.delete('/items', authenticate, bulkSoftDelete);
