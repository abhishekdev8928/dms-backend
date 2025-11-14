/** 
 * Get document by ID
 * Route: GET /api/documents/:id
 * Access: Private
 * Params:
 *   - id: ObjectId (required)
 * Response: { success: true, data: { document, parent: { _id, name, type } } }
 */
import createHttpError from 'http-errors';
import DocumentModel from '../models/documentModel.js';
import FolderModel from '../models/folderModel.js';
import DepartmentModel from '../models/departmentModel.js';
import ActivityLogModel from '../models/activityModel.js';
import s3Client from '../config/s3Client.js';
import { GetObjectCommand, DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
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
 * ============================================
 * DOCUMENT CONTROLLERS (WITH VALIDATION & SANITIZATION)
 * ============================================
 */

/**
 * Generate presigned URLs for file upload
 * Route: POST /api/documents/generate-upload-urls
 * Access: Private
 * Body:
 *   - files: array of { filename: string, mimeType: string } (required, max 10)
 * Response: { success: true, data: [{ filename, key, url, mimeType }], message }
 */
export const generatePresignedUrls = async (req, res, next) => {
  try {
    // Validate request
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
        // Sanitize inputs
        const filename = sanitizeInputWithXSS(file.filename);
        const mimeType = sanitizeInput(file.mimeType);

        // Generate S3 key
        const key = `uploads/${timestamp}-${index}-${filename}`;

        // Create PutObject command
        const command = new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          ContentType: mimeType,
        });

        // Generate presigned URL (valid for 5 minutes)
        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

        return { 
          filename, 
          key, 
          url: signedUrl, 
          mimeType 
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
 * Create/Upload a new document
 * Route: POST /api/documents
 * Access: Private
 * Body:
 *   - name: string (required, max 255 chars)
 *   - originalName: string (required, max 255 chars)
 *   - parent_id: ObjectId (required)
 *   - fileUrl: string (required, S3 key)
 *   - mimeType: string (required)
 *   - extension: string (required, pdf|docx|xlsx|jpg|jpeg|png|zip)
 *   - size: number (required, max 5GB)
 *   - description: string (optional, max 1000 chars)
 *   - tags: string[] (optional, max 20 tags)
 * Response: { success: true, message, data: { document, currentVersion } }
 */
export const createDocument = async (req, res, next) => {
  try {

    console.log(req.body)
    // Validate request
    const parsed = createDocumentSchema.safeParse({ body: req.body });
    validateRequest(parsed);

    const data = parsed.data.body;
    const createdBy = req.user.id;

    // Sanitize all string inputs
    const sanitizedData = {
      name: sanitizeInputWithXSS(data.name),
      originalName: sanitizeInputWithXSS(data.originalName),
      parent_id: sanitizeAndValidateId(data.parent_id, 'Parent ID'),
      fileUrl: sanitizeInput(data.fileUrl),
      mimeType: sanitizeInput(data.mimeType),
      extension: sanitizeInput(data.extension),
      size: data.size,
      description: data.description ? sanitizeInputWithXSS(data.description) : undefined,
      tags: data.tags ? data.tags.map(tag => sanitizeInputWithXSS(tag)) : [],
      createdBy
    };

    // Auto-detect type from mimeType and extension
    sanitizedData.type = DocumentModel.getTypeFromMimeType(sanitizedData.mimeType, sanitizedData.extension);

    // Check parent exists
    let parentFolder = await FolderModel.findById(sanitizedData.parent_id);
    let parentDepartment = null;
    let parentType = 'Folder';

    if (!parentFolder) {
      parentDepartment = await DepartmentModel.findById(sanitizedData.parent_id);
      parentType = 'Department';
      
      if (!parentDepartment) {
        throw createHttpError(404, 'Parent folder or department not found');
      }
    }

    // Create document
    const document = await DocumentModel.create(sanitizedData);
    await document.buildPath();

    // Create initial version (v1)
    const initialVersion = await document.createNewVersion(
      sanitizedData.fileUrl,
      sanitizedData.size,
      'Initial upload',
      createdBy
    );

    // Log activity
    await ActivityLogModel.logActivity({
      action: 'DOCUMENT_UPLOADED',
      entityType: 'Document',
      entityId: document._id,
      entityName: document.name,
      performedBy: createdBy,
      performedByName: req.user.name,
      performedByEmail: req.user.email,
      description: `Uploaded document "${document.displayName}"`,
      metadata: {
        fileSize: document.size,
        mimeType: document.mimeType,
        extension: document.extension,
        type: document.type,
        path: document.path,
        parentType: parentType,
        versionNumber: initialVersion.versionNumber
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    // Sanitize response
    const responseData = sanitizeObjectXSS({
      ...document.toObject(),
      currentVersion: initialVersion
    });

    res.status(201).json({
      success: true,
      message: 'Document uploaded successfully',
      data: responseData
    });
  } catch (error) {
    console.error('Create document error:', error);
    next(error);
  }
};

/**
 * Get document by ID
 * Route: GET /api/documents/:id
 * Access: Private
 */
export const getDocumentById = async (req, res, next) => {
  try {
    // Validate request
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

    // Sanitize response
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
 * Get documents by parent (folder or department)
 * Route: GET /api/parents/:parentId/documents
 * Access: Private
 * Params:
 *   - parentId: ObjectId (required)
 * Query:
 *   - includeDeleted: 'true' | 'false' (optional)
 * Response: { success: true, count, parentType, data: [documents] }
 */
export const getDocumentsByParent = async (req, res, next) => {
  try {
    // Validate request
    const parsed = getDocumentsByParentSchema.safeParse({ 
      params: req.params,
      query: req.query 
    });
    validateRequest(parsed);

    const { parentId } = parsed.data.params;
    const includeDeleted = parsed.data.query?.includeDeleted === 'true';
    
    const sanitizedParentId = sanitizeAndValidateId(parentId, 'Parent ID');

    // Check if parent is folder or department
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

    // Sanitize response
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

/**
 * Get documents by folder (backward compatibility)
 * Route: GET /api/folders/:folderId/documents
 * Access: Private
 */
export const getDocumentsByFolder = async (req, res, next) => {
  return getDocumentsByParent(req, res, next);
};

/**
 * Get recent documents
 * Route: GET /api/departments/:departmentId/documents/recent
 * Access: Private
 * Params:
 *   - departmentId: ObjectId (required)
 * Query:
 *   - limit: number (optional, default 10, max 100)
 * Response: { success: true, count, data: [documents] }
 */
export const getRecentDocuments = async (req, res, next) => {
  try {
    // Validate request
    const parsed = getRecentDocumentsSchema.safeParse({ 
      params: req.params,
      query: req.query 
    });
    validateRequest(parsed);

    const { departmentId } = parsed.data.params;
    const limit = parsed.data.query?.limit || 10;
    
    const sanitizedDepartmentId = sanitizeAndValidateId(departmentId, 'Department ID');

    // Get department
    const department = await DepartmentModel.findById(sanitizedDepartmentId);
    if (!department) {
      throw createHttpError(404, 'Department not found');
    }

    const documents = await DocumentModel.getRecentDocuments(
      department.name,
      limit
    );

    // Sanitize response
    const sanitizedDocuments = documents.map(doc => sanitizeObjectXSS(doc));

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
 * Update document details
 * Route: PUT /api/documents/:id
 * Access: Private
 * Params:
 *   - id: ObjectId (required)
 * Body:
 *   - name: string (optional, max 255 chars)
 *   - description: string (optional, max 1000 chars, nullable)
 *   - tags: string[] (optional, max 20 tags)
 * Response: { success: true, message, data: document }
 */
export const updateDocument = async (req, res, next) => {
  const session = await DocumentModel.startSession();
  try {
    // Validate request
    const parsed = updateDocumentSchema.safeParse({
      params: req.params,
      body: req.body
    });
    validateRequest(parsed);

    const { id } = parsed.data.params;
    const data = parsed.data.body;
    const updatedBy = req.user.id;

    const sanitizedId = sanitizeAndValidateId(id, 'Document ID');

    // Find existing doc (no lock yet)
    const oldDocument = await DocumentModel.findById(sanitizedId);
    if (!oldDocument) {
      throw createHttpError(404, 'Document not found');
    }

    // Sanitize inputs (only fields we accept)
    const sanitizedData = {};
    if (typeof data.name === 'string' && data.name.trim() !== '') {
      sanitizedData.name = sanitizeInputWithXSS(data.name.trim());
    }
    if (data.description !== undefined) {
      sanitizedData.description = data.description
        ? sanitizeInputWithXSS(data.description)
        : null;
    }
    if (Array.isArray(data.tags)) {
      sanitizedData.tags = data.tags.map(tag => sanitizeInputWithXSS(String(tag)));
    }

    // Determine changes (compare against DB values)
    const changes = {};
    if (sanitizedData.name && sanitizedData.name !== oldDocument.name) {
      changes.name = { before: oldDocument.name, after: sanitizedData.name };
    }
    if (
      Object.prototype.hasOwnProperty.call(sanitizedData, 'description') &&
      sanitizedData.description !== oldDocument.description
    ) {
      changes.description = {
        before: oldDocument.description,
        after: sanitizedData.description
      };
    }
    if (
      sanitizedData.tags &&
      JSON.stringify(sanitizedData.tags) !== JSON.stringify(oldDocument.tags)
    ) {
      changes.tags = { before: oldDocument.tags, after: sanitizedData.tags };
    }

    // If nothing changed, return early
    if (Object.keys(changes).length === 0) {
      const responseData = sanitizeObjectXSS(oldDocument.toObject());
      return res.status(200).json({
        success: true,
        message: 'No changes detected',
        data: responseData
      });
    }

    // Start transaction for atomic update
    session.startTransaction();
    try {
      // Apply updates to document
      Object.assign(oldDocument, sanitizedData);
      oldDocument.updatedBy = updatedBy;
      await oldDocument.save({ session });

      // If only the name changed, only update the latest version's `name` field.
      // IMPORTANT: do NOT update filename, originalName, fileUrl, pathAtCreation, extension, etc.
      if (changes.name) {
        await DocumentVersionModel.updateOne(
          { documentId: oldDocument._id, isLatest: true },
          { $set: { name: sanitizedData.name } },
          { session }
        );
      }

      // Commit transaction
      await session.commitTransaction();
    } catch (txErr) {
      await session.abortTransaction();
      throw txErr;
    } finally {
      session.endSession();
    }

    // Re-fetch document for response (to get latest state)
    const updatedDocument = await DocumentModel.findById(sanitizedId);
    const responseData = sanitizeObjectXSS(updatedDocument.toObject());

    // Log activity (use final entityName)
    await ActivityLogModel.logActivity({
      action: 'DOCUMENT_UPDATED',
      entityType: 'Document',
      entityId: updatedDocument._id,
      entityName: sanitizedData.name || updatedDocument.name,
      performedBy: updatedBy,
      performedByName: req.user.name,
      performedByEmail: req.user.email,
      description: `Updated document "${sanitizedData.name || updatedDocument.name}"`,
      changes,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(200).json({
      success: true,
      message: 'Document updated successfully',
      data: responseData
    });
  } catch (error) {
    // ensure session cleanup on unexpected errors
    try { await session.abortTransaction(); } catch (e) {}
    try { session.endSession(); } catch (e) {}
    next(error);
  }
};




/**
 * Move document to another parent
 * Route: POST /api/documents/:id/move
 * Access: Private
 * Params:
 *   - id: ObjectId (required)
 * Body:
 *   - newParentId: ObjectId (required)
 * Response: { success: true, message, data: document }
 */
export const moveDocument = async (req, res, next) => {
  try {
    // Validate request
    const parsed = moveDocumentSchema.safeParse({ 
      params: req.params,
      body: req.body 
    });
    validateRequest(parsed);

    const { id } = parsed.data.params;
    const { newParentId } = parsed.data.body;
    const userId = req.user.id;
    
    const sanitizedId = sanitizeAndValidateId(id, 'Document ID');
    const sanitizedParentId = sanitizeAndValidateId(newParentId, 'New Parent ID');

    const document = await DocumentModel.findById(sanitizedId);
    if (!document) {
      throw createHttpError(404, 'Document not found');
    }

    // Get old parent info
    let oldParent = await FolderModel.findById(document.parent_id);
    let oldParentName = 'Unknown';
    let oldParentType = 'Folder';
    
    if (!oldParent) {
      oldParent = await DepartmentModel.findById(document.parent_id);
      oldParentType = 'Department';
      if (oldParent) {
        oldParentName = oldParent.name;
      }
    } else {
      oldParentName = oldParent.name;
    }

    const oldPath = document.path;

    // Move document
    await document.moveTo(sanitizedParentId);

    // Get new parent info
    let newParent = await FolderModel.findById(sanitizedParentId);
    let newParentName = 'Unknown';
    let newParentType = 'Folder';
    
    if (!newParent) {
      newParent = await DepartmentModel.findById(sanitizedParentId);
      newParentType = 'Department';
      if (newParent) {
        newParentName = newParent.name;
      }
    } else {
      newParentName = newParent.name;
    }

    // Log activity
    await ActivityLogModel.logActivity({
      action: 'DOCUMENT_MOVED',
      entityType: 'Document',
      entityId: document._id,
      entityName: document.name,
      performedBy: userId,
      performedByName: req.user.name,
      performedByEmail: req.user.email,
      description: `Moved document "${document.displayName}" from "${oldParentName}" (${oldParentType}) to "${newParentName}" (${newParentType})`,
      changes: {
        parent_id: { before: oldParent?._id, after: sanitizedParentId },
        path: { before: oldPath, after: document.path }
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    // Sanitize response
    const responseData = sanitizeObjectXSS(document.toObject());

    res.status(200).json({
      success: true,
      message: 'Document moved successfully',
      data: responseData
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Soft delete document
 * Route: DELETE /api/documents/:id
 * Access: Private
 * Params:
 *   - id: ObjectId (required)
 * Response: { success: true, message }
 */
export const softDeleteDocument = async (req, res, next) => {
  try {
    // Validate request
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

    // Log activity
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
 * Route: POST /api/documents/:id/restore
 * Access: Private
 * Params:
 *   - id: ObjectId (required)
 * Response: { success: true, message, data: document }
 */
export const restoreDocument = async (req, res, next) => {
  try {
    // Validate request
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

    // Log activity
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

    // Sanitize response
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
 * Route: GET /api/documents/search
 * Access: Private
 * Query:
 *   - q: string (required, max 100 chars)
 *   - departmentId: ObjectId (optional)
 *   - limit: number (optional, default 20, max 100)
 * Response: { success: true, count, data: [documents] }
 */
export const searchDocuments = async (req, res, next) => {
  try {
    // Validate request
    const parsed = searchDocumentsSchema.safeParse({ query: req.query });
    validateRequest(parsed);

    const { q, departmentId, limit } = parsed.data.query;
    
    // Sanitize search query
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

    // Sanitize response
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
 * Generate download URL for document
 * Route: GET /api/documents/:id/download
 * Access: Private
 * Params:
 *   - id: ObjectId (required)
 * Response: { success: true, data: { url, expiresIn, filename } }
 */
export const generateDownloadUrl = async (req, res, next) => {
  try {
    // Validate request
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
    
    // Generate presigned URL for download
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: document.fileUrl,
      ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(document.displayName)}`


    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    // Log activity
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
 * Create new version of document
 * Route: POST /api/documents/:id/versions
 * Access: Private
 * Params:
 *   - id: ObjectId (required)
 * Body:
 *   - fileUrl: string (required, S3 key)
 *   - size: number (required, max 5GB)
 *   - changeDescription: string (optional, max 500 chars)
 * Response: { success: true, message, data: newVersion }
 */
export const createVersion = async (req, res, next) => {
  try {
    // ✅ Validate request using Zod
    const parsed = createVersionSchema.safeParse({
      params: req.params,
      body: req.body
    });
    validateRequest(parsed);

    const { id } = parsed.data.params;
    const {
      fileUrl,
      size,
      mimeType,
      extension,
      name,
      originalName,
      changeDescription,
      fileHash
    } = parsed.data.body;

    const userId = req.user.id;

    // ✅ Sanitize all inputs
    const sanitizedId = sanitizeAndValidateId(id, "Document ID");
    const sanitizedFileUrl = sanitizeInput(fileUrl);
    const sanitizedMimeType = mimeType ? sanitizeInput(mimeType) : null;
    const sanitizedExtension = extension ? sanitizeInput(extension) : null;
    const sanitizedName = name ? sanitizeInputWithXSS(name) : null;
    const sanitizedOriginalName = originalName ? sanitizeInputWithXSS(originalName) : null;
    const sanitizedDescription = changeDescription
      ? sanitizeInputWithXSS(changeDescription)
      : "New version";
    const sanitizedFileHash = fileHash ? sanitizeInput(fileHash) : null;

    // ✅ Check if document exists
    const document = await DocumentModel.findById(sanitizedId);
    if (!document) {
      throw createHttpError(404, "Document not found");
    }

    // ✅ Create new version
    const newVersion = await document.createNewVersion(
      sanitizedFileUrl,
      size,
      sanitizedDescription,
      userId,
      {
        mimeType: sanitizedMimeType,
        extension: sanitizedExtension,
        name: sanitizedName,
        originalName: sanitizedOriginalName,
        fileHash: sanitizedFileHash
      }
    );

    // ✅ Log activity
    await ActivityLogModel.logActivity({
      action: "VERSION_CREATED",
      entityType: "DocumentVersion",
      entityId: newVersion._id,
      entityName: `${document.name} v${newVersion.versionNumber}`,
      performedBy: userId,
      performedByName: req.user.name,
      performedByEmail: req.user.email,
      description: `Created version ${newVersion.versionNumber} of document "${document.displayName}"`,
      metadata: {
        versionNumber: newVersion.versionNumber,
        changeDescription: sanitizedDescription
      },
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });

    // ✅ Sanitize and respond
    const responseData = sanitizeObjectXSS(newVersion.toObject());

    res.status(201).json({
      success: true,
      message: "New version created successfully",
      data: responseData
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all versions of a document
 * Route: GET /api/documents/:id/versions
 * Access: Private
 * Params:
 *   - id: ObjectId (required)
 * Response: { success: true, count, data: [versions with formatted fields] }
 */
export const getAllVersions = async (req, res, next) => {
  try {
    // Validate request
    const parsed = getAllVersionsSchema.safeParse({ params: req.params });
    validateRequest(parsed);

    const { id } = parsed.data.params;
    const sanitizedId = sanitizeAndValidateId(id, 'Document ID');

    // Check if document exists
    const documentExists = await DocumentModel.exists({ _id: sanitizedId });
    if (!documentExists) {
      throw createHttpError(404, 'Document not found');
    }

    // Get versions
    const versions = await DocumentVersionModel.find({ documentId: sanitizedId })
      .populate('documentId', 'name originalName _id')
      .populate('createdBy', 'name email')
      .sort({ versionNumber: -1 })
      .lean();

    const formattedVersions = versions.map((v, index) => ({
      ...sanitizeObjectXSS(v),
      sizeFormatted: formatBytes(v.size),
      isLatest: index === 0,
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
 * Revert document to a specific version
 * Route: POST /api/documents/:id/revert
 * Access: Private
 * 
 * Logic: Finds the version to restore, marks it as latest (isLatest=true),
 * unmarks all other versions, and updates the main document with that version's metadata
 */
export const revertToVersion = async (req, res, next) => {
  try {
    // Validate request
    const parsed = revertToVersionSchema.safeParse({ 
      params: req.params,
      body: req.body 
    });
    validateRequest(parsed);

    const { id } = parsed.data.params;
    const { versionNumber } = parsed.data.body;
    const userId = req.user.id;
    
    const sanitizedId = sanitizeAndValidateId(id, 'Document ID');

    // Step 1: Find the document
    const document = await DocumentModel.findById(sanitizedId);
    if (!document) {
      throw createHttpError(404, 'Document not found');
    }

    // Step 2: Find the version to restore
    const versionToRestore = await DocumentVersionModel.findOne({
      documentId: sanitizedId,
      versionNumber: versionNumber
    });

    if (!versionToRestore) {
      throw createHttpError(404, `Version ${versionNumber} not found`);
    }

    // Step 3: Unmark all versions as latest
    await DocumentVersionModel.updateMany(
      { documentId: sanitizedId },
      { $set: { isLatest: false } }
    );

    // Step 4: Mark the selected version as latest
    versionToRestore.isLatest = true;
    await versionToRestore.save();

    // Step 5: Update the main document with restored version's metadata
    document.name = versionToRestore.name;
    document.originalName = versionToRestore.originalName;
    document.fileUrl = versionToRestore.fileUrl;
    document.size = versionToRestore.size;
    document.mimeType = versionToRestore.mimeType;
    document.extension = versionToRestore.extension;
    document.currentVersionId = versionToRestore._id;
    document.updatedBy = userId;
    
    // Update type based on restored file's mimeType
    document.type = DocumentModel.getTypeFromMimeType(
      versionToRestore.mimeType, 
      versionToRestore.extension
    );

    await document.save();

    // Step 6: Populate references for response
    await versionToRestore.populate([
      { path: 'documentId', select: 'name originalName' },
      { path: 'createdBy', select: 'name email' }
    ]);

    // Step 7: Log activity
    await ActivityLogModel.logActivity({
      action: 'VERSION_REVERTED',
      entityType: 'Document',
      entityId: document._id,
      entityName: document.name,
      performedBy: userId,
      performedByName: req.user.name,
      performedByEmail: req.user.email,
      description: `Reverted "${document.displayName}" to version ${versionNumber}`,
      metadata: {
        versionNumber: versionNumber,
        restoredFrom: versionToRestore._id,
        fileUrl: versionToRestore.fileUrl,
        size: versionToRestore.size
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    // Step 8: Sanitize and send response
    const responseData = sanitizeObjectXSS({
      document: document.toObject(),
      restoredVersion: versionToRestore.toObject()
    });

    res.status(200).json({
      success: true,
      message: `Document reverted to version ${versionNumber} successfully`,
      data: responseData
    });
  } catch (error) {
    console.error('Revert version error:', error);
    next(error);
  }
};

/**
 * Add tags to a document
 * Route: POST /api/documents/:id/tags
 * Access: Private
 */
export const addTags = async (req, res, next) => {
  try {
    // Validate request
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

    // Add unique tags
    document.tags = Array.from(new Set([...document.tags, ...sanitizedTags]));
    document.updatedBy = userId;
    await document.save();

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

    // Sanitize response
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
 * Remove tags from a document
 * Route: DELETE /api/documents/:id/tags
 * Access: Private
 */
export const removeTags = async (req, res, next) => {
  try {
    // Validate request
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
    document.tags = document.tags.filter(tag => !sanitizedTags.includes(tag));
    document.updatedBy = userId;
    await document.save();

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

    // Sanitize response
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
 * Route: GET /api/documents/tags
 * Access: Private
 */
export const findByTags = async (req, res, next) => {
  try {
    // Validate request
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

    // Sanitize response
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
 * Find documents by file extension
 * Route: GET /api/documents/extension/:ext
 * Access: Private
 */
export const findByExtension = async (req, res, next) => {
  try {
    // Validate request
    const parsed = findByExtensionSchema.safeParse({ params: req.params });
    validateRequest(parsed);

    const { ext } = parsed.data.params;
    const sanitizedExt = sanitizeInput(ext);

    const documents = await DocumentModel.find({ 
      extension: sanitizedExt, 
      isDeleted: false 
    }).populate('createdBy', 'name email');

    // Sanitize response
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
 * Get department-wise document statistics
 * Route: GET /api/departments/:departmentId/stats
 * Access: Private
 */
export const getDepartmentStats = async (req, res, next) => {
  try {
    // Validate request
    const parsed = getDepartmentStatsSchema.safeParse({ params: req.params });
    validateRequest(parsed);

    const { departmentId } = parsed.data.params;
    const sanitizedDeptId = sanitizeAndValidateId(departmentId, 'Department ID');

    const department = await DepartmentModel.findById(sanitizedDeptId);
    if (!department) {
      throw createHttpError(404, 'Department not found');
    }

    const stats = await DocumentModel.aggregate([
      { $match: { path: { $regex: department.name }, isDeleted: false } },
      {
        $group: {
          _id: '$extension',
          totalSize: { $sum: '$size' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Sanitize response
    const sanitizedStats = sanitizeObjectXSS(stats);

    res.status(200).json({
      success: true,
      data: sanitizedStats
    });
  } catch (error) {
    next(error);
  }
};