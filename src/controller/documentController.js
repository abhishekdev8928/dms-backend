import DocumentModel from "../models/documentModel.js";
import DocumentVersionModel from "../models/documentVersionModel.js";
import FolderModel from "../models/folderModel.js";
import AuditLogModel from "../models/auditLogsModel.js";
import NotificationModel from "../models/notificationModel.js";
import DepartmentModel from "../models/departmentModel.js";

import { SUPPORTED_FORMATS } from "../utils/constants.js";
import UserModel from "../models/userModel.js";

/**
 * Notify all users in a department
 */
const notifyDepartmentUsers = async (
  department,
  type,
  title,
  message,
  documentId,
  excludeUserId
) => {
  try {
    // Get all users in the department
    const departmentUsers = await UserModel.find({
      department: department._id,
      _id: { $ne: excludeUserId }, // Exclude the uploader
      isActive: true,
    }).select("_id");

    if (departmentUsers.length === 0) return;

    // Create notifications for all users
    const notifications = departmentUsers.map((user) => ({
      user: user._id,
      type,
      title,
      message,
      relatedDocument: documentId,
      relatedDepartment: department._id,
      isRead: false,
      createdAt: new Date(),
    }));

    await NotificationModel.insertMany(notifications);

    // Optional: Send real-time notifications via Socket.io
    // if (global.io) {
    //   departmentUsers.forEach(user => {
    //     global.io.to(`user_${user._id}`).emit('new_notification', {
    //       type, title, message, documentId
    //     });
    //   });
    // }
  } catch (error) {
    console.error("Error notifying department users:", error);
    // Don't throw - notification failure shouldn't break upload
  }
};

// Helper function to create audit log
const createAuditLog = async (
  userId,
  action,
  resourceType,
  resourceId,
  resourceName,
  department,
  req,
  details = {}
) => {
  try {
    await AuditLogModel.create({
      user: userId,
      action,
      resourceType,
      resourceId,
      resourceName,
      department,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get("user-agent"),
      details,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Audit log error:", error);
  }
};

// Helper function to create notification
const createNotification = async (
  userId,
  type,
  title,
  message,
  relatedDocument = null,
  relatedFolder = null
) => {
  try {
    await NotificationModel.create({
      user: userId,
      type,
      title,
      message,
      relatedDocument,
      relatedFolder,
      isRead: false,
    });
  } catch (error) {
    console.error("Notification error:", error);
  }
};

// Helper function to notify users with folder access
const notifyFolderUsers = async (
  folder,
  type,
  title,
  message,
  relatedDocument = null,
  excludeUserId = null
) => {
  try {
    // Get users who have access to this folder
    const folderWithPermissions = await FolderModel.findById(
      folder._id
    ).populate("permissions");

    const userIds = [];

    // Add folder creator
    if (
      folder.createdBy &&
      folder.createdBy.toString() !== excludeUserId?.toString()
    ) {
      userIds.push(folder.createdBy);
    }

    // Add users from permissions
    if (folderWithPermissions.permissions) {
      folderWithPermissions.permissions.forEach((permission) => {
        if (
          permission.user &&
          permission.user.toString() !== excludeUserId?.toString()
        ) {
          userIds.push(permission.user);
        }
      });
    }

    // Create notifications for all users
    const uniqueUserIds = [...new Set(userIds.map((id) => id.toString()))];
    for (const userId of uniqueUserIds) {
      await createNotification(
        userId,
        type,
        title,
        message,
        relatedDocument,
        folder._id
      );
    }
  } catch (error) {
    console.error("Notify folder users error:", error);
  }
};


export const createDocumentMetadata = async (req, res) => {
  try {
    const {
      title,
      originalFileName,
      fileUrl,
      fileKey,
      fileType,
      fileSize,
      folderId,
      departmentId,
      tags = [],
      metadata = {},
    } = req.body;

    const userId = req.user?.id;
    const userName = req.user?.name;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    // ✅ Basic validation
    if (!title || !originalFileName || !fileKey || !fileType || !fileSize) {
      return res.status(400).json({
        success: false,
        message: "All file metadata fields are required",
      });
    }

    if (!folderId && !departmentId) {
      return res.status(400).json({
        success: false,
        message: "Either folderId or departmentId must be provided",
      });
    }

    // ✅ Extract correct file extension
    let ext = originalFileName.split(".").pop().toLowerCase();

    // ✅ Normalize MIME → extension
    let normalizedType = fileType.toLowerCase()
      .replace("application/", "")
      .replace("image/", "")
      .replace("x-", "");

    // ✅ If normalized MIME doesn't match extension, trust extension
    if (normalizedType !== ext) {
      normalizedType = ext;
    }

    const allowedTypes = ["pdf", "docx", "xlsx", "jpg", "png", "zip"];
    if (!allowedTypes.includes(normalizedType)) {
      return res.status(400).json({
        success: false,
        message: `File type not supported: ${fileType}. Allowed: ${allowedTypes.join(", ")}`,
      });
    }

    // ✅ Folder & Department lookup
    const folder = folderId
      ? await FolderModel.findById(folderId).populate("department")
      : null;

    const department = folder
      ? folder.department
      : await DepartmentModel.findById(departmentId);

    if (folderId && !folder) {
      return res.status(404).json({ success: false, message: "Folder not found" });
    }
    if (departmentId && !department) {
      return res.status(404).json({ success: false, message: "Department not found" });
    }

    // ✅ Create Document
    const document = await DocumentModel.create({
      title,
      originalFileName,
      fileKey,
      fileType: normalizedType, // ✅ Save correct type
      extension: normalizedType,
      fileSize,
      folder: folder?._id || null,
      department: department?._id || null,
      tags,
      uploadedBy: userId,
      version: 1,
      metadata,
      isActive: true,
    });

    // ✅ Create Version Entry
    await DocumentVersionModel.create({
      document: document._id,
      version: 1,
      fileUrl,
      fileKey,
      fileSize,
      uploadedBy: userId,
      changes: "Initial upload",
    });

    // ✅ Audit Log
    await createAuditLog(
      userId,
      "upload",
      "document",
      document._id,
      title,
      department?._id,
      req,
      {
        extension: normalizedType,
        fileType,
        fileSize,
        folder: folder ? folder.name : "Department Root",
        originalFileName,
      }
    );

    // ✅ Notification system
    if (folder) {
      await notifyFolderUsers(
        folder,
        "document_upload",
        "New Document Uploaded",
        `${userName} uploaded "${title}" to ${folder.name}`,
        document._id,
        userId
      );
    } else {
      await notifyDepartmentUsers(
        department,
        "document_upload",
        "New Department Document",
        `${userName} uploaded "${title}" to ${department.name}`,
        document._id,
        userId
      );
    }

    const populatedDocument = await DocumentModel.findById(document._id)
      .populate("folder", "name path")
      .populate("department", "name code")
      .populate("uploadedBy", "name email");

    return res.status(201).json({
      success: true,
      message: "Document metadata saved successfully",
      data: populatedDocument,
    });

  } catch (error) {
    console.error("Create document metadata error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to save document metadata",
      error: error.message,
    });
  }
};


// Get Documents with Filters and Pagination
export const getDocuments = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      folder,
      department,
      fileType,
      tags,
      uploadedBy,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    // Build query
    const query = { isActive: true };

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { originalFileName: { $regex: search, $options: "i" } },
        { tags: { $regex: search, $options: "i" } },
      ];
    }

    if (folder) query.folder = folder;
    if (department) query.department = department;
    if (fileType) query.fileType = fileType;
    if (uploadedBy) query.uploadedBy = uploadedBy;

    if (tags) {
      const tagArray = tags.split(",").map((tag) => tag.trim());
      query.tags = { $in: tagArray };
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

    // Execute query
    const [documents, total] = await Promise.all([
      DocumentModel.find(query)
        .populate("folder", "name path")
        .populate("department", "name code")
        .populate("uploadedBy", "name email")
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      DocumentModel.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: documents,
      count: total,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalDocuments: total,
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Get documents error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch documents",
      error: error.message,
    });
  }
};

// Get Document by ID
export const getDocumentById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const document = await DocumentModel.findById(id)
      .populate("folder", "name path")
      .populate("department", "name code")
      .populate("uploadedBy", "name email")
      .populate("permissions.user", "name email");

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Get version history
    const versions = await DocumentVersionModel.find({ document: id })
      .populate("uploadedBy", "name email")
      .sort({ version: -1 })
      .lean();

    // Create audit log for view action
    await createAuditLog(
      userId,
      "view",
      "document",
      document._id,
      document.title,
      document.department,
      req
    );

    res.status(200).json({
      success: true,
      data: {
        ...document.toObject(),
        versionHistory: versions,
      },
    });
  } catch (error) {
    console.error("Get document error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch document",
      error: error.message,
    });
  }
};

// Download Document (Log only)
export const downloadDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const document = await DocumentModel.findById(id);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Create audit log for download action
    await createAuditLog(
      userId,
      "download",
      "document",
      document._id,
      document.title,
      document.department,
      req,
      {
        fileType: document.fileType,
        fileSize: document.fileSize,
        version: document.version,
      }
    );

    res.status(200).json({
      success: true,
      message: "Download logged",
      data: {
        fileUrl: document.fileUrl,
        fileName: document.originalFileName,
      },
    });
  } catch (error) {
    console.error("Download document error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to log download",
      error: error.message,
    });
  }
};

// Update Document Metadata
export const updateDocumentMetadata = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, tags, metadata } = req.body;
    const userId = req.user._id;
    const userName = req.user.name;

    const document = await DocumentModel.findById(id).populate("folder");

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    const oldTitle = document.title;

    // Update fields
    if (title) document.title = title;
    if (tags !== undefined) document.tags = tags;
    if (metadata !== undefined) document.metadata = metadata;

    await document.save();

    // Create audit log
    await createAuditLog(
      userId,
      "edit",
      "document",
      document._id,
      document.title,
      document.department,
      req,
      {
        oldTitle,
        newTitle: title,
        changes: { title, tags, metadata },
      }
    );

    // Notify if title changed
    if (title && title !== oldTitle) {
      await notifyFolderUsers(
        document.folder,
        "version_update",
        "Document Updated",
        `${userName} renamed "${oldTitle}" to "${title}"`,
        document._id,
        userId
      );
    }

    const updatedDocument = await DocumentModel.findById(id)
      .populate("folder", "name path")
      .populate("department", "name code")
      .populate("uploadedBy", "name email");

    res.status(200).json({
      success: true,
      message: "Document metadata updated successfully",
      data: updatedDocument,
    });
  } catch (error) {
    console.error("Update document metadata error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update document metadata",
      error: error.message,
    });
  }
};

// Create New Version Metadata (after S3 upload)
export const createNewVersionMetadata = async (req, res) => {
  try {
    const { id } = req.params;
    const { fileUrl, fileKey, fileSize, changes } = req.body;
    const userId = req.user._id;
    const userName = req.user.name;

    if (!fileUrl || !fileKey || !fileSize) {
      return res.status(400).json({
        success: false,
        message: "File URL, key, and size are required",
      });
    }

    const document = await DocumentModel.findById(id).populate("folder");

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    const oldVersion = document.version;
    const newVersion = oldVersion + 1;

    // Create version record
    await DocumentVersionModel.create({
      document: document._id,
      version: newVersion,
      fileUrl,
      fileKey,
      fileSize,
      uploadedBy: userId,
      changes: changes || `Version ${newVersion}`,
    });

    // Update document to latest version
    document.fileUrl = fileUrl;
    document.fileKey = fileKey;
    document.fileSize = fileSize;
    document.version = newVersion;
    await document.save();

    // Create audit log
    await createAuditLog(
      userId,
      "upload",
      "document",
      document._id,
      document.title,
      document.department,
      req,
      {
        action: "new_version",
        oldVersion,
        newVersion,
        changes,
        fileSize,
      }
    );

    // Notify folder users about new version
    await notifyFolderUsers(
      document.folder,
      "version_update",
      "New Document Version",
      `${userName} uploaded version ${newVersion} of "${document.title}"`,
      document._id,
      userId
    );

    const updatedDocument = await DocumentModel.findById(id)
      .populate("folder", "name path")
      .populate("department", "name code")
      .populate("uploadedBy", "name email");

    res.status(200).json({
      success: true,
      message: "New version metadata saved successfully",
      data: updatedDocument,
    });
  } catch (error) {
    console.error("Create version metadata error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save version metadata",
      error: error.message,
    });
  }
};

// Delete Document (Soft Delete)
export const deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const userName = req.user.name;

    const document = await DocumentModel.findById(id).populate("folder");

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Soft delete
    document.isActive = false;
    await document.save();

    // Create audit log
    await createAuditLog(
      userId,
      "delete",
      "document",
      document._id,
      document.title,
      document.department,
      req,
      {
        fileType: document.fileType,
        fileSize: document.fileSize,
        folder: document.folder.name,
      }
    );

    // Notify folder users
    await notifyFolderUsers(
      document.folder,
      "version_update",
      "Document Deleted",
      `${userName} deleted "${document.title}" from ${document.folder.name}`,
      null,
      userId
    );

    res.status(200).json({
      success: true,
      message: "Document deleted successfully",
      data: { fileKey: document.fileKey },
    });
  } catch (error) {
    console.error("Delete document error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete document",
      error: error.message,
    });
  }
};

// Update Document Permissions
export const updateDocumentPermissions = async (req, res) => {
  try {
    const { id } = req.params;
    const { permissions } = req.body;
    const userId = req.user._id;
    const userName = req.user.name;

    const document = await DocumentModel.findById(id).populate("folder");

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    document.permissions = permissions;
    await document.save();

    // Create audit log
    await createAuditLog(
      userId,
      "update_permissions",
      "document",
      document._id,
      document.title,
      document.department,
      req,
      {
        permissions,
      }
    );

    // Notify newly added users
    for (const permission of permissions) {
      if (permission.user && permission.user.toString() !== userId.toString()) {
        await createNotification(
          permission.user,
          "access_granted",
          "Document Access Granted",
          `${userName} granted you access to "${document.title}"`,
          document._id,
          document.folder._id
        );
      }
    }

    const updatedDocument = await DocumentModel.findById(id).populate(
      "permissions.user",
      "name email"
    );

    res.status(200).json({
      success: true,
      message: "Permissions updated successfully",
      data: updatedDocument,
    });
  } catch (error) {
    console.error("Update permissions error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update permissions",
      error: error.message,
    });
  }
};
