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
 * Calculate optimal chunk size and total parts dynamically
 * @param {number} fileSize - Total file size in bytes
 * @returns {{ chunkSize: number, totalParts: number }}
 */
export const calculateChunkDetails = (fileSize) => {
  const MIN_CHUNK_SIZE = config.chunkedUpload.minChunkSize;
  const MAX_CHUNK_SIZE = config.chunkedUpload.maxChunkSize;
  const MAX_PARTS = 10000;

  // Step 1: Target ~40 chunks by default (can adjust based on threshold if needed)
  let targetChunkSize = Math.ceil(fileSize / 40);

  // Step 2: Clamp chunk size between min and max
  let chunkSize = Math.max(MIN_CHUNK_SIZE, Math.min(targetChunkSize, MAX_CHUNK_SIZE));

  // Step 3: Calculate total parts
  let totalParts = Math.ceil(fileSize / chunkSize);

  // Step 4: Ensure we don’t exceed S3 max parts
  if (totalParts > MAX_PARTS) {
    chunkSize = Math.ceil(fileSize / MAX_PARTS);
    totalParts = Math.ceil(fileSize / chunkSize);
  }

  return { chunkSize, totalParts };
};

// ============================================
// 🚀 INITIATE CHUNKED UPLOAD (FIXED WITH PRESIGNED URLS)
// ============================================

/**
 * Initiate multipart upload on S3 and generate presigned URLs
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

    // ✨ GENERATE PRESIGNED URLS FOR ALL PARTS
    console.log(`Generating ${totalParts} presigned URLs...`);
    const presignedUrls = [];
    
    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      const uploadCommand = new UploadPartCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        UploadId: response.UploadId,
        PartNumber: partNumber,
      });

      const url = await getSignedUrl(s3Client, uploadCommand, { expiresIn: 3600 }); // 1 hour
      
      presignedUrls.push({
        partNumber,
        url
      });
    }

    console.log(`✅ Generated ${presignedUrls.length} presigned URLs successfully`);

    res.status(200).json({
      success: true,
      data: {
        uploadId: response.UploadId,
        key: key,
        chunkSize: chunkSize,
        totalParts: totalParts,
        presignedUrls: presignedUrls, // ✨ Client uploads directly to S3
        expiresIn: 3600, // URLs valid for 1 hour
        message: 'Chunked upload initiated with presigned URLs',
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

    console.log(`Completing upload with ${sortedParts.length} parts...`);

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

    console.log(`✅ Upload completed: ${response.Location}`);

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
    console.error('Error completing chunked upload:', error);
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

    console.log(`Aborting upload: ${uploadId}`);

    // Abort multipart upload on S3
    const command = new AbortMultipartUploadCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
    });

    await s3Client.send(command);

    console.log(`✅ Upload aborted successfully`);

    res.status(200).json({
      success: true,
      message: 'Chunked upload aborted and cleaned up successfully',
    });
  } catch (error) {
    console.error('Error aborting chunked upload:', error);
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

// ============================================
// 📤 EXPORTS
// ============================================

export const chunkedUploadUtils = {
  shouldUseChunkedUpload,
  calculateChunkDetails,
  CHUNK_SIZE_THRESHOLD,
  MIN_CHUNK_SIZE,
  MAX_CHUNK_SIZE,
};