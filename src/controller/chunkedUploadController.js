// controller/chunkedUploadController.js

import s3Client from '../config/s3Client.js';
import { config } from '../config/config.js';
import {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import createHttpError from 'http-errors';
import { validateRequest } from '../utils/helper.js';
import {
  initiateChunkedUploadSchema,
  uploadChunkSchema,
  completeChunkedUploadSchema,
  abortChunkedUploadSchema
} from '../validation/documentValidation.js';

// ============================================
// 📊 CONSTANTS
// ============================================

const BUCKET_NAME = config.aws.bucketName;
const CHUNK_SIZE_THRESHOLD = config.chunkedUpload.threshold; // 100MB default
const MIN_CHUNK_SIZE = config.chunkedUpload.minChunkSize; // 5MB default
const MAX_CHUNK_SIZE = config.chunkedUpload.maxChunkSize; // 100MB default

// ============================================
// 🔍 HELPER: Check if file should use chunked upload
// ============================================

/**
 * Determine if file size requires chunked upload
 * @param {number} fileSize - File size in bytes
 * @returns {boolean}
 */
export const shouldUseChunkedUpload = (fileSize) => {
  return fileSize > CHUNK_SIZE_THRESHOLD;
};

/**
 * Calculate optimal chunk size and total parts
 * @param {number} fileSize - Total file size in bytes
 * @returns {{ chunkSize: number, totalParts: number }}
 */
export const calculateChunkDetails = (fileSize) => {
  // S3 allows max 10,000 parts
  const maxParts = 10000;
  
  let chunkSize = MIN_CHUNK_SIZE;
  let totalParts = Math.ceil(fileSize / chunkSize);
  
  // If we exceed max parts, increase chunk size
  if (totalParts > maxParts) {
    chunkSize = Math.ceil(fileSize / maxParts);
    totalParts = Math.ceil(fileSize / chunkSize);
  }
  
  // Cap chunk size at MAX_CHUNK_SIZE
  if (chunkSize > MAX_CHUNK_SIZE) {
    chunkSize = MAX_CHUNK_SIZE;
    totalParts = Math.ceil(fileSize / chunkSize);
  }
  
  return { chunkSize, totalParts };
};

// ============================================
// 🚀 INITIATE CHUNKED UPLOAD
// ============================================

/**
 * Initiate multipart upload on S3
 * @route POST /api/documents/chunked/initiate
 * @access Private - canCreate middleware (checks 'upload' on parentId)
 */
export const initiateChunkedUpload = async (req, res, next) => {
  try {
    // ✅ VALIDATE REQUEST
    const parsed = initiateChunkedUploadSchema.safeParse({ body: req.body });
    const validatedData = validateRequest(parsed);
    
    const { filename, mimeType, fileSize, parentId } = validatedData.body;
    const userId = req.user._id;

    // Check if file should use chunked upload
    if (!shouldUseChunkedUpload(fileSize)) {
      throw createHttpError(400, `File size (${fileSize} bytes) is too small for chunked upload. Use regular upload instead.`);
    }

    // Permission already checked by canCreate middleware
    // req.parentResource and req.parentType are available
    const departmentId = req.parentResource.departmentId || req.parentResource._id;

    // Generate S3 key with proper structure
    const timestamp = Date.now();
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `documents/${departmentId}/${parentId}/${timestamp}-${sanitizedFilename}`;

    // Calculate chunk details
    const { chunkSize, totalParts } = calculateChunkDetails(fileSize);

    // Create multipart upload on S3
    const command = new CreateMultipartUploadCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: mimeType,
      Metadata: {
        userId: userId.toString(),
        parentId: parentId.toString(),
        departmentId: departmentId.toString(),
        originalFilename: filename,
        fileSize: fileSize.toString(),
      },
    });

    const response = await s3Client.send(command);

    if (!response.UploadId) {
      throw createHttpError(500, 'Failed to initiate multipart upload');
    }

    res.status(200).json({
      success: true,
      data: {
        uploadId: response.UploadId,
        key: key,
        chunkSize: chunkSize,
        totalParts: totalParts,
        message: 'Chunked upload initiated successfully',
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// 📤 UPLOAD SINGLE CHUNK
// ============================================

/**
 * Upload a single part/chunk to S3
 * @route POST /api/documents/chunked/upload
 * @access Private
 */
export const uploadChunk = async (req, res, next) => {
  try {
    // ✅ VALIDATE REQUEST
    const parsed = uploadChunkSchema.safeParse({ body: req.body });
    const validatedData = validateRequest(parsed);
    
    const { uploadId, key, partNumber, body } = validatedData.body;

    // Body should be Buffer or base64 string
    let chunkData;
    if (Buffer.isBuffer(body)) {
      chunkData = body;
    } else if (typeof body === 'string') {
      // Assume base64 encoded
      chunkData = Buffer.from(body, 'base64');
    } else {
      throw createHttpError(400, 'Invalid chunk data format');
    }

    // Validate chunk size (min 5MB except last part)
    if (chunkData.length < MIN_CHUNK_SIZE && partNumber < 10000) {
      console.warn(`Warning: Chunk ${partNumber} is smaller than recommended 5MB`);
    }

    // Upload part to S3
    const command = new UploadPartCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
      Body: chunkData,
    });

    const response = await s3Client.send(command);

    if (!response.ETag) {
      throw createHttpError(500, 'Failed to upload chunk');
    }

    res.status(200).json({
      success: true,
      data: {
        ETag: response.ETag,
        PartNumber: partNumber,
        message: `Chunk ${partNumber} uploaded successfully`,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// 📤 GENERATE PRESIGNED URL FOR CHUNK UPLOAD (Alternative)
// ============================================

/**
 * Generate presigned URL for client-side chunk upload
 * This allows frontend to upload directly to S3 without sending data through server
 * @route POST /api/documents/chunked/generate-upload-url
 * @access Private
 */
export const generateChunkUploadUrl = async (req, res, next) => {
  try {
    const { uploadId, key, partNumber } = req.body;

    // Validate required fields
    if (!uploadId || !key || !partNumber) {
      throw createHttpError(400, 'Missing required fields: uploadId, key, partNumber');
    }

    // Validate part number
    const partNum = parseInt(partNumber);
    if (isNaN(partNum) || partNum < 1 || partNum > 10000) {
      throw createHttpError(400, 'Invalid part number');
    }

    // Create command for presigned URL
    const command = new UploadPartCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNum,
    });

    // Generate presigned URL (valid for 1 hour)
    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    res.status(200).json({
      success: true,
      data: {
        url: url,
        partNumber: partNum,
        expiresIn: 3600,
        message: 'Presigned URL generated for chunk upload',
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// ✅ COMPLETE CHUNKED UPLOAD
// ============================================

/**
 * Complete multipart upload and assemble all parts
 * @route POST /api/documents/chunked/complete
 * @access Private - canCreate middleware
 */
export const completeChunkedUpload = async (req, res, next) => {
  try {
    // ✅ VALIDATE REQUEST
    const parsed = completeChunkedUploadSchema.safeParse({ body: req.body });
    const validatedData = validateRequest(parsed);
    
    const { uploadId, key, parts, name, parentId, description, tags, mimeType, fileSize } = validatedData.body;
    const userId = req.user._id;

    // Sort parts by PartNumber
    const sortedParts = parts
      .map(part => ({
        ETag: part.ETag,
        PartNumber: parseInt(part.PartNumber),
      }))
      .sort((a, b) => a.PartNumber - b.PartNumber);

    // Complete multipart upload on S3
    const command = new CompleteMultipartUploadCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: sortedParts,
      },
    });

    const response = await s3Client.send(command);

    if (!response.Location) {
      throw createHttpError(500, 'Failed to complete multipart upload');
    }

    // Extract file metadata
    const extension = name.split('.').pop().toLowerCase();
    const finalMimeType = mimeType || 'application/octet-stream';
    
    // Determine fileType using document model helper
    const DocumentModel = (await import('../models/documentModel.js')).default;
    const fileType = DocumentModel.determineFileType(finalMimeType, extension);

    // Permission already checked by canCreate middleware
    const departmentId = req.parentResource.departmentId || req.parentResource._id;

    // Create document record in database
    const document = await DocumentModel.create({
      name: name.replace(`.${extension}`, ''), // Store without extension
      originalName: name,
      type: 'document',
      fileType: fileType,
      parentId: parentId,
      departmentId: departmentId,
      fileUrl: response.Location,
      mimeType: finalMimeType,
      extension: extension,
      size: fileSize || 0,
      description: description || '',
      tags: tags || [],
      createdBy: userId,
      updatedBy: userId,
    });

    res.status(201).json({
      success: true,
      data: {
        document: document,
        message: 'Chunked upload completed and document created successfully',
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// ❌ ABORT CHUNKED UPLOAD
// ============================================

/**
 * Abort multipart upload and cleanup S3 parts
 * @route POST /api/documents/chunked/abort
 * @access Private
 */
export const abortChunkedUpload = async (req, res, next) => {
  try {
    // ✅ VALIDATE REQUEST
    const parsed = abortChunkedUploadSchema.safeParse({ body: req.body });
    const validatedData = validateRequest(parsed);
    
    const { uploadId, key } = validatedData.body;

    // Abort multipart upload on S3
    const command = new AbortMultipartUploadCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
    });

    await s3Client.send(command);

    res.status(200).json({
      success: true,
      message: 'Chunked upload aborted and cleaned up successfully',
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// 📋 LIST UPLOADED PARTS (Optional - for resume)
// ============================================

/**
 * List already uploaded parts for resume functionality
 * @route GET /api/documents/chunked/parts
 * @access Private
 */
export const listUploadedParts = async (req, res, next) => {
  try {
    const { uploadId, key } = req.query;

    if (!uploadId || !key) {
      throw createHttpError(400, 'Missing required query params: uploadId, key');
    }

    const { ListPartsCommand } = await import('@aws-sdk/client-s3');
    
    const command = new ListPartsCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
    });

    const response = await s3Client.send(command);

    const parts = (response.Parts || []).map(part => ({
      PartNumber: part.PartNumber,
      ETag: part.ETag,
      Size: part.Size,
      LastModified: part.LastModified,
    }));

    res.status(200).json({
      success: true,
      data: {
        parts: parts,
        totalParts: parts.length,
        uploadId: uploadId,
        key: key,
      },
    });
  } catch (error) {
    next(error);
  }
};



export const chunkedUploadUtils = {
  shouldUseChunkedUpload,
  calculateChunkDetails,
  CHUNK_SIZE_THRESHOLD,
  MIN_CHUNK_SIZE,
  MAX_CHUNK_SIZE,
};