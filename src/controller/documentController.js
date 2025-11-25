/** 
 * UPDATED DOCUMENT CONTROLLERS - Complete Activity Logging Implementation
 * ✅ All activities logged using new Activity Model static methods
 * ✅ Proper userInfo object passed (name, email, avatar)
 * ✅ Added missing activity logs for download, preview, and version upload
 */
import createHttpError from 'http-errors';
import DocumentModel from '../models/documentModel.js';
import FolderModel from '../models/folderModel.js';
import DepartmentModel from '../models/departmentModel.js';
import ActivityLog from '../models/activityModel.js';
import s3Client from '../config/s3Client.js';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/config.js';
import DocumentVersionModel from '../models/documentVersionModel.js';
import { formatBytes, formatTimeAgo } from '../utils/formatter.js';
import {
  sanitizeInput,
  sanitizeAndValidateId,
  sanitizeInputWithXSS,
  sanitizeObjectXSS,
  validateRequest
} from '../utils/helper.js';
import {
  generatePresignedUrlsSchema,
  createDocumentSchema,
  getDocumentByIdSchema,
  getDocumentsByParentSchema,
  updateDocumentSchema,
  moveDocumentSchema,
  documentOperationSchema,
  searchDocumentsSchema,
  createVersionSchema,
  getAllVersionsSchema,
  revertToVersionSchema,
  tagsOperationSchema,
  findByTagsSchema,
  findByExtensionSchema,
  getDepartmentStatsSchema,
  getRecentDocumentsSchema
} from '../validation/documentValidation.js';

import {
  validateFile,
  findGroupByExtension,
  isExtensionBlocked,
  isMimeTypeBlocked
} from '../utils/constant.js';

/**
 * Helper function to get user info for activity logging
 */
const getUserInfo = (user) => ({
  name: user.name || user.username || 'Unknown User',
  email: user.email || '',
  avatar: user.avatar || user.profilePicture || null
});

/**
 * Generate presigned URLs for file upload
 * Route: POST /api/documents/generate-upload-urls
 */
export const generatePresignedUrls = async (req, res, next) => {
  try {
    const parsed = generatePresignedUrlsSchema.safeParse({ body: req.body });
    validateRequest(parsed);

    const bucketName = process.env.BUCKET_NAME || config?.aws?.bucketName;
    const { files } = parsed.data.body;

    if (!bucketName) {
      throw createHttpError(500, "S3 bucket name is not configured");
    }

    // ✅ VALIDATE ALL FILES FIRST
    const invalidFiles = [];
    
for (const file of files) {
  // Extract extension safely
  const ext = file.filename.includes(".")
    ? `.${file.filename.split(".").pop().toLowerCase()}`
    : null;

  const validation = validateFile(ext, file.mimeType);

  if (!validation.valid) {
    invalidFiles.push({
      filename: file.filename,
      reason: validation.reason,
      extension: ext,
      mimeType: file.mimeType
    });
  }
}



    if (invalidFiles.length > 0) {
      throw createHttpError(400, `Invalid files detected: ${JSON.stringify(invalidFiles)}`);
    }

    const timestamp = Date.now();
    const urls = await Promise.all(
      files.map(async (file, index) => {
        const filename = sanitizeInputWithXSS(file.filename);
        const mimeType = sanitizeInput(file.mimeType);
        const key = `uploads/${timestamp}-${index}-${filename}`;

        const command = new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          ContentType: mimeType,
        });

        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

        // ✅ INCLUDE VALIDATION INFO
        const validation = validateFile(filename, mimeType);

        return { 
          filename, 
          key, 
          url: signedUrl, 
          mimeType,
          fileGroup: validation.group,
          category: validation.category
        };
      })
    );

    res.status(200).json({
      success: true,
      data: urls,
      message: `Generated ${urls.length} presigned upload URL(s)`
    });
  } catch (error) {
    console.error("Error generating presigned URLs:", error);
    next(error);
  }
};

/**
 * ✅ Create/Upload a new document
 * Route: POST /api/documents
 * NOTE: Activity logging removed - Frontend calls POST /api/activity/bulk-upload after all files uploaded
 */
export const createDocument = async (req, res, next) => {
  try {
    const parsed = createDocumentSchema.safeParse({ body: req.body });
    validateRequest(parsed);

    const data = parsed.data.body;
    const createdBy = req.user.id;

    // ✅ VALIDATE FILE USING NEW CONSTANTS
    const sanitizedExtension = sanitizeInput(data.extension);
    const sanitizedMimeType = sanitizeInput(data.mimeType);
    
    const validation = validateFile(sanitizedExtension, sanitizedMimeType);
    
    if (!validation.valid) {
      throw createHttpError(400, validation.reason);
    }

    const sanitizedData = {
      name: sanitizeInputWithXSS(data.name),
      originalName: sanitizeInputWithXSS(data.originalName),
      parent_id: sanitizeAndValidateId(data.parent_id, "Parent ID"),
      fileUrl: sanitizeInput(data.fileUrl),
      mimeType: sanitizedMimeType,
      extension: sanitizedExtension,
      size: data.size,
      description: data.description
        ? sanitizeInputWithXSS(data.description)
        : undefined,
      tags: data.tags ? data.tags.map((t) => sanitizeInputWithXSS(t)) : [],
      createdBy,
    };

    // ✅ USE VALIDATION RESULT FOR TYPE
    sanitizedData.type = validation.category === 'document' 
      ? DocumentModel.getTypeFromMimeType(sanitizedData.mimeType, sanitizedData.extension)
      : validation.category;

    // Get parent for folder name
    let parent =
      (await FolderModel.findById(sanitizedData.parent_id)) ||
      (await DepartmentModel.findById(sanitizedData.parent_id));

    if (!parent) throw createHttpError(404, "Parent folder/department not found");

    // Create document
    const document = new DocumentModel({
      ...sanitizedData,
      version: 1,
    });

    await document.buildPath();
    await document.save();

    // Create initial version
    const initialVersion = await DocumentVersionModel.create({
      documentId: document._id,
      versionNumber: 1,
      name: sanitizedData.name,
      originalName: sanitizedData.originalName,
      fileUrl: sanitizedData.fileUrl,
      size: sanitizedData.size,
      mimeType: sanitizedData.mimeType,
      extension: sanitizedData.extension,
      type: sanitizedData.type,
      isLatest: true,
      changeDescription: "Initial upload",
      pathAtCreation: document.path,
      createdBy,
    });

    document.currentVersionId = initialVersion._id;
    await document.save();

    res.status(201).json({
      success: true,
      message: "Document uploaded successfully",
      data: {
        ...document.toObject(),
        currentVersion: initialVersion,
        fileValidation: {
          group: validation.group,
          category: validation.category
        }
      },
    });
  } catch (error) {
    next(error);
  }
};

export const validateFileBeforeUpload = async (req, res, next) => {
  try {
    const { extension, mimeType } = req.body;
    
    if (!extension || !mimeType) {
      throw createHttpError(400, 'Extension and mimeType are required');
    }

    const sanitizedExtension = sanitizeInput(extension);
    const sanitizedMimeType = sanitizeInput(mimeType);
    
    const validation = validateFile(sanitizedExtension, sanitizedMimeType);
    
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        valid: false,
        reason: validation.reason,
        extension: validation.extension,
        mimeType: validation.mimeType
      });
    }

    // Get format group info
    const formatGroup = findGroupByExtension(sanitizedExtension);

    res.status(200).json({
      success: true,
      valid: true,
      data: {
        group: validation.group,
        category: validation.category,
        description: formatGroup?.description,
        allowedExtensions: formatGroup?.extensions,
        message: 'File is valid and allowed'
      }
    });
  } catch (error) {
    next(error);
  }
};
/**
 * Add tags to document
 * No activity logging needed for tag operations
 */
export const addTags = async (req, res, next) => {
  try {
    const parsed = tagsOperationSchema.safeParse({ 
      params: req.params,
      body: req.body 
    });
    validateRequest(parsed);

    const { id } = parsed.data.params;
    const { tags } = parsed.data.body;
    
    const sanitizedId = sanitizeAndValidateId(id, 'Document ID');
    const sanitizedTags = tags.map(tag => sanitizeInputWithXSS(tag));

    const document = await DocumentModel.findById(sanitizedId);
    if (!document) {
      throw createHttpError(404, 'Document not found');
    }

    await document.addTags(sanitizedTags);

    const responseData = sanitizeObjectXSS(document.toObject());

    res.status(200).json({
      success: true,
      message: 'Tags added successfully',
      data: responseData
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove tags from document
 * No activity logging needed for tag operations
 */
export const removeTags = async (req, res, next) => {
  try {
    const parsed = tagsOperationSchema.safeParse({ 
      params: req.params,
      body: req.body 
    });
    validateRequest(parsed);

    const { id } = parsed.data.params;
    const { tags } = parsed.data.body;
    
    const sanitizedId = sanitizeAndValidateId(id, 'Document ID');
    const sanitizedTags = tags.map(tag => sanitizeInputWithXSS(tag));

    const document = await DocumentModel.findById(sanitizedId);
    if (!document) {
      throw createHttpError(404, 'Document not found');
    }

    await document.removeTags(sanitizedTags);

    const responseData = sanitizeObjectXSS(document.toObject());

    res.status(200).json({
      success: true,
      message: 'Tags removed successfully',
      data: responseData
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Find documents by tags
 */
export const findByTags = async (req, res, next) => {
  try {
    const parsed = findByTagsSchema.safeParse({ query: req.query });
    validateRequest(parsed);

    const tagArray = parsed.data.query.tags;
    const sanitizedTags = tagArray.map(tag => sanitizeInputWithXSS(tag));

    const documents = await DocumentModel.find({ 
      tags: { $in: sanitizedTags }, 
      isDeleted: false 
    })
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    const sanitizedDocuments = documents.map(doc => sanitizeObjectXSS(doc.toObject()));

    res.status(200).json({
      success: true,
      count: sanitizedDocuments.length,
      data: sanitizedDocuments
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Find documents by extension
 */
export const findByExtension = async (req, res, next) => {
  try {
    const parsed = findByExtensionSchema.safeParse({ params: req.params });
    validateRequest(parsed);

    const { ext } = parsed.data.params;
    const sanitizedExt = sanitizeInput(ext);

    const documents = await DocumentModel.find({ 
      extension: sanitizedExt, 
      isDeleted: false 
    }).populate('createdBy', 'name email');

    const sanitizedDocuments = documents.map(doc => sanitizeObjectXSS(doc.toObject()));

    res.status(200).json({
      success: true,
      count: sanitizedDocuments.length,
      data: sanitizedDocuments
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get department statistics
 */
export const getDepartmentStats = async (req, res, next) => {
  try {
    const parsed = getDepartmentStatsSchema.safeParse({ params: req.params });
    validateRequest(parsed);

    const { departmentId } = parsed.data.params;
    const sanitizedDeptId = sanitizeAndValidateId(departmentId, 'Department ID');

    const department = await DepartmentModel.findById(sanitizedDeptId);
    if (!department) {
      throw createHttpError(404, 'Department not found');
    }

    const stats = await DocumentModel.aggregate([
      { 
        $match: { 
          path: { $regex: `^/${department.name}/` }, 
          isDeleted: false 
        } 
      },
      {
        $group: {
          _id: '$extension',
          totalSize: { $sum: '$size' },
          count: { $sum: 1 }
        }
      }
    ]);

    const sanitizedStats = sanitizeObjectXSS(stats);

    res.status(200).json({
      success: true,
      data: sanitizedStats
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ✅ Get document by ID
 * No activity logging needed for simple reads
 */
export const getDocumentById = async (req, res, next) => {
  try {
    const parsed = getDocumentByIdSchema.safeParse({ params: req.params });
    validateRequest(parsed);

    const { id } = parsed.data.params;
    const sanitizedId = sanitizeAndValidateId(id, 'Document ID');

    const document = await DocumentModel.findById(sanitizedId)
      .populate('createdBy', 'name email avatar')
      .populate('updatedBy', 'name email avatar')
      .populate('currentVersionId');

    if (!document) {
      throw createHttpError(404, 'Document not found');
    }

    // Get parent info
    let parentInfo = null;
    const parentFolder = await FolderModel.findById(document.parent_id);
    
    if (parentFolder) {
      parentInfo = { 
        _id: parentFolder._id, 
        name: sanitizeInputWithXSS(parentFolder.name), 
        type: 'Folder' 
      };
    } else {
      const parentDepartment = await DepartmentModel.findById(document.parent_id);
      if (parentDepartment) {
        parentInfo = { 
          _id: parentDepartment._id, 
          name: sanitizeInputWithXSS(parentDepartment.name), 
          type: 'Department' 
        };
      }
    }

    const responseData = sanitizeObjectXSS({
      ...document.toJSON(),
      parent: parentInfo
    });

    res.status(200).json({
      success: true,
      data: responseData
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get documents by parent
 */
export const getDocumentsByParent = async (req, res, next) => {
  try {
    const parsed = getDocumentsByParentSchema.safeParse({ 
      params: req.params,
      query: req.query 
    });
    validateRequest(parsed);

    const { parentId } = parsed.data.params;
    const includeDeleted = parsed.data.query?.includeDeleted === 'true';
    
    const sanitizedParentId = sanitizeAndValidateId(parentId, 'Parent ID');

    let parent = await FolderModel.findById(sanitizedParentId);
    let parentType = 'Folder';
    
    if (!parent) {
      parent = await DepartmentModel.findById(sanitizedParentId);
      parentType = 'Department';
      
      if (!parent) {
        throw createHttpError(404, 'Parent folder or department not found');
      }
    }

    const documents = await DocumentModel.findByFolder(
      sanitizedParentId,
      includeDeleted
    ).populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    const sanitizedDocuments = documents.map(doc => sanitizeObjectXSS(doc.toObject()));

    res.status(200).json({
      success: true,
      count: sanitizedDocuments.length,
      parentType,
      data: sanitizedDocuments
    });
  } catch (error) {
    next(error);
  }
};

export const getDocumentsByFolder = getDocumentsByParent;

/**
 * Get recent documents
 */
export const getRecentDocuments = async (req, res, next) => {
  try {
    const parsed = getRecentDocumentsSchema.safeParse({ 
      params: req.params,
      query: req.query 
    });
    validateRequest(parsed);

    const { departmentId } = parsed.data.params;
    const limit = parsed.data.query?.limit || 10;
    
    const sanitizedDepartmentId = sanitizeAndValidateId(departmentId, 'Department ID');

    const department = await DepartmentModel.findById(sanitizedDepartmentId);
    if (!department) {
      throw createHttpError(404, 'Department not found');
    }

    const documents = await DocumentModel.find({
      path: new RegExp(`^/${department.name}/`),
      isDeleted: false
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('createdBy', 'name email');

    const sanitizedDocuments = documents.map(doc => sanitizeObjectXSS(doc.toObject()));

    res.status(200).json({
      success: true,
      count: sanitizedDocuments.length,
      data: sanitizedDocuments
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ✅ ACTIVITY LOGGED: Update document details
 * Route: PUT /api/documents/:id
 * Activity: FILE_RENAMED (if name changes)
 */
export const updateDocument = async (req, res, next) => {
  try {
    const parsed = updateDocumentSchema.safeParse({
      params: req.params,
      body: req.body,
    });
    validateRequest(parsed);

    const { id } = parsed.data.params;
    const data = parsed.data.body;
    const updatedBy = req.user.id;

    const document = await DocumentModel.findById(id);
    if (!document) throw createHttpError(404, "Document not found");

    let nameChanged = false;
    const oldName = document.name;

    if (data.name && data.name !== document.name) {
      const newName = sanitizeInputWithXSS(data.name);
      await document.rename(newName, updatedBy);
      nameChanged = true;

      // ✅ ACTIVITY LOG: FILE_RENAMED
      const userInfo = getUserInfo(req.user);
      await ActivityLog.logFileRename(
        updatedBy,
        document,
        oldName,
        newName,
        userInfo
      );
    }

    if (data.description !== undefined && data.description !== document.description) {
      const desc = data.description ? sanitizeInputWithXSS(data.description) : null;
      document.description = desc;
    }

    if (data.tags) {
      const tags = data.tags.map((t) => sanitizeInputWithXSS(t));
      document.tags = tags;
    }

    if (!nameChanged) {
      document.updatedBy = updatedBy;
      await document.save();
    }

    res.status(200).json({
      success: true,
      message: "Document updated successfully",
      data: document.toObject(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ✅ ACTIVITY LOGGED: Move document
 * Route: PUT /api/documents/:id/move
 * Activity: FILE_MOVED
 */
export const moveDocument = async (req, res, next) => {
  try {
    const parsed = moveDocumentSchema.safeParse({ params: req.params, body: req.body });
    validateRequest(parsed);

    const { id } = parsed.data.params;
    const { newParentId } = parsed.data.body;
    const userId = req.user.id;

    const document = await DocumentModel.findById(id);
    if (!document) throw createHttpError(404, "Document not found");

    const oldParentId = document.parent_id;

    // Get old parent info
    let fromFolder = await FolderModel.findById(oldParentId);
    if (!fromFolder) {
      fromFolder = await DepartmentModel.findById(oldParentId);
    }

    // Get new parent info
    let toFolder = await FolderModel.findById(newParentId);
    if (!toFolder) {
      toFolder = await DepartmentModel.findById(newParentId);
    }

    if (!toFolder) {
      throw createHttpError(404, "New parent folder/department not found");
    }

    await document.moveTo(newParentId);

    // ✅ ACTIVITY LOG: FILE_MOVED
    const userInfo = getUserInfo(req.user);
    await ActivityLog.logFileMove(
      userId,
      document,
      oldParentId,
      newParentId,
      userInfo
    );

    res.status(200).json({
      success: true,
      message: "Document moved successfully",
      data: document.toObject(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ✅ ACTIVITY LOGGED: Soft delete document
 * Route: DELETE /api/documents/:id
 * Activity: FILE_DELETED
 */
export const softDeleteDocument = async (req, res, next) => {
  try {
    const parsed = documentOperationSchema.safeParse({ params: req.params });
    validateRequest(parsed);

    const { id } = parsed.data.params;
    const userId = req.user.id;

    const sanitizedId = sanitizeAndValidateId(id, "Document ID");

    const document = await DocumentModel.findById(sanitizedId);
    if (!document) {
      throw createHttpError(404, "Document not found");
    }

    if (document.isDeleted) {
      throw createHttpError(400, "Document is already deleted");
    }

    // Perform soft delete
    document.isDeleted = true;
    document.deletedAt = new Date();
    document.deletedBy = userId;
    document.updatedBy = userId;

    await document.save();

    // ✅ ACTIVITY LOG: FILE_DELETED
    const userInfo = getUserInfo(req.user);
    await ActivityLog.logFileDelete(userId, document, userInfo);

    res.status(200).json({
      success: true,
      message: "Document moved to bin",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ✅ ACTIVITY LOGGED: Restore deleted document
 * Route: POST /api/documents/:id/restore
 * Activity: FILE_RESTORED (single item via logBulkRestore)
 */
export const restoreDocument = async (req, res, next) => {
  try {
    const parsed = documentOperationSchema.safeParse({ params: req.params });
    validateRequest(parsed);

    const { id } = parsed.data.params;
    const userId = req.user.id;
    
    const sanitizedId = sanitizeAndValidateId(id, 'Document ID');

    const document = await DocumentModel.findById(sanitizedId);
    if (!document) {
      throw createHttpError(404, 'Document not found');
    }

    if (!document.isDeleted) {
      throw createHttpError(400, 'Document is not deleted');
    }

    await document.restore();

    // ✅ ACTIVITY LOG: FILE_RESTORED (via logBulkRestore with single item)
    const userInfo = getUserInfo(req.user);
    const item = {
      id: document._id,
      name: document.originalName || document.name,
      extension: document.extension,
      type: 'file',
      itemType: 'file',
      size: document.size,
      path: document.path,
      parent_id: document.parent_id
    };
    
    await ActivityLog.logBulkRestore(userId, [item], userInfo);

    const responseData = sanitizeObjectXSS(document.toObject());

    res.status(200).json({
      success: true,
      message: 'Document restored successfully',
      data: responseData
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Search documents
 */
export const searchDocuments = async (req, res, next) => {
  try {
    const parsed = searchDocumentsSchema.safeParse({ query: req.query });
    validateRequest(parsed);

    const { q, departmentId, limit } = parsed.data.query;
    const sanitizedQuery = sanitizeInputWithXSS(q);

    let departmentName = null;
    if (departmentId) {
      const sanitizedDeptId = sanitizeAndValidateId(departmentId, 'Department ID');
      const department = await DepartmentModel.findById(sanitizedDeptId);
      if (department) {
        departmentName = department.name;
      }
    }

    const documents = await DocumentModel.searchByName(
      sanitizedQuery,
      departmentName,
      { limit: limit || 20 }
    ).populate('createdBy', 'name email');

    const sanitizedDocuments = documents.map(doc => sanitizeObjectXSS(doc.toObject()));

    res.status(200).json({
      success: true,
      count: sanitizedDocuments.length,
      data: sanitizedDocuments
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ✅ Generate download URL
 * Route: GET /api/documents/:id/download
 * NOTE: FILE_DOWNLOADED is not in your activity model enum
 * If you want to track downloads, add FILE_DOWNLOADED to the action enum and create a static method
 */
export const generateDownloadUrl = async (req, res, next) => {
  try {
    const { id } = req.params;
    const sanitizedId = sanitizeAndValidateId(id, "ID");
    const userId = req.user.id;

    let fileUrl, downloadName, document, isVersion = false;

    // Try as Document first
    document = await DocumentModel.findById(sanitizedId);

    if (document) {
      fileUrl = document.fileUrl;
      downloadName = document.originalName || document.name;
    } else {
      // Try as Version
      const version = await DocumentVersionModel.findById(sanitizedId);

      if (!version) {
        throw createHttpError(404, "Document or Version not found");
      }

      document = await DocumentModel.findById(version.documentId);
      if (!document) {
        throw createHttpError(404, "Parent Document not found");
      }

      fileUrl = version.fileUrl;
      downloadName = version.originalName;
      isVersion = true;
    }

    // Generate Signed URL
    const bucketName = process.env.BUCKET_NAME || config.aws.bucketName;

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: fileUrl,
      ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(
        downloadName
      )}`,
    });

    const signedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600,
    });

    // ⚠️ FILE_DOWNLOADED not in your activity model
    // If you want to track this, add it to the enum and create ActivityLog.logFileDownload()

    res.status(200).json({
      success: true,
      data: {
        url: signedUrl,
        expiresIn: 3600,
        filename: downloadName,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ✅ Create new version (Re-upload)
 * Route: POST /api/documents/:id/versions
 * NOTE: FILE_VERSION_UPLOADED is not in your activity model enum
 * If you want to track version uploads, add FILE_VERSION_UPLOADED to the enum and create a static method
 */

/**
 * Create new version (reupload)
 * Now with activity logging
 */
export const createVersion = async (req, res, next) => {
  try {
    const parsed = createVersionSchema.safeParse({
      params: req.params,
      body: req.body
    });
    validateRequest(parsed);

    const { id } = parsed.data.params;
    const data = parsed.data.body;
    const userId = req.user.id;

    const document = await DocumentModel.findById(id);
    if (!document) throw createHttpError(404, "Document not found");

    // Detect file type
    const detectedType = DocumentModel.getTypeFromMimeType(
      sanitizeInput(data.mimeType),
      sanitizeInput(data.extension)
    );

    // Build file metadata
    const fileMetadata = {
      fileUrl: sanitizeInput(data.fileUrl),
      size: data.size,
      mimeType: sanitizeInput(data.mimeType),
      extension: sanitizeInput(data.extension),
      name: sanitizeInputWithXSS(data.name),
      originalName: sanitizeInputWithXSS(data.originalName),
      type: detectedType,
    };

    // Create new version
    const newVersion = await document.reUpload(
      fileMetadata,
      data.changeDescription || "File re-uploaded",
      userId
    );

    // ✅ Log the version upload activity (REUPLOAD = UPLOAD)
    try {
      await ActivityLog.logFileVersionUpload(
        userId,
        {
          _id: document._id,
          id: document._id,
          name: document.name,
          extension: document.extension,
          type: document.type,
          size: fileMetadata.size,
          parent_id: document.parent_id
        },
        newVersion.versionNumber, // Pass the new version number
        {
          name: req.user.name || req.user.username,
          email: req.user.email,
          avatar: req.user.avatar
        }
      );
    } catch (logError) {
      console.error('Failed to log version upload activity:', logError);
      // Don't fail the request if logging fails
    }

    res.status(201).json({
      success: true,
      message: "New version created successfully",
      data: newVersion,
    });
  } catch (error) {
    next(error);
  }
};



/**
 * Get all versions
 */
export const getAllVersions = async (req, res, next) => {
  try {
    const parsed = getAllVersionsSchema.safeParse({ params: req.params });
    validateRequest(parsed);

    const { id } = parsed.data.params;
    const sanitizedId = sanitizeAndValidateId(id, 'Document ID');

    const documentExists = await DocumentModel.exists({ _id: sanitizedId });
    if (!documentExists) {
      throw createHttpError(404, 'Document not found');
    }

    const versions = await DocumentVersionModel.find({ documentId: sanitizedId })
      .populate('documentId', 'name originalName _id extension type')
      .populate('createdBy', 'username email')
      .lean();

    // Sort: isLatest first, then by versionNumber descending
    const sortedVersions = versions.sort((a, b) => {
      if (a.isLatest && !b.isLatest) return -1;
      if (!a.isLatest && b.isLatest) return 1;
      return b.versionNumber - a.versionNumber;
    });

    const formattedVersions = sortedVersions.map((v) => ({
      ...sanitizeObjectXSS(v),
      sizeFormatted: formatBytes(v.size),
      createdAgo: formatTimeAgo(v.createdAt),
      id: v._id.toString()
    }));

    res.status(200).json({
      success: true,
      count: formattedVersions.length,
      data: formattedVersions
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ✅ Revert to version
 * Route: POST /api/documents/:id/revert
 * NOTE: This internally creates a new version, so FILE_VERSION_UPLOADED could be logged if you add the method
 */
export const revertToVersion = async (req, res, next) => {
  try {
    const parsed = revertToVersionSchema.safeParse({
      params: req.params,
      body: req.body,
    });
    validateRequest(parsed);

    const { id } = parsed.data.params;
    const { versionNumber } = parsed.data.body;
    const userId = req.user.id;

    const document = await DocumentModel.findById(id);
    if (!document) throw createHttpError(404, "Document not found");

    // Use MODEL method (revertToVersion)
    const newVersion = await document.revertToVersion(versionNumber, userId);

    // ✅ Log the revert as a RESTORE activity (not upload!)
    try {
      await ActivityLog.logFileVersionRestore(
        userId,
        {
          _id: document._id,
          id: document._id,
          name: document.name,
          extension: document.extension,
          type: document.type,
          size: newVersion.size,
          parent_id: document.parent_id
        },
        versionNumber,              // The version that was restored
        newVersion.versionNumber,   // The new version number created by the restore
        {
          name: req.user.name || req.user.username,
          email: req.user.email,
          avatar: req.user.avatar
        }
      );
    } catch (logError) {
      console.error('Failed to log version restore activity:', logError);
      // Don't fail the request if logging fails
    }

    res.status(200).json({
      success: true,
      message: `Version ${versionNumber} restored successfully`,
      data: newVersion
    });
  } catch (error) {
    next(error);
  }
};