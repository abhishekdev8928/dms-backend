/** 
 * UPDATED DOCUMENT CONTROLLERS
 * ✅ Changed parent_id → parentId
 * ✅ Added type field ('document')
 * ✅ Added fileType field (auto-detected from extension/mimeType)
 * ✅ All activities logged using Activity Model static methods
 */
import mongoose from 'mongoose';
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
import AccessControlModel from '../models/accessControlModel.js';
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
  updateDocumentSchema,
  moveDocumentSchema,
  documentOperationSchema,
  searchDocumentsSchema,
  createVersionSchema,
  getAllVersionsSchema,
  revertToVersionSchema,
  tagsOperationSchema,

  shareDocumentSchema,
  
  getRecentDocumentsSchema
} from '../validation/documentValidation.js';

import {
  validateFile,
} from '../utils/constant.js';
import { attachActions, attachActionsBulk } from '../utils/helper/aclHelpers.js';

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
 * Changes: parent_id → parentId, added type and fileType
 */
export const createDocument = async (req, res, next) => {
  try {
    const parsed = createDocumentSchema.safeParse({ body: req.body });
    validateRequest(parsed);

    const data = parsed.data.body;
    const createdBy = req.user.id;

    // ✅ VALIDATE FILE USING CONSTANTS
    const sanitizedExtension = sanitizeInput(data.extension);
    const sanitizedMimeType = sanitizeInput(data.mimeType);
    
    const validation = validateFile(sanitizedExtension, sanitizedMimeType);
    
    if (!validation.valid) {
      throw createHttpError(400, validation.reason);
    }

    // ✅ AUTO-DETERMINE fileType using DocumentModel helper
    const fileType = DocumentModel.determineFileType(sanitizedMimeType, sanitizedExtension);

    const sanitizedData = {
      name: sanitizeInputWithXSS(data.name),
      originalName: sanitizeInputWithXSS(data.originalName),
      parentId: sanitizeAndValidateId(data.parentId, "Parent ID"), // ✅ Changed from parent_id
      type: 'document', // ✅ Added type field
      fileType: fileType, // ✅ Added fileType field
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

    // Get parent for folder name
    let parent =
      (await FolderModel.findById(sanitizedData.parentId)) ||
      (await DepartmentModel.findById(sanitizedData.parentId));

    if (!parent) throw createHttpError(404, "Parent folder/department not found");

    // Create document
    const document = new DocumentModel({
      ...sanitizedData,
      version: 1,
    });

    await document.buildPath();
    await document.save();

    // Create initial version
   // Create initial version
const initialVersion = await DocumentVersionModel.create({
  documentId: document._id,
  versionNumber: 1,
  name: sanitizedData.name,
  originalName: sanitizedData.originalName,
  type: 'document', // 🔥 ADD THIS LINE
  fileUrl: sanitizedData.fileUrl,
  size: sanitizedData.size,
  mimeType: sanitizedData.mimeType,
  extension: sanitizedData.extension,
  fileType: sanitizedData.fileType,
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
          category: validation.category,
          fileType: fileType
        }
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Add tags to document
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
 * ✅ Get document by ID with actions
 * Changes: parent_id → parentId in response + added actions
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
      .populate('currentVersionId')
      .lean(); // ✅ Added lean() for consistency

    if (!document) {
      throw createHttpError(404, 'Document not found');
    }

    // Get parent info (using parentId)
    let parentInfo = null;
    const parentFolder = await FolderModel.findById(document.parentId);
    
    if (parentFolder) {
      parentInfo = { 
        _id: parentFolder._id, 
        name: sanitizeInputWithXSS(parentFolder.name), 
        type: 'Folder' 
      };
    } else {
      const parentDepartment = await DepartmentModel.findById(document.parentId);
      if (parentDepartment) {
        parentInfo = { 
          _id: parentDepartment._id, 
          name: sanitizeInputWithXSS(parentDepartment.name), 
          type: 'Department' 
        };
      }
    }

    // Add parent info to document before attaching actions
    const documentWithParent = {
      ...document,
      parent: parentInfo
    };

    // 🔐 Attach actions for this single document
    const documentWithActions = await attachActions(documentWithParent, req.user, 'DOCUMENT');

    // Sanitize the final response
    const responseData = sanitizeObjectXSS(documentWithActions);

    res.status(200).json({
      success: true,
      data: responseData
    });
  } catch (error) {
    next(error);
  }
};

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
 * Route: POST /api/documents/:id/move
 * Activity: FILE_MOVED
 * Changes: Uses parentId
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

    const oldParentId = document.parentId; // ✅ Changed from parent_id

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
 * Activity: FILE_RESTORED
 * Changes: Uses parentId
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

    // ✅ ACTIVITY LOG: FILE_RESTORED
    const userInfo = getUserInfo(req.user);
    const item = {
      id: document._id,
      name: document.originalName || document.name,
      extension: document.extension,
      type: 'file',
      itemType: 'file',
      size: document.size,
      path: document.path,
      parentId: document.parentId // ✅ Changed from parent_id
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

    let resolvedDepartmentId = null;
    
    if (departmentId) {
      // ✅ Check if it's an ObjectId or a name string
      if (mongoose.Types.ObjectId.isValid(departmentId) && departmentId.length === 24) {
        // It's already an ObjectId
        resolvedDepartmentId = sanitizeAndValidateId(departmentId, 'Department ID');
      } else {
        // It's a department name - look it up
        const sanitizedName = sanitizeInputWithXSS(departmentId);
        const department = await DepartmentModel.findOne({ 
          name: new RegExp(`^${sanitizedName}$`, 'i') 
        });
        
        if (department) {
          resolvedDepartmentId = department._id;
        } else {
          // Department not found - return empty results
          return res.status(200).json({
            success: true,
            count: 0,
            data: [],
            message: `No department found with name: ${sanitizedName}`
          });
        }
      }
    }

    // ✅ Pass ObjectId (or null) instead of name string
    const documents = await DocumentModel.searchByName(
      sanitizedQuery,
      resolvedDepartmentId, // ✅ Now passing ObjectId instead of name
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
 * ✅ ACTIVITY LOGGED: Create new version (Re-upload)
 * Route: POST /api/documents/:id/versions
 * Activity: FILE_VERSION_UPLOADED
 * Changes: Added fileType
 */
/**
 * ✅ ACTIVITY LOGGED: Create new version (Re-upload)
 * Route: POST /api/documents/:id/versions
 * Activity: FILE_VERSION_UPLOADED
 * Changes: Added fileType and type
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

    // ✅ Auto-determine fileType
    const fileType = DocumentModel.determineFileType(
      sanitizeInput(data.mimeType),
      sanitizeInput(data.extension)
    );

    // Build file metadata
    const fileMetadata = {
      type: 'document', // ✅ Added required type field
      fileUrl: sanitizeInput(data.fileUrl),
      size: data.size,
      mimeType: sanitizeInput(data.mimeType),
      extension: sanitizeInput(data.extension),
      fileType: fileType, // ✅ Added fileType
      // ✅ Only sanitize if values exist
      ...(data.name && { name: sanitizeInputWithXSS(data.name) }),
      ...(data.originalName && { originalName: sanitizeInputWithXSS(data.originalName) }),
    };

    // Create new version
    const newVersion = await document.reUpload(
      fileMetadata,
      data.changeDescription || "File re-uploaded",
      userId
    );

    // ✅ ACTIVITY LOG: FILE_VERSION_UPLOADED
    try {
      await ActivityLog.logFileVersionUpload(
        userId,
        {
          _id: document._id,
          id: document._id,
          name: document.name,
          extension: document.extension,
          type: document.type,
          fileType: document.fileType, // ✅ Added fileType
          size: fileMetadata.size,
          parentId: document.parentId // ✅ Changed from parent_id
        },
        newVersion.versionNumber,
        getUserInfo(req.user)
      );
    } catch (logError) {
      console.error('Failed to log version upload activity:', logError);
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
      .populate('documentId', 'name originalName _id extension type fileType') // ✅ Added fileType
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
 * Get specific version by version number or ObjectId
 */
export const getVersionByNumber = async (req, res, next) => {
  try {
    const document = req.resource; // From canView middleware
    const versionParam = req.params.versionNumber;

    let version;

    // Check if it's a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(versionParam) && versionParam.length === 24) {
      // It's an ObjectId
      version = await DocumentVersionModel.findOne({
        _id: versionParam,
        documentId: document._id
      })
        .populate('documentId', 'name originalName _id extension type fileType')
        .populate('createdBy', 'username email')
        .lean();
    } else {
      // It's a version number
      const versionNumber = parseInt(versionParam);
      
      if (isNaN(versionNumber) || versionNumber < 1) {
        throw createHttpError(400, "Invalid version number. Must be a positive integer or valid ObjectId.");
      }

      version = await DocumentVersionModel.findOne({
        documentId: document._id,
        versionNumber: versionNumber
      })
        .populate('documentId', 'name originalName _id extension type fileType')
        .populate('createdBy', 'username email')
        .lean();
    }

    if (!version) {
      throw createHttpError(404, `Version not found for this document`);
    }

    const formattedVersion = {
      ...sanitizeObjectXSS(version),
      sizeFormatted: formatBytes(version.size),
      createdAgo: formatTimeAgo(version.createdAt),
      id: version._id.toString()
    };

    res.status(200).json({
      success: true,
      data: formattedVersion
    });
  } catch (error) {
    next(error);
  }
};
/**
 * ✅ ACTIVITY LOGGED: Revert to version
 * Route: POST /api/documents/:id/versions/revert
 * Activity: FILE_VERSION_RESTORED
 * Changes: Uses parentId
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

    // ✅ ACTIVITY LOG: FILE_VERSION_RESTORED
    try {
      await ActivityLog.logFileVersionRestore(
        userId,
        {
          _id: document._id,
          id: document._id,
          name: document.name,
          extension: document.extension,
          type: document.type,
          fileType: document.fileType, // ✅ Added fileType
          size: newVersion.size,
          parentId: document.parentId // ✅ Changed from parent_id
        },
        versionNumber,
        newVersion.versionNumber,
        getUserInfo(req.user)
      );
    } catch (logError) {
      console.error('Failed to log version restore activity:', logError);
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

/**
 * ✅ ACTIVITY LOGGED: Share document with users/groups
 * Route: POST /api/documents/:id/share
 * Activity: FILE_SHARED
 */
export const shareDocument = async (req, res, next) => {
  try {
    const parsed = shareDocumentSchema.safeParse({
      params: req.params,
      body: req.body
    });
    validateRequest(parsed);

    const { id } = parsed.data.params;
    const { users = [], groups = [] } = parsed.data.body;
    
    const sanitizedId = sanitizeAndValidateId(id, 'Document ID');

    // Document is already validated by middleware (canShare)
    const document = req.resource;

    if (document.isDeleted) {
      throw createHttpError(400, 'Cannot share deleted document');
    }

    const department = await DepartmentModel.findById(document.departmentId);
    if (!department) {
      throw createHttpError(500, 'Department not found');
    }

    const sharedWith = [];
    const errors = [];

    // Import ACL helper
    const { needsACL } = await import('../utils/helper/aclHelpers.js');
    const AccessControlModel = (await import('../models/accessControlModel.js')).default;
    const UserModel = mongoose.model('User');

    // Share with users
    for (const userShare of users) {
      try {
        const targetUserId = sanitizeAndValidateId(userShare.userId, 'User ID');

        const targetUser = await UserModel.findById(targetUserId);
        if (!targetUser || !targetUser.isActive) {
          throw new Error('User not found or inactive');
        }

        // Check if user needs ACL
        if (needsACL(targetUser, department)) {
          const acl = await AccessControlModel.grantToSubject(
            'DOCUMENT',
            document._id,
            'USER',
            targetUserId,
            userShare.permissions,
            req.user.id
          );

          sharedWith.push({
            subjectType: 'USER',
            subjectId: targetUserId,
            subjectName: targetUser.username || targetUser.email,
            permissions: acl.permissions
          });
        } else {
          sharedWith.push({
            subjectType: 'USER',
            subjectId: targetUserId,
            subjectName: targetUser.username || targetUser.email,
            permissions: ['view', 'download', 'upload', 'delete', 'share'],
            note: 'User has implicit access (admin/owner)'
          });
        }
      } catch (error) {
        errors.push({
          userId: userShare.userId,
          type: 'USER',
          error: error.message
        });
      }
    }

    // Share with groups
    for (const groupShare of groups) {
      try {
        const targetGroupId = sanitizeAndValidateId(groupShare.groupId, 'Group ID');

        const GroupModel = mongoose.model('Group');
        const targetGroup = await GroupModel.findById(targetGroupId);

        if (!targetGroup || !targetGroup.isActive) {
          throw new Error('Group not found or inactive');
        }

        const acl = await AccessControlModel.grantToSubject(
          'DOCUMENT',
          document._id,
          'GROUP',
          targetGroupId,
          groupShare.permissions,
          req.user.id
        );

        sharedWith.push({
          subjectType: 'GROUP',
          subjectId: targetGroupId,
          subjectName: targetGroup.name,
          permissions: acl.permissions
        });
      } catch (error) {
        errors.push({
          groupId: groupShare.groupId,
          type: 'GROUP',
          error: error.message
        });
      }
    }

    // ✅ ACTIVITY LOG: FILE_SHARED
    if (sharedWith.length > 0) {
      try {
        await ActivityLog.logFileShare(
          req.user.id,
          document,
          sharedWith,
          getUserInfo(req.user)
        );
      } catch (logError) {
        console.error('Failed to log share activity:', logError);
      }
    }

    res.status(200).json({
      success: true,
      message: `Document shared with ${sharedWith.length} subject(s)`,
      data: {
        document: {
          _id: document._id,
          name: document.name,
          path: document.path
        },
        sharedWith,
        errors: errors.length > 0 ? errors : undefined
      }
    });
  } catch (error) {
    next(error);
  }
};


/**
 * ✅ Generate download URL for specific version
 * Route: GET /api/documents/:id/versions/:versionNumber/download
 */
export const generateVersionDownloadUrl = async (req, res, next) => {
  try {
    const { id, versionNumber } = req.params;
    const sanitizedDocId = sanitizeAndValidateId(id, "Document ID");
    const versionParam = versionNumber;

    // Verify document exists (already checked by canDownload middleware)
    const document = await DocumentModel.findById(sanitizedDocId);
    if (!document) {
      throw createHttpError(404, "Document not found");
    }

    let version;

    // Check if it's a valid ObjectId (version ID) or version number
    if (mongoose.Types.ObjectId.isValid(versionParam) && versionParam.length === 24) {
      // It's a version ObjectId
      version = await DocumentVersionModel.findOne({
        _id: versionParam,
        documentId: document._id
      });
    } else {
      // It's a version number
      const versionNum = parseInt(versionParam);
      
      if (isNaN(versionNum) || versionNum < 1) {
        throw createHttpError(400, "Invalid version number. Must be a positive integer or valid ObjectId.");
      }

      version = await DocumentVersionModel.findOne({
        documentId: document._id,
        versionNumber: versionNum
      });
    }

    if (!version) {
      throw createHttpError(404, `Version not found for this document`);
    }

    // Generate Signed URL for the version
    const bucketName = process.env.BUCKET_NAME || config.aws.bucketName;
    const downloadName = version.originalName || version.name;

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: version.fileUrl,
      ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(
        downloadName
      )}`,
    });

    const signedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600,
    });

    res.status(200).json({
      success: true,
      data: {
        url: signedUrl,
        expiresIn: 3600,
        filename: downloadName,
        versionNumber: version.versionNumber,
        versionId: version._id
      },
    });
  } catch (error) {
    next(error);
  }
};