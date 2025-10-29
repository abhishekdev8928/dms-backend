import express from 'express';
import {
  createDocumentMetadata,
  getDocuments,
  getDocumentById,
  downloadDocument,
  updateDocumentMetadata,
  createNewVersionMetadata,
  deleteDocument,
  updateDocumentPermissions
} from '../controller/documentController.js';
import {authenticateUser} from '../middleware/authMiddleware.js';
import {
  checkDocumentPermission,
  checkFolderUploadPermission,
  checkManagePermission,
  validateDocumentData,
  validatePermissionData
} from '../middleware/permissionMilddleware.js';
import { generatePresignedUrls } from '../controller/departmentController.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateUser);

// Create document metadata (after S3 upload)
// Requires folder upload permission + data validation
router.post(
  '/',
  validateDocumentData,
  checkFolderUploadPermission,
  createDocumentMetadata
);

// Get all documents with filters and pagination
// No explicit permission check - controller filters based on user access
router.get('/', getDocuments);

// Get single document by ID
// Requires view permission
router.get(
  '/:id',
  checkDocumentPermission('view'),
  getDocumentById
);

// Download document (logs the download)
// Requires download permission
router.get(
  '/:id/download',
  checkDocumentPermission('download'),
  downloadDocument
);

// Update document metadata (title, tags, metadata)
// Requires edit permission + data validation
router.put(
  '/:id',
  validateDocumentData,
  checkDocumentPermission('edit'),
  updateDocumentMetadata
);

// Create new version metadata (after S3 upload)
// Requires upload permission (same as edit) + data validation
router.post(
  '/:id/versions',
  validateDocumentData,
  checkDocumentPermission('upload'),
  createNewVersionMetadata
);

// Delete document (soft delete)
// Requires delete permission
router.delete(
  '/:id',
  checkDocumentPermission('delete'),
  deleteDocument
);

// Update document permissions
// Requires admin/owner permission + permission data validation
router.patch(
  '/:id/permissions',
  validatePermissionData,
  checkManagePermission,
  updateDocumentPermissions
);


router.post("/presigned-urls", authenticateUser, generatePresignedUrls);

export default router;