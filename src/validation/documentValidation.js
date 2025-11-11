import { z } from 'zod';
import mongoose from 'mongoose';

// Allowed file formats
export const ALLOWED_EXTENSIONS = [
  "pdf",
  "docx",
  "xlsx",
  "jpg",
  "jpeg",
  "png",
  "zip",
];

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "application/zip",
  "application/x-zip-compressed",
];

// Custom validators
const objectIdValidator = z.string().refine(
  (val) => mongoose.Types.ObjectId.isValid(val),
  { message: 'Invalid ObjectId format' }
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
          .regex(/^[^<>:"/\\|?*\x00-\x1F]+$/, 'Filename contains invalid characters')
          .refine(
            (filename) => {
              const ext = filename.split('.').pop()?.toLowerCase();
              return ext && ALLOWED_EXTENSIONS.includes(ext);
            },
            { message: `File extension must be one of: ${ALLOWED_EXTENSIONS.join(', ')}` }
          ),
        mimeType: z.string()
          .min(1, 'MIME type is required')
          .refine(
            (mimeType) => ALLOWED_MIME_TYPES.includes(mimeType),
            { message: `MIME type must be one of: ${ALLOWED_MIME_TYPES.join(', ')}` }
          )
      })
    ).min(1, 'At least one file is required')
      .max(10, 'Maximum 10 files allowed per request')
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
    mimeType: z.string()
      .min(1, 'MIME type is required')
      .refine(
        (mimeType) => ALLOWED_MIME_TYPES.includes(mimeType),
        { message: `MIME type must be one of: ${ALLOWED_MIME_TYPES.join(', ')}` }
      ),
    extension: z.string()
      .min(1, 'File extension is required')
      .max(10, 'File extension too long')
      .regex(/^[a-z0-9]+$/i, 'Invalid file extension format')
      .transform(val => val.toLowerCase())
      .refine(
        (ext) => ALLOWED_EXTENSIONS.includes(ext),
        { message: `File extension must be one of: ${ALLOWED_EXTENSIONS.join(', ')}` }
      ),
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
    ext: z.string()
      .min(1, 'File extension is required')
      .max(10, 'File extension too long')
      .regex(/^[a-z0-9]+$/i, 'Invalid file extension format')
      .transform(val => val.toLowerCase())
      .refine(
        (ext) => ALLOWED_EXTENSIONS.includes(ext),
        { message: `File extension must be one of: ${ALLOWED_EXTENSIONS.join(', ')}` }
      )
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
    
    mimeType: z.string()
      .min(1, 'MIME type is required')
      .refine(
        (mimeType) => ALLOWED_MIME_TYPES.includes(mimeType),
        { message: `MIME type must be one of: ${ALLOWED_MIME_TYPES.join(', ')}` }
      ),
    
    extension: z.string()
      .min(1, 'File extension is required')
      .max(10, 'File extension too long')
      .regex(/^[a-z0-9]+$/i, 'Invalid file extension format')
      .transform(val => val.toLowerCase())
      .refine(
        (ext) => ALLOWED_EXTENSIONS.includes(ext),
        { message: `File extension must be one of: ${ALLOWED_EXTENSIONS.join(', ')}` }
      ),
    
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