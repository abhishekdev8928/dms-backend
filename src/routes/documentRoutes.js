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
  findByTags,
  findByExtension,
  generateDownloadUrl,
  createVersion,
  getAllVersions,
  revertToVersion
} from '../controller/documentController.js';
import { authenticateUser } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * ============================================
 * DOCUMENT ROUTES
 * ============================================
 * Base URL: /api/documents
 * All routes require authentication
 */

/**
 * @route   POST /api/documents/generate-upload-urls
 * @desc    Generate presigned URLs for direct S3 upload
 * @access  Private
 * @body    { files: [{ filename: string, mimeType: string }], folderId?: string }
 */
router.post('/generate-upload-urls', authenticateUser, generatePresignedUrls);

/**
 * @route   GET /api/documents/search
 * @desc    Search documents by name/description
 * @access  Private
 * @query   q - search query (required)
 * @query   departmentId - filter by department (optional)
 * @query   limit - max results (optional, default: 20)
 */
router.get('/search', authenticateUser, searchDocuments);

/**
 * @route   GET /api/documents/tags
 * @desc    Find documents by tags
 * @access  Private
 * @query   tags - comma-separated tags (required)
 * @query   departmentId - filter by department (optional)
 */
router.get('/tags', authenticateUser, findByTags);

/**
 * @route   GET /api/documents/extension/:extension
 * @desc    Find documents by file extension
 * @access  Private
 * @params  extension - file extension (e.g., pdf, docx)
 * @query   departmentId - filter by department (optional)
 */
router.get('/extension/:extension', authenticateUser, findByExtension);

/**
 * @route   POST /api/documents
 * @desc    Create/Upload a new document
 * @access  Private
 * @body    { name, originalName, departmentId, folderId, fileUrl, mimeType, extension, size, description?, tags? }
 */
router.post('/', authenticateUser, createDocument);

/**
 * @route   GET /api/documents/:id
 * @desc    Get document by ID with details
 * @access  Private
 * @params  id - document ObjectId
 */
router.get('/:id', authenticateUser, getDocumentById);

/**
 * @route   PUT /api/documents/:id
 * @desc    Update document details (name, description, tags)
 * @access  Private
 * @params  id - document ObjectId
 * @body    { name?, description?, tags? }
 */
router.put('/:id', authenticateUser, updateDocument);

/**
 * @route   DELETE /api/documents/:id
 * @desc    Soft delete document
 * @access  Private
 * @params  id - document ObjectId
 */
router.delete('/:id', authenticateUser, softDeleteDocument);

/**
 * @route   POST /api/documents/:id/restore
 * @desc    Restore soft deleted document
 * @access  Private
 * @params  id - document ObjectId
 */
router.post('/:id/restore', authenticateUser, restoreDocument);

/**
 * @route   POST /api/documents/:id/move
 * @desc    Move document to another folder
 * @access  Private
 * @params  id - document ObjectId
 * @body    { newFolderId: string }
 */
router.post('/:id/move', authenticateUser, moveDocument);

/**
 * @route   POST /api/documents/:id/tags
 * @desc    Add tags to document
 * @access  Private
 * @params  id - document ObjectId
 * @body    { tags: string[] }
 */
router.post('/:id/tags', authenticateUser, addTags);

/**
 * @route   DELETE /api/documents/:id/tags
 * @desc    Remove tags from document
 * @access  Private
 * @params  id - document ObjectId
 * @body    { tags: string[] }
 */
router.delete('/:id/tags', authenticateUser, removeTags);

/**
 * @route   GET /api/documents/:id/download
 * @desc    Generate presigned download URL for document
 * @access  Private
 * @params  id - document ObjectId
 */
router.get('/:id/download', authenticateUser, generateDownloadUrl);

/**
 * @route   POST /api/documents/:id/versions
 * @desc    Create new version of document
 * @access  Private
 * @params  id - document ObjectId
 * @body    { fileUrl: string, size: number, changeDescription?: string }
 */
router.post('/:id/versions', authenticateUser, createVersion);

/**
 * @route   GET /api/documents/:id/versions
 * @desc    Get all versions of a document
 * @access  Private
 * @params  id - document ObjectId
 */
router.get('/:id/versions', authenticateUser, getAllVersions);

/**
 * @route   POST /api/documents/:id/revert
 * @desc    Revert a document to a specific version
 * @access  Private
 * @body    { versionNumber: number }
 */
router.post('/:id/revert', authenticateUser, revertToVersion);


export default router;