// routes/documentRoutes.js

import express from 'express';
import {
  generatePresignedUrls,
  createDocument,
  getDocumentById,
  updateDocument,
  moveDocument,
  softDeleteDocument,
  restoreDocument,
  addTags,
  removeTags,
  searchDocuments,
  generateDownloadUrl,
  createVersion,
  getAllVersions,
  revertToVersion,
  generateVersionDownloadUrl ,
  getVersionByNumber,
  shareDocument // ✅ ADD THIS IMPORT
} from '../controller/documentController.js';

import { 
  listUploadedParts,
  initiateChunkedUpload,
  completeChunkedUpload,
  abortChunkedUpload
} from "../controller/chunkedUploadController.js"

import { authenticateUser } from '../middleware/authMiddleware.js';
import {
  canCreate,
  canView,
  canDelete,
  canShare,
  checkPermission,
  canDownload
} from '../middleware/checkPermission.js';

const router = express.Router();

/**
 * ============================================
 * 🔍 SEARCH ROUTES (Must be first to avoid /:id conflicts)
 * ============================================
 */

/**
 * @route   GET /api/documents/search
 * @desc    Search documents by name/description/path
 * @access  Private - Returns only documents user has 'view' permission for
 * @query   q - search query (required)
 * @query   departmentId - filter by department (optional)
 * @query   limit - max results (optional, default: 20)
 */
router.get('/search', authenticateUser, searchDocuments);

/**
 * ============================================
 * 📤 UPLOAD ROUTES
 * ============================================
 */

/**
 * @route   POST /api/documents/generate-upload-urls
 * @desc    Generate presigned URLs for direct S3 upload (simple upload)
 * @access  Private - Requires 'upload' permission on parent folder
 * @body    { files: [{ filename: string, mimeType: string }], parentId: string }
 */
router.post('/generate-upload-urls', authenticateUser, canCreate, generatePresignedUrls);



/**
 * @route   POST /api/documents/chunked/initiate
 * @desc    Initiate chunked upload and get presigned URLs
 * @access  Private - Requires 'upload' permission on parent folder
 * @body    { filename: string, mimeType: string, fileSize: number, parentId: string }
 * @returns { uploadId, key, chunkSize, totalParts, presignedUrls[] }
 */
router.post('/chunked/initiate', 
  authenticateUser, 
  canCreate, 
  initiateChunkedUpload
);

/**
 * @route   POST /api/documents/chunked/complete
 * @desc    Complete chunked upload and create document
 * @access  Private - Requires 'upload' permission on parent
 * @body    { uploadId, key, parts: [{ ETag, PartNumber }], name, parentId, description?, tags? }
 * @returns { document }
 */
router.post('/chunked/complete', 
  authenticateUser, 
  canCreate, 
  completeChunkedUpload
);

/**
 * @route   POST /api/documents/chunked/abort
 * @desc    Abort chunked upload and cleanup S3
 * @access  Private
 * @body    { uploadId, key }
 */
router.post('/chunked/abort', 
  authenticateUser, 
  abortChunkedUpload
);

/**
 * @route   GET /api/documents/chunked/parts
 * @desc    List already uploaded parts (for resume functionality)
 * @access  Private
 * @query   uploadId, key
 * @returns { parts: [{ PartNumber, ETag, Size }] }
 */
router.get('/chunked/parts', 
  authenticateUser, 
  listUploadedParts
);

/**
 * ============================================
 * 📄 DOCUMENT CRUD ROUTES
 * ============================================
 */

/**
 * @route   POST /api/documents
 * @desc    Create/Upload a new document (after upload to S3)
 * @access  Private - Requires 'upload' permission on parent folder
 * @body    { name, originalName, parentId, fileUrl, mimeType, extension, size, fileType?, description?, tags? }
 */
router.post('/', authenticateUser, canCreate, createDocument);

/**
 * ============================================
 * 📥 DOWNLOAD ROUTES
 * ============================================
 */

/**
 * @route   GET /api/documents/:id/download
 * @desc    Generate presigned download URL for document
 * @access  Private - Requires 'download' permission
 * @params  id - document ObjectId
 */
router.get('/:id/download', authenticateUser, canDownload('DOCUMENT'), generateDownloadUrl);

/**
 * @route   GET /api/documents/:id/versions/:versionNumber
 * @desc    Get specific version details by version number
 * @access  Private - Requires 'view' permission
 * @params  id - document ObjectId
 * @params  versionNumber - version number (1, 2, 3, etc.)
 */
router.get('/:id/versions/:versionNumber', authenticateUser, canView('DOCUMENT'), getVersionByNumber);



/**
 * @route   GET /api/documents/:id/versions/:versionNumber/download
 * @desc    Generate presigned download URL for specific version
 * @access  Private - Requires 'download' permission on parent document
 * @params  id - document ObjectId
 * @params  versionNumber - version number or version ObjectId
 */
router.get('/:id/versions/:versionNumber/download', authenticateUser, canDownload('DOCUMENT'), generateVersionDownloadUrl);

/**
 * ============================================
 * 🔄 VERSION MANAGEMENT ROUTES
 * ============================================
 */

/**
 * @route   POST /api/documents/:id/versions
 * @desc    Create new version of document (re-upload)
 * @access  Private - Requires 'upload' permission
 * @params  id - document ObjectId
 * @body    { fileUrl, size, mimeType, extension, changeDescription? }
 */
router.post('/:id/versions', authenticateUser, checkPermission('DOCUMENT', 'upload'), createVersion);

/**
 * @route   GET /api/documents/:id/versions
 * @desc    Get all versions of a document
 * @access  Private - Requires 'view' permission
 * @params  id - document ObjectId
 */
router.get('/:id/versions', authenticateUser, canView('DOCUMENT'), getAllVersions);

/**
 * @route   POST /api/documents/:id/versions/revert
 * @desc    Revert document to a specific version (creates new version)
 * @access  Private - Requires 'upload' permission
 * @params  id - document ObjectId
 * @body    { versionNumber: number }
 */
router.post('/:id/versions/revert', authenticateUser, checkPermission('DOCUMENT', 'upload'), revertToVersion);



/**
 * ============================================
 * 🏷️ TAG MANAGEMENT ROUTES
 * ============================================
 */

/**
 * @route   POST /api/documents/:id/tags
 * @desc    Add tags to document
 * @access  Private - Requires 'upload' permission
 * @params  id - document ObjectId
 * @body    { tags: string[] }
 */
router.post('/:id/tags', authenticateUser, checkPermission('DOCUMENT', 'upload'), addTags);

/**
 * @route   DELETE /api/documents/:id/tags
 * @desc    Remove tags from document
 * @access  Private - Requires 'upload' permission
 * @params  id - document ObjectId
 * @body    { tags: string[] }
 */
router.delete('/:id/tags', authenticateUser, checkPermission('DOCUMENT', 'upload'), removeTags);

/**
 * ============================================
 * 🔗 SHARING ROUTES
 * ============================================
 */

/**
 * @route   POST /api/documents/:id/share
 * @desc    Share document with users/groups
 * @access  Private - Requires 'share' permission
 * @params  id - document ObjectId
 * @body    { users: [{ userId, permissions }], groups: [{ groupId, permissions }] }
 */
router.post('/:id/share', authenticateUser, canShare('DOCUMENT'), shareDocument);

/**
 * ============================================
 * 📦 DOCUMENT OPERATIONS
 * ============================================
 */

/**
 * @route   POST /api/documents/:id/move
 * @desc    Move document to another folder/department
 * @access  Private - Requires 'delete' on source, 'upload' on destination
 * @params  id - document ObjectId
 * @body    { newParentId: string }
 */
router.post('/:id/move', authenticateUser, canDelete('DOCUMENT'), moveDocument);

/**
 * @route   POST /api/documents/:id/restore
 * @desc    Restore soft deleted document
 * @access  Private - Requires 'delete' permission
 * @params  id - document ObjectId
 */
router.post('/:id/restore', authenticateUser, canDelete('DOCUMENT'), restoreDocument);

/**
 * @route   DELETE /api/documents/:id
 * @desc    Soft delete document
 * @access  Private - Requires 'delete' permission
 * @params  id - document ObjectId
 */
router.delete('/:id', authenticateUser, canDelete('DOCUMENT'), softDeleteDocument);

/**
 * ============================================
 * 📄 DOCUMENT READ/UPDATE (Must be LAST)
 * ============================================
 */

/**
 * @route   GET /api/documents/:id
 * @desc    Get document by ID with full details
 * @access  Private - Requires 'view' permission
 * @params  id - document ObjectId
 */
router.get('/:id', authenticateUser, canView('DOCUMENT'), getDocumentById);

/**
 * @route   PUT /api/documents/:id
 * @desc    Update document metadata (name, description, tags)
 * @access  Private - Requires 'upload' permission
 * @params  id - document ObjectId
 * @body    { name?, description?, tags? }
 */
router.put('/:id', authenticateUser, checkPermission('DOCUMENT', 'upload'), updateDocument);

export default router;