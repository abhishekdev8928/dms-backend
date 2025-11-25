/**
 * UPDATED DOCUMENT VALIDATION SCHEMA
 * Now uses constants from constant.js file instead of hardcoded values
 */

import { z } from 'zod';
import mongoose from 'mongoose';
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  validateFile,
  isExtensionBlocked,
  isMimeTypeBlocked
} from '../utils/constant.js';

// Custom validators
const objectIdValidator = z.string().refine(
  (val) => mongoose.Types.ObjectId.isValid(val),
  { message: 'Invalid ObjectId format' }
);

// ✅ Custom file extension validator using constants
const fileExtensionValidator = z.string()
  .min(1, 'File extension is required')
  .max(10, 'File extension too long')
  .regex(/^\.?[a-z0-9]+$/i, 'Invalid file extension format')
  .transform(val => {
    // Normalize: remove dot if present, convert to lowercase
    return val.startsWith('.') ? val.slice(1).toLowerCase() : val.toLowerCase();
  })
  .refine(
    (ext) => {
      const withDot = `.${ext}`;
      return ALLOWED_EXTENSIONS.includes(withDot);
    },
    (ext) => ({ 
      message: `File extension '.${ext}' is not allowed. Check /api/documents/allowed-formats for supported formats.` 
    })
  )
  .refine(
    (ext) => {
      const withDot = `.${ext}`;
      return !isExtensionBlocked(withDot);
    },
    (ext) => ({ 
      message: `File extension '.${ext}' is blocked for security reasons` 
    })
  );

// ✅ Custom MIME type validator using constants
const mimeTypeValidator = z.string()
  .min(1, 'MIME type is required')
  .transform(val => val.toLowerCase())
  .refine(
    (mimeType) => ALLOWED_MIME_TYPES.includes(mimeType),
    (mimeType) => ({ 
      message: `MIME type '${mimeType}' is not allowed. Check /api/documents/allowed-formats for supported formats.` 
    })
  )
  .refine(
    (mimeType) => !isMimeTypeBlocked(mimeType),
    (mimeType) => ({ 
      message: `MIME type '${mimeType}' is blocked for security reasons` 
    })
  );

// ===== DOCUMENT VALIDATION SCHEMAS =====

/**
 * Schema for generating presigned upload URLs
 */
export const generatePresignedUrlsSchema = z.object({
  body: z.object({
    files: z.array(
      z.object({
        filename: z.string()
          .min(1, 'Filename is required')
          .max(255, 'Filename cannot exceed 255 characters')
          .regex(/^[^<>:"/\\|?*\x00-\x1F]+$/, 'Filename contains invalid characters'),
        mimeType: mimeTypeValidator
      })
    ).min(1, 'At least one file is required')
      .max(10, 'Maximum 10 files allowed per request')
      .superRefine((files, ctx) => {
        // ✅ Validate each file using the comprehensive validateFile function
        files.forEach((file, index) => {
          const ext = file.filename.split('.').pop()?.toLowerCase() || '';
          const validation = validateFile(`.${ext}`, file.mimeType);
          
          if (!validation.valid) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `File "${file.filename}": ${validation.reason}`,
              path: [index]
            });
          }
        });
      })
  })
});

/**
 * Schema for creating a new document
 */
export const createDocumentSchema = z.object({
  body: z.object({
    name: z.string()
      .min(1, 'Document name is required')
      .max(255, 'Document name cannot exceed 255 characters')
      .trim(),
    originalName: z.string()
      .min(1, 'Original filename is required')
      .max(255, 'Original filename cannot exceed 255 characters'),
    parent_id: objectIdValidator,
    fileUrl: z.string()
      .min(1, 'File URL (S3 key) is required')
      .max(500, 'File URL too long'),
    mimeType: mimeTypeValidator,
    extension: fileExtensionValidator,
    size: z.number()
      .int('Size must be an integer')
      .positive('Size must be positive')
      .max(5 * 1024 * 1024 * 1024, 'File size cannot exceed 5GB'), // 5GB limit
    description: z.string()
      .max(1000, 'Description cannot exceed 1000 characters')
      .trim()
      .optional(),
    tags: z.array(
      z.string()
        .min(1, 'Tag cannot be empty')
        .max(50, 'Tag cannot exceed 50 characters')
        .trim()
        .toLowerCase()
    ).max(20, 'Maximum 20 tags allowed')
      .optional()
      .default([])
  }).superRefine((data, ctx) => {
    // ✅ Final validation: ensure extension and MIME type match
    const validation = validateFile(`.${data.extension}`, data.mimeType);
    
    if (!validation.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: validation.reason,
        path: ['extension']
      });
    }
  })
});

/**
 * Schema for getting document by ID
 */
export const getDocumentByIdSchema = z.object({
  params: z.object({
    id: objectIdValidator
  })
});

/**
 * Schema for getting documents by parent
 */
export const getDocumentsByParentSchema = z.object({
  params: z.object({
    parentId: objectIdValidator
  }),
  query: z.object({
    includeDeleted: z.enum(['true', 'false']).optional()
  }).optional()
});

/**
 * Schema for updating document
 */
export const updateDocumentSchema = z.object({
  params: z.object({
    id: objectIdValidator
  }),
  body: z.object({
    name: z.string()
      .min(1, 'Document name is required')
      .max(255, 'Document name cannot exceed 255 characters')
      .trim()
      .optional(),
    description: z.string()
      .max(1000, 'Description cannot exceed 1000 characters')
      .trim()
      .optional()
      .nullable(),
    tags: z.array(
      z.string()
        .min(1, 'Tag cannot be empty')
        .max(50, 'Tag cannot exceed 50 characters')
        .trim()
        .toLowerCase()
    ).max(20, 'Maximum 20 tags allowed')
      .optional()
  }).refine(
    data => Object.keys(data).length > 0,
    { message: 'At least one field must be provided for update' }
  )
});

/**
 * Schema for moving document
 */
export const moveDocumentSchema = z.object({
  params: z.object({
    id: objectIdValidator
  }),
  body: z.object({
    newParentId: objectIdValidator
  })
});

/**
 * Schema for document operations (delete, restore)
 */
export const documentOperationSchema = z.object({
  params: z.object({
    id: objectIdValidator
  })
});

/**
 * Schema for searching documents
 */
export const searchDocumentsSchema = z.object({
  query: z.object({
    q: z.string()
      .min(1, 'Search query is required')
      .max(100, 'Search query too long')
      .trim(),
    departmentId: objectIdValidator.optional(),
    limit: z.string()
      .regex(/^\d+$/, 'Limit must be a number')
      .transform(Number)
      .refine(val => val > 0 && val <= 100, 'Limit must be between 1 and 100')
      .optional()
  })
});

/**
 * Schema for adding/removing tags
 */
export const tagsOperationSchema = z.object({
  params: z.object({
    id: objectIdValidator
  }),
  body: z.object({
    tags: z.array(
      z.string()
        .min(1, 'Tag cannot be empty')
        .max(50, 'Tag cannot exceed 50 characters')
        .trim()
        .toLowerCase()
    ).min(1, 'At least one tag is required')
      .max(20, 'Maximum 20 tags allowed')
  })
});

/**
 * Schema for finding documents by tags
 */
export const findByTagsSchema = z.object({
  query: z.object({
    tags: z.string()
      .min(1, 'Tags query is required')
      .max(500, 'Tags query too long')
      .transform(val => val.split(',').map(t => t.trim()).filter(t => t.length > 0))
      .refine(arr => arr.length > 0, 'At least one tag is required')
      .refine(arr => arr.length <= 20, 'Maximum 20 tags allowed')
  })
});

/**
 * Schema for finding documents by extension
 */
export const findByExtensionSchema = z.object({
  params: z.object({
    ext: fileExtensionValidator
  })
});

/**
 * Schema for department stats
 */
export const getDepartmentStatsSchema = z.object({
  params: z.object({
    departmentId: objectIdValidator
  })
});

/**
 * Schema for recent documents
 */
export const getRecentDocumentsSchema = z.object({
  params: z.object({
    departmentId: objectIdValidator
  }),
  query: z.object({
    limit: z.string()
      .regex(/^\d+$/, 'Limit must be a number')
      .transform(Number)
      .refine(val => val > 0 && val <= 100, 'Limit must be between 1 and 100')
      .optional()
  }).optional()
});

// ===== DOCUMENT VERSION VALIDATION SCHEMAS =====

/**
 * Schema for creating document version
 */
export const createVersionSchema = z.object({
  params: z.object({
    id: objectIdValidator
  }),
  body: z.object({
    // File storage information
    fileUrl: z.string()
      .min(1, 'File URL (S3 key) is required')
      .max(500, 'File URL too long'),
    
    size: z.number()
      .int('Size must be an integer')
      .positive('Size must be positive')
      .max(5 * 1024 * 1024 * 1024, 'File size cannot exceed 5GB'),
    
    mimeType: mimeTypeValidator,
    extension: fileExtensionValidator,
    
    // Optional: Override document name for this version
    name: z.string()
      .min(1, 'Document name is required')
      .max(255, 'Document name cannot exceed 255 characters')
      .trim()
      .optional(),
    
    // Optional: Override original filename for this version
    originalName: z.string()
      .min(1, 'Original filename is required')
      .max(255, 'Original filename cannot exceed 255 characters')
      .optional(),
    
    // Version metadata
    changeDescription: z.string()
      .max(500, 'Change description cannot exceed 500 characters')
      .trim()
      .optional(),
    
    // Optional file integrity hash
    fileHash: z.string()
      .min(1, 'File hash cannot be empty')
      .max(128, 'File hash too long')
      .trim()
      .optional()
  }).superRefine((data, ctx) => {
    // ✅ Validate extension and MIME type compatibility
    const validation = validateFile(`.${data.extension}`, data.mimeType);
    
    if (!validation.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: validation.reason,
        path: ['extension']
      });
    }
  })
});

/**
 * Schema for getting all versions with options
 */
export const getAllVersionsSchema = z.object({
  params: z.object({
    id: objectIdValidator
  }),
  query: z.object({
    sort: z.enum(['asc', 'desc']).optional().default('desc'),
    limit: z.string()
      .regex(/^\d+$/, 'Limit must be a number')
      .transform(Number)
      .refine(val => val > 0 && val <= 100, 'Limit must be between 1 and 100')
      .optional(),
    populate: z.enum(['true', 'false'])
      .transform(val => val === 'true')
      .optional()
  }).optional()
});

/**
 * Schema for getting a specific version by version number
 */
export const getVersionByNumberSchema = z.object({
  params: z.object({
    id: objectIdValidator,
    versionNumber: z.string()
      .regex(/^\d+$/, 'Version number must be a number')
      .transform(Number)
      .refine(val => val >= 1, 'Version number must be at least 1')
  })
});

/**
 * Schema for reverting to a specific version
 */
export const revertToVersionSchema = z.object({
  params: z.object({
    id: objectIdValidator
  }),
  body: z.object({
    versionNumber: z.number()
      .int('Version number must be an integer')
      .positive('Version number must be positive')
      .min(1, 'Version number must be at least 1')
  })
});

/**
 * Schema for deleting old versions
 */
export const deleteOldVersionsSchema = z.object({
  params: z.object({
    id: objectIdValidator
  }),
  body: z.object({
    keepCount: z.number()
      .int('Keep count must be an integer')
      .positive('Keep count must be positive')
      .min(1, 'Must keep at least 1 version')
      .max(100, 'Keep count cannot exceed 100')
      .optional()
      .default(5)
  })
});