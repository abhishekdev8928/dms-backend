// controller/starredController.js

import createHttpError from "http-errors";
import StarredModel from "../models/starredModel.js";
import FolderModel from "../models/folderModel.js";
import DocumentModel from "../models/documentModel.js";
import { hasPermission, attachActionsBulk } from "../utils/helper/aclHelpers.js";
import { sanitizeAndValidateId, validateRequest } from "../utils/helper.js";
import z from "zod";

// Validation schemas
const bulkStarredSchema = z.object({
  body: z.object({
    fileIds: z.array(z.string()).optional().default([]),
    folderIds: z.array(z.string()).optional().default([]),
    starred: z.boolean(),
  }),
});

/**
 * ============================================
 * ADD ITEM TO STARRED
 * ============================================
 * @route   POST /api/starred/add
 * @access  Private - Middleware validates 'view' permission
 * @body    { id: string, type: "folder" | "file" }
 * @note    req.resource and req.resourceType attached by middleware
 */
export const addStarred = async (req, res, next) => {
  try {
    const user = req.user;
    const resource = req.resource; // Attached by middleware
    const resourceType = req.resourceType; // Attached by middleware
    const { type } = req.body;

    // Add to starred using StarredModel
    const starred = await StarredModel.addStarred(
      user._id,
      resource._id,
      resourceType,
      resource.departmentId,
      resource.parentId
    );

    res.status(200).json({
      success: true,
      message: `${type} added to starred successfully`,
      data: {
        id: resource._id,
        name: resource.name || resource.displayName,
        type: type.toLowerCase(),
        starred: true,
        starredAt: starred.starredAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ============================================
 * REMOVE ITEM FROM STARRED
 * ============================================
 * @route   POST /api/starred/remove
 * @access  Private - Middleware validates 'view' permission
 * @body    { id: string, type: "folder" | "file" }
 * @note    req.resource and req.resourceType attached by middleware
 */
export const removeStarred = async (req, res, next) => {
  try {
    const user = req.user;
    const resource = req.resource; // Attached by middleware
    const resourceType = req.resourceType; // Attached by middleware
    const { type } = req.body;

    // Remove from starred using StarredModel
    await StarredModel.removeStarred(user._id, resource._id, resourceType);

    res.status(200).json({
      success: true,
      message: `${type} removed from starred successfully`,
      data: {
        id: resource._id,
        name: resource.name || resource.displayName,
        type: type.toLowerCase(),
        starred: false,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ============================================
 * BULK UPDATE STARRED STATUS
 * ============================================
 * @route   POST /api/starred/bulk
 * @access  Private - Controller validates 'view' permission on all items
 * @body    { fileIds: string[], folderIds: string[], starred: boolean }
 */
export const bulkUpdateStarred = async (req, res, next) => {
  try {
    const user = req.user;
    const parsed = bulkStarredSchema.safeParse({ body: req.body });
    validateRequest(parsed);

    const { fileIds, folderIds, starred } = parsed.data.body;

    // Validate that at least one array has items
    if (fileIds.length === 0 && folderIds.length === 0) {
      throw createHttpError(400, "At least one file or folder ID must be provided");
    }

    // Sanitize IDs
    const sanitizedFileIds = fileIds.map(id => sanitizeAndValidateId(id, "File ID"));
    const sanitizedFolderIds = folderIds.map(id => sanitizeAndValidateId(id, "Folder ID"));

    const userGroupIds = user.groups || [];
    const results = {
      files: { updated: 0, notFound: [], noPermission: [], deleted: [] },
      folders: { updated: 0, notFound: [], noPermission: [], deleted: [] },
    };

    const itemsToUpdate = []; // Items that passed validation

    // Process files
    if (sanitizedFileIds.length > 0) {
      const files = await DocumentModel.find({
        _id: { $in: sanitizedFileIds },
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

        // Check if user has 'view' permission
        const canView = await hasPermission(
          user,
          file,
          "DOCUMENT",
          "view",
          userGroupIds
        );

        if (!canView) {
          results.files.noPermission.push(fileId);
          continue;
        }

        // Add to items to update
        itemsToUpdate.push({
          itemId: file._id,
          itemType: "DOCUMENT",
          departmentId: file.departmentId,
          parentId: file.parentId,
        });

        results.files.updated++;
      }
    }

    // Process folders
    if (sanitizedFolderIds.length > 0) {
      const folders = await FolderModel.find({
        _id: { $in: sanitizedFolderIds },
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

        // Check if user has 'view' permission
        const canView = await hasPermission(
          user,
          folder,
          "FOLDER",
          "view",
          userGroupIds
        );

        if (!canView) {
          results.folders.noPermission.push(folderId);
          continue;
        }

        // Add to items to update
        itemsToUpdate.push({
          itemId: folder._id,
          itemType: "FOLDER",
          departmentId: folder.departmentId,
          parentId: folder.parentId,
        });

        results.folders.updated++;
      }
    }

    // Perform bulk update in StarredModel
    if (itemsToUpdate.length > 0) {
      if (starred) {
        // Add all validated items to starred
        await StarredModel.bulkAddStarred(user._id, itemsToUpdate);
      } else {
        // Remove all validated items from starred
        await StarredModel.bulkRemoveStarred(user._id, itemsToUpdate);
      }
    }

    const totalUpdated = results.files.updated + results.folders.updated;
    const totalRequested = fileIds.length + folderIds.length;

    res.status(200).json({
      success: true,
      message: `Bulk ${starred ? "starred" : "unstarred"} operation completed`,
      data: {
        totalRequested,
        totalUpdated,
        starred,
        results,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ============================================
 * GET ALL STARRED ITEMS
 * ============================================
 * @route   GET /api/starred
 * @access  Private
 * @note    Returns only items user still has access to
 * @note    Uses same format as getChildFolders for consistent UI
 */
export const getStarredItems = async (req, res, next) => {
  try {
    const user = req.user;
    const userGroupIds = user.groups || [];

    // Get all starred items for user
    const starredItems = await StarredModel.getStarredForUser(user._id);

    // Separate folder and document IDs
    const folderIds = starredItems
      .filter(item => item.itemType === "FOLDER")
      .map(item => item.itemId);

    const documentIds = starredItems
      .filter(item => item.itemType === "DOCUMENT")
      .map(item => item.itemId);

    // Fetch actual folders and documents with lean data
    const [folders, documents] = await Promise.all([
      FolderModel.find({
        _id: { $in: folderIds },
        isDeleted: false,
      })
        .populate("createdBy", "username email")
        .populate("updatedBy", "username email")
        .sort({ createdAt: -1 })
        .lean(), 

      DocumentModel.find({
        _id: { $in: documentIds },
        isDeleted: false,
      })
        .populate("createdBy", "username email")
        .populate("updatedBy", "username email")
        .sort({ createdAt: -1 })
        .lean(), // ✅ Lean for performance
    ]);

    // Combine all items
    let allItems = [...folders, ...documents];

    // Filter: Keep only items user has view access to
    const accessibleItems = [];
    
    for (const item of allItems) {
      const resourceType = item.type === "folder" ? "FOLDER" : "DOCUMENT";
      
      const canView = await hasPermission(
        user,
        item,
        resourceType,
        "view",
        userGroupIds
      );

      if (canView) {
        // Find corresponding starred record for starredAt timestamp
        const starredItem = starredItems.find(
          s => s.itemId.toString() === item._id.toString()
        );
        
        // Attach starredAt to item
        item.starredAt = starredItem?.starredAt;
        accessibleItems.push(item);
      }
    }

    // 📁 Sort by starredAt (most recently starred first)
    accessibleItems.sort((a, b) => {
      return new Date(b.starredAt) - new Date(a.starredAt);
    });

    // 🔐 Attach actions using the same helper as getChildFolders
    const itemsWithActions = await attachActionsBulk(accessibleItems, user);

    res.status(200).json({
      success: true,
      count: itemsWithActions.length,
      children: itemsWithActions, // ✅ Same key as getChildFolders
    });
  } catch (error) {
    next(error);
  }
};