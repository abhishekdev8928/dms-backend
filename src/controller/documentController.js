/** 
 * FIXED DOCUMENT CONTROLLERS
 * Based on existing Document and DocumentVersion models
 */
import createHttpError from 'http-errors';
import DocumentModel from '../models/documentModel.js';
import FolderModel from '../models/folderModel.js';
import DepartmentModel from '../models/departmentModel.js';
import ActivityLogModel from '../models/activityModel.js';
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

        return { filename, key, url: signedUrl, mimeType };
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
 * ✅ FIXED: Create/Upload a new document
 * Route: POST /api/documents
 * RULE 1: First Upload
 * - Create Document with initial metadata
 * - Create DocumentVersion 1 with same metadata
 */
export const createDocument = async (req, res, next) => {
  try {
    const parsed = createDocumentSchema.safeParse({ body: req.body });
    validateRequest(parsed);

    const data = parsed.data.body;
    const createdBy = req.user.id;

    const sanitizedData = {
      name: sanitizeInputWithXSS(data.name),
      originalName: sanitizeInputWithXSS(data.originalName),
      parent_id: sanitizeAndValidateId(data.parent_id, "Parent ID"),
      fileUrl: sanitizeInput(data.fileUrl),
      mimeType: sanitizeInput(data.mimeType),
      extension: sanitizeInput(data.extension),
      size: data.size,
      description: data.description
        ? sanitizeInputWithXSS(data.description)
        : undefined,
      tags: data.tags ? data.tags.map((t) => sanitizeInputWithXSS(t)) : [],
      createdBy,
    };

    sanitizedData.type = DocumentModel.getTypeFromMimeType(
      sanitizedData.mimeType,
      sanitizedData.extension
    );


    console.log(sanitizedData.type)

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

    // Create version
   const initialVersion = await DocumentVersionModel.create({
  documentId: document._id,
  versionNumber: 1,
  name: sanitizedData.name,
  originalName: sanitizedData.originalName,
  fileUrl: sanitizedData.fileUrl,
  size: sanitizedData.size,
  mimeType: sanitizedData.mimeType,
  extension: sanitizedData.extension,
  type: sanitizedData.type,     // 🔥 NEW
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
    const userId = req.user.id;
    
    const sanitizedId = sanitizeAndValidateId(id, 'Document ID');
    const sanitizedTags = tags.map(tag => sanitizeInputWithXSS(tag));

    const document = await DocumentModel.findById(sanitizedId);
    if (!document) {
      throw createHttpError(404, 'Document not found');
    }

    await document.addTags(sanitizedTags);

    await ActivityLogModel.logActivity({
      action: 'TAGS_ADDED',
      entityType: 'Document',
      entityId: document._id,
      entityName: document.name,
      performedBy: userId,
      performedByName: req.user.name,
      performedByEmail: req.user.email,
      description: `Added tags [${sanitizedTags.join(', ')}] to "${document.displayName}"`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

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
    const userId = req.user.id;
    
    const sanitizedId = sanitizeAndValidateId(id, 'Document ID');
    const sanitizedTags = tags.map(tag => sanitizeInputWithXSS(tag));

    const document = await DocumentModel.findById(sanitizedId);
    if (!document) {
      throw createHttpError(404, 'Document not found');
    }

    const before = [...document.tags];
    await document.removeTags(sanitizedTags);

    await ActivityLogModel.logActivity({
      action: 'TAGS_REMOVED',
      entityType: 'Document',
      entityId: document._id,
      entityName: document.name,
      performedBy: userId,
      performedByName: req.user.name,
      performedByEmail: req.user.email,
      description: `Removed tags [${sanitizedTags.join(', ')}] from "${document.displayName}"`,
      changes: { tags: { before, after: document.tags } },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

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
 * Get document by ID
 */
export const getDocumentById = async (req, res, next) => {
  try {
    const parsed = getDocumentByIdSchema.safeParse({ params: req.params });
    validateRequest(parsed);

    const { id } = parsed.data.params;
    const sanitizedId = sanitizeAndValidateId(id, 'Document ID');

    const document = await DocumentModel.findById(sanitizedId)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
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

    // Log view activity
    await ActivityLogModel.logActivity({
      action: 'DOCUMENT_VIEWED',
      entityType: 'Document',
      entityId: document._id,
      entityName: document.name,
      performedBy: req.user.id,
      performedByName: req.user.name,
      performedByEmail: req.user.email,
      description: `Viewed document "${document.displayName}"`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

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
 * ✅ FIXED: Update document details
 * Route: PUT /api/documents/:id
 * RULE 3: Rename
 * - If name changes: use rename() method
 * - Other changes: update normally
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

    const changes = {};
    let nameChanged = false;

    if (data.name && data.name !== document.name) {
      await document.rename(sanitizeInputWithXSS(data.name), updatedBy);
      nameChanged = true;
    }

    if (data.description !== undefined && data.description !== document.description) {
      const desc = data.description ? sanitizeInputWithXSS(data.description) : null;
      changes.description = { before: document.description, after: desc };
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
 * Move document
 */
export const moveDocument = async (req, res, next) => {
  try {
    const parsed = moveDocumentSchema.safeParse({ params: req.params, body: req.body });
    validateRequest(parsed);

    const { id } = parsed.data.params;
    const { newParentId } = parsed.data.body;

    const document = await DocumentModel.findById(id);
    if (!document) throw createHttpError(404, "Document not found");

    await document.moveTo(newParentId);

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
 * Soft delete document
 */
export const softDeleteDocument = async (req, res, next) => {
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

    if (document.isDeleted) {
      throw createHttpError(400, 'Document is already deleted');
    }

    await document.softDelete();

    await ActivityLogModel.logActivity({
      action: 'DOCUMENT_DELETED',
      entityType: 'Document',
      entityId: document._id,
      entityName: document.name,
      performedBy: userId,
      performedByName: req.user.name,
      performedByEmail: req.user.email,
      description: `Deleted document "${document.displayName}"`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(200).json({
      success: true,
      message: 'Document deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Restore deleted document
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

    await ActivityLogModel.logActivity({
      action: 'DOCUMENT_RESTORED',
      entityType: 'Document',
      entityId: document._id,
      entityName: document.name,
      performedBy: userId,
      performedByName: req.user.name,
      performedByEmail: req.user.email,
      description: `Restored document "${document.displayName}"`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

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
 * Generate download URL
 */
export const generateDownloadUrl = async (req, res, next) => {
  try {
    const parsed = getDocumentByIdSchema.safeParse({ params: req.params });
    validateRequest(parsed);

    const { id } = parsed.data.params;
    const userId = req.user.id;
    
    const sanitizedId = sanitizeAndValidateId(id, 'Document ID');

    const document = await DocumentModel.findById(sanitizedId);
    if (!document) {
      throw createHttpError(404, 'Document not found');
    }

    const bucketName = process.env.BUCKET_NAME || config?.aws?.bucketName;
    
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: document.fileUrl,
      ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(document.displayName)}`
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    await ActivityLogModel.logActivity({
      action: 'DOCUMENT_DOWNLOADED',
      entityType: 'Document',
      entityId: document._id,
      entityName: document.name,
      performedBy: userId,
      performedByName: req.user.name,
      performedByEmail: req.user.email,
      description: `Downloaded document "${document.displayName}"`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(200).json({
      success: true,
      data: {
        url: signedUrl,
        expiresIn: 3600,
        filename: sanitizeInputWithXSS(document.displayName)
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ✅ FIXED: Create new version (Re-upload)
 * Route: POST /api/documents/:id/versions
 * RULE 2: Re-Upload
 * - Create new DocumentVersion with ALL new file metadata
 * - Update Document with ALL new file metadata
 * - Mark old version as isLatest=false
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

    // 🔥 VERY IMPORTANT: Detect file type (fix ZIP → image issue)
    const detectedType = DocumentModel.getTypeFromMimeType(
      sanitizeInput(data.mimeType),
      sanitizeInput(data.extension)
    );

    // 🔥 Build sanitized metadata for version
    const fileMetadata = {
      fileUrl: sanitizeInput(data.fileUrl),
      size: data.size,
      mimeType: sanitizeInput(data.mimeType),
      extension: sanitizeInput(data.extension),
      name: sanitizeInputWithXSS(data.name),
      originalName: sanitizeInputWithXSS(data.originalName),
      type: detectedType,     // <-- FIXED: ALWAYS detect type
    };

    // Create new version
    const newVersion = await document.reUpload(
      fileMetadata,
      data.changeDescription || "File re-uploaded",
      userId
    );

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
// export const getAllVersions = async (req, res, next) => {
//   try {

    
//     const parsed = getAllVersionsSchema.safeParse({ params: req.params });
//     validateRequest(parsed);

//     const { id } = parsed.data.params;
//     const sanitizedId = sanitizeAndValidateId(id, 'Document ID');

//     const documentExists = await DocumentModel.exists({ _id: sanitizedId });
//     if (!documentExists) {
//       throw createHttpError(404, 'Document not found');
//     }

//     const versions = await DocumentVersionModel.find({ documentId: sanitizedId })
//       .populate('documentId', 'name originalName _id extension')
//       .populate('createdBy', 'username email')
//       .sort({ versionNumber: -1 })
//       .lean();

//     const formattedVersions = versions.map((v) => ({
//   ...sanitizeObjectXSS(v),
//   sizeFormatted: formatBytes(v.size),
//   createdAgo: formatTimeAgo(v.createdAt),
//   id: v._id.toString()
// }));


//     res.status(200).json({
//       success: true,
//       count: formattedVersions.length,
//       data: formattedVersions
//     });
//   } catch (error) {
//     next(error);
//   }
// };


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

    // Fetch versions
    const versions = await DocumentVersionModel.find({ documentId: sanitizedId })
      .populate('documentId', 'name originalName _id extension type')
      .populate('createdBy', 'username email')
      .lean();

    // Sort: isLatest first, then by versionNumber descending
    const sortedVersions = versions.sort((a, b) => {
      if (a.isLatest && !b.isLatest) return -1;  // a first
      if (!a.isLatest && b.isLatest) return 1;   // b first
      return b.versionNumber - a.versionNumber;  // else by versionNumber
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
 * ✅ FIXED: Revert to version
 * Uses model's revertToVersion method
 */
// export const revertToVersion = async (req, res, next) => {
//   try {
//     const parsed = revertToVersionSchema.safeParse({ params: req.params, body: req.body });
//     validateRequest(parsed);

//     const { id } = parsed.data.params;
//     const { versionNumber } = parsed.data.body;
//     const userId = req.user.id;

//     const document = await DocumentModel.findById(id);
//     if (!document) throw createHttpError(404, "Document not found");

//     const reverted = await document.revertToVersion(versionNumber, userId);

//     res.status(200).json({
//       success: true,
//       message: "Document reverted successfully",
//       data: reverted,
//     });
//   } catch (error) {
//     next(error);
//   }
// };


export const revertToVersion = async (req, res, next) => {
  try {
    const parsed = revertToVersionSchema.safeParse({ params: req.params, body: req.body });
    validateRequest(parsed);

    const { id } = parsed.data.params;
    const { versionNumber } = parsed.data.body;
    const userId = req.user.id;

    const document = await DocumentModel.findById(id);
    if (!document) throw createHttpError(404, "Document not found");

    const result = await document.revertToVersion(versionNumber, userId);

    res.status(200).json({
      success: true,
      message: `Reverted to version ${versionNumber}`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

