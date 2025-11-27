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
const toggleStarredSchema = z.object({
  body: z.object({
    id: z.string().min(1, "ID is required"),
    type: z.enum(["folder", "file"], {
      errorMap: () => ({ message: "Type must be either 'folder' or 'file'" })
    })
  })
});

const bulkToggleStarredSchema = z.object({
  body: z.object({
    items: z.array(
      z.object({
        id: z.string().min(1, "ID is required"),
        type: z.enum(["folder", "file"])
      })
    ).min(1, "At least one item is required")
  })
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





/**
 * Toggle starred status for a single item (folder or file)
 * @route POST /api/v1/starred/toggle
 * @body { id: string, type: "folder" | "file" }
 */
export const toggleStarred = async (req, res, next) => {


  try {
    // Validate request
    const parsed = toggleStarredSchema.safeParse({ body: req.body });
    validateRequest(parsed);

    const { id, type } = parsed.data.body;
    
    // Sanitize inputs
    const sanitizedId = sanitizeAndValidateId(id, "Item ID");
    const sanitizedType = sanitizeInput(type);

    let item;
    let Model;

    // Get the appropriate model
    if (sanitizedType === "folder") {
      Model = FolderModel;
    } else {
      Model = DocumentModel;
    }

    // Find the item
    item = await Model.findById(sanitizedId);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: `${sanitizedType === "folder" ? "Folder" : "File"} not found`
      });
    }

    // Check if item is deleted
    if (item.isDeleted) {
      return res.status(400).json({
        success: false,
        message: "Cannot star deleted items"
      });
    }

    // Toggle starred status
    item.starred = !item.starred;
    item.updatedBy = req.user.id;
    await item.save();

    res.status(200).json({
      success: true,
      message: `${sanitizedType === "folder" ? "Folder" : "File"} ${item.starred ? "starred" : "unstarred"} successfully`,
      data: {
        id: item._id,
        name: item.name || item.displayName,
        type: sanitizedType,
        starred: item.starred
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Set starred status to true for a single item
 * @route POST /api/v1/starred/add
 * @body { id: string, type: "folder" | "file" }
 */
export const addStarred = async (req, res, next) => {
  try {
    // Validate request
    const parsed = toggleStarredSchema.safeParse({ body: req.body });
    validateRequest(parsed);

    const { id, type } = parsed.data.body;
    
    // Sanitize inputs
    const sanitizedId = sanitizeAndValidateId(id, "Item ID");
    const sanitizedType = sanitizeInput(type);

    let item;
    let Model;

    // Get the appropriate model
    if (sanitizedType === "folder") {
      Model = FolderModel;
    } else {
      Model = DocumentModel;
    }

    // Find the item
    item = await Model.findById(sanitizedId);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: `${sanitizedType === "folder" ? "Folder" : "File"} not found`
      });
    }

    // Check if item is deleted
    if (item.isDeleted) {
      return res.status(400).json({
        success: false,
        message: "Cannot star deleted items"
      });
    }

    // Check if already starred
    if (item.starred) {
      return res.status(200).json({
        success: true,
        message: `${sanitizedType === "folder" ? "Folder" : "File"} is already starred`,
        data: {
          id: item._id,
          name: item.name || item.displayName,
          type: sanitizedType,
          starred: item.starred
        }
      });
    }

    // Set starred to true
    item.starred = true;
    item.updatedBy = req.user.id;
    await item.save();

    res.status(200).json({
      success: true,
      message: `${sanitizedType === "folder" ? "Folder" : "File"} starred successfully`,
      data: {
        id: item._id,
        name: item.name || item.displayName,
        type: sanitizedType,
        starred: item.starred
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Set starred status to false for a single item
 * @route POST /api/v1/starred/remove
 * @body { id: string, type: "folder" | "file" }
 */
export const removeStarred = async (req, res, next) => {
  try {
    // Validate request
    const parsed = toggleStarredSchema.safeParse({ body: req.body });
    validateRequest(parsed);

    const { id, type } = parsed.data.body;
    
    // Sanitize inputs
    const sanitizedId = sanitizeAndValidateId(id, "Item ID");
    const sanitizedType = sanitizeInput(type);

    let item;
    let Model;

    // Get the appropriate model
    if (sanitizedType === "folder") {
      Model = FolderModel;
    } else {
      Model = DocumentModel;
    }

    // Find the item
    item = await Model.findById(sanitizedId);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: `${sanitizedType === "folder" ? "Folder" : "File"} not found`
      });
    }

    // Set starred to false
    item.starred = false;
    item.updatedBy = req.user.id;
    await item.save();

    res.status(200).json({
      success: true,
      message: `${sanitizedType === "folder" ? "Folder" : "File"} unstarred successfully`,
      data: {
        id: item._id,
        name: item.name || item.displayName,
        type: sanitizedType,
        starred: item.starred
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Bulk toggle starred status for multiple items
 * @route POST /api/v1/starred/bulk-toggle
 * @body { items: [{ id: string, type: "folder" | "file" }] }
 */
export const bulkToggleStarred = async (req, res, next) => {
  try {
    // Validate request
    const parsed = bulkToggleStarredSchema.safeParse({ body: req.body });
    validateRequest(parsed);

    const { items } = parsed.data.body;
    const userId = req.user.id;

    const results = {
      success: [],
      failed: [],
      notFound: []
    };

    // Process each item
    for (const item of items) {
      try {
        const sanitizedId = sanitizeAndValidateId(item.id, "Item ID");
        const sanitizedType = sanitizeInput(item.type);

        let Model = sanitizedType === "folder" ? FolderModel : DocumentModel;
        let foundItem = await Model.findById(sanitizedId);

        if (!foundItem) {
          results.notFound.push({
            id: sanitizedId,
            type: sanitizedType,
            error: "Item not found"
          });
          continue;
        }

        if (foundItem.isDeleted) {
          results.failed.push({
            id: sanitizedId,
            type: sanitizedType,
            error: "Cannot star deleted items"
          });
          continue;
        }

        // Toggle starred
        foundItem.starred = !foundItem.starred;
        foundItem.updatedBy = userId;
        await foundItem.save();

        results.success.push({
          id: foundItem._id,
          name: foundItem.name || foundItem.displayName,
          type: sanitizedType,
          starred: foundItem.starred
        });
      } catch (error) {
        results.failed.push({
          id: item.id,
          type: item.type,
          error: error.message
        });
      }
    }

    const totalProcessed = results.success.length + results.failed.length + results.notFound.length;
    const statusCode = results.success.length > 0 ? (results.failed.length > 0 || results.notFound.length > 0 ? 207 : 200) : 400;

    res.status(statusCode).json({
      success: results.success.length > 0,
      message: `Processed ${results.success.length} of ${totalProcessed} item(s)`,
      data: {
        summary: {
          total: totalProcessed,
          success: results.success.length,
          failed: results.failed.length,
          notFound: results.notFound.length
        },
        results
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all starred items for current user
 * @route GET /api/v1/starred
 */
export const getStarredItems = async (req, res, next) => {
  try {
    console.log("calling");
    const userId = req.user.id;

    const populateFields = "username email"; // <-- FIXED

    // Get starred folders and files
    const [starredFolders, starredFiles] = await Promise.all([
      FolderModel.find({
        starred: true,
        isDeleted: false,
        createdBy: userId,
      })
        .select(
          "name type path color starred createdAt updatedAt parent_id createdBy"
        )
        .populate("createdBy", populateFields),

      DocumentModel.find({
        starred: true,
        isDeleted: false,
        createdBy: userId,
      })
        .select(
          "name displayName type mimeType extension size starred createdAt updatedAt parent_id createdBy"
        )
        .populate("createdBy", populateFields),
    ]);

    // Format response
    const folders = starredFolders.map((folder) => ({
      id: folder._id,
      name: folder.name,
      type: "folder",
      itemType: "folder",
      color: folder.color,
      path: folder.path,
      starred: folder.starred,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
      parent_id: folder.parent_id,
      createdBy: {
        id: folder.createdBy?._id,
        username: folder.createdBy?.username, // <-- FIXED
        email: folder.createdBy?.email,
      },
    }));

    const files = starredFiles.map((file) => ({
      id: file._id,
      name: file.displayName || file.name,
      type: "file",
      itemType: "file",
      mimeType: file.mimeType || file.type,
      extension: file.extension,
      size: file.size,
      starred: file.starred,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      parent_id: file.parent_id,
      createdBy: {
        id: file.createdBy?._id,
        username: file.createdBy?.username, // <-- FIXED
        email: file.createdBy?.email,
      },
    }));

    // Combine and sort by updatedAt
    const allStarred = [...folders, ...files].sort(
      (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
    );

    res.status(200).json({
      success: true,
      message: "Starred items retrieved successfully",
      data: {
        total: allStarred.length,
        folders: folders.length,
        files: files.length,
        items: allStarred,
      },
    });
  } catch (error) {
    next(error);
  }
};
