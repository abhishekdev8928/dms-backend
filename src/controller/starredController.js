import DocumentModel from "../models/documentModel.js";
import FolderModel from "../models/folderModel.js";
import { sanitizeAndValidateId, sanitizeInput, validateRequest } from "../utils/helper.js";
import z from "zod";

const toggleStarredSchema = z.object({
  body: z.object({
    id: z.string().min(1, "ID is required"),
    type: z.string().min(1, "Type is required"),
  }),
});

const bulkStarredSchema = z.object({
  body: z.object({
    fileIds: z.array(z.string()).optional().default([]),
    folderIds: z.array(z.string()).optional().default([]),
    starred: z.boolean(),
  }),
});

/**
 * Set starred status to true for a single item
 * @route POST /api/v1/starred/add
 * @body { id: string, type: "folder" | "file" }
 */
export const addStarred = async (req, res, next) => {
  try {
    const parsed = toggleStarredSchema.safeParse({ body: req.body });
    console.log(parsed);
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
 * Bulk update starred status for multiple items
 * @route POST /api/v1/starred/bulk
 * @body { fileIds: string[], folderIds: string[], starred: boolean }
 */
export const bulkUpdateStarred = async (req, res, next) => {
  try {
    // Validate request
    const parsed = bulkStarredSchema.safeParse({ body: req.body });
    validateRequest(parsed);

    const { fileIds, folderIds, starred } = parsed.data.body;

    // Validate that at least one array has items
    if (fileIds.length === 0 && folderIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one file or folder ID must be provided"
      });
    }

    // Sanitize IDs
    const sanitizedFileIds = fileIds.map(id => sanitizeAndValidateId(id, "File ID"));
    const sanitizedFolderIds = folderIds.map(id => sanitizeAndValidateId(id, "Folder ID"));

    const userId = req.user.id;
    const results = {
      files: { updated: 0, notFound: [], alreadySet: [], deleted: [] },
      folders: { updated: 0, notFound: [], alreadySet: [], deleted: [] }
    };

    // Update files
    if (sanitizedFileIds.length > 0) {
      const files = await DocumentModel.find({
        _id: { $in: sanitizedFileIds },
        createdBy: userId
      });

      for (const fileId of sanitizedFileIds) {
        const file = files.find(f => f._id.toString() === fileId);
        
        if (!file) {
          results.files.notFound.push(fileId);
          continue;
        }

        if (file.isDeleted) {
          results.files.deleted.push(fileId);
          continue;
        }

        if (file.starred === starred) {
          results.files.alreadySet.push(fileId);
          continue;
        }

        file.starred = starred;
        file.updatedBy = userId;
        await file.save();
        results.files.updated++;
      }
    }

    // Update folders
    if (sanitizedFolderIds.length > 0) {
      const folders = await FolderModel.find({
        _id: { $in: sanitizedFolderIds },
        createdBy: userId
      });

      for (const folderId of sanitizedFolderIds) {
        const folder = folders.find(f => f._id.toString() === folderId);
        
        if (!folder) {
          results.folders.notFound.push(folderId);
          continue;
        }

        if (folder.isDeleted) {
          results.folders.deleted.push(folderId);
          continue;
        }

        if (folder.starred === starred) {
          results.folders.alreadySet.push(folderId);
          continue;
        }

        folder.starred = starred;
        folder.updatedBy = userId;
        await folder.save();
        results.folders.updated++;
      }
    }

    const totalUpdated = results.files.updated + results.folders.updated;
    const totalRequested = fileIds.length + folderIds.length;

    res.status(200).json({
      success: true,
      message: `Bulk ${starred ? 'starred' : 'unstarred'} operation completed`,
      data: {
        totalRequested,
        totalUpdated,
        starred,
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

    const populateFields = "username email";

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
        username: folder.createdBy?.username,
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
        username: file.createdBy?.username,
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