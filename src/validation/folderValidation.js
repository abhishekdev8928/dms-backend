import { z } from 'zod';
import mongoose from 'mongoose';

// ===== REUSABLE VALIDATORS =====

const objectIdSchema = z.string()
  .trim()
  .refine((val) => mongoose.Types.ObjectId.isValid(val), {
    message: "Invalid ID format"
  });

const safeString = (min = 1, max = 500) => 
  z.string()
    .trim()
    .min(min)
    .max(max);

const hexColorSchema = z.string()
  .regex(/^#[0-9A-F]{6}$/i, "Invalid hex color format")
  .optional();

// ===== FOLDER SCHEMAS =====

/**
 * Create Folder
 */
export const createFolderSchema = z.object({
  name: safeString(1, 255),
  parentId: objectIdSchema,
  description: z.string().trim().max(500).optional().or(z.literal('')),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, "Invalid hex color format").optional().default('#3B82F6')
});

/**
 * Get Root Folders (params)
 */
export const getRootFoldersSchema = z.object({
  departmentId: objectIdSchema
});

/**
 * Get Root Folders Query
 */
export const getRootFoldersQuerySchema = z.object({
  includeDeleted: z.string().optional()
});

/**
 * Get Folder by ID (params)
 */
export const getFolderByIdSchema = z.object({
  id: objectIdSchema
});
/**
 * Get Child Folders Query
 */
export const getChildFoldersQuerySchema = z.object({
  includeDeleted: z.string().optional(),
  type: z.string().optional(), // ✅ Changed to string - accepts any type value
  userEmail: z.string().optional(),
});

/**
 * Get All Descendants Query
 */
export const getAllDescendantsQuerySchema = z.object({
  includeDeleted: z.string().optional(),
  type: z.enum(['folder', 'file']).optional()
});

/**
 * Update Folder
 */
export const updateFolderSchema = z.object({
  name: safeString(1, 255).optional(),
  description: safeString(0, 500).optional(),
  color: hexColorSchema
});

/**
 * Move Folder
 */
export const moveFolderSchema = z.object({
  newParentId: objectIdSchema
});

/**
 * Search Folders Query
 */
export const searchFoldersSchema = z.object({
  q: safeString(1, 100),
  departmentName: safeString(1, 100).optional()
});

/**
 * Get Folder by Path Query
 */
export const getFolderByPathSchema = z.object({
  path: safeString(1, 500)
});



export const shareFolderSchema = z.object({
  users: z
    .array(
      z.object({
        userId: z.string().min(1, "User ID is required"),
        permissions: z
          .array(
            z.enum(['view', 'download', 'upload', 'delete', 'share'])
          )
          .min(1, "At least one permission is required"),
      })
    )
    .optional()
    .default([]),
  
  groups: z
    .array(
      z.object({
        groupId: z.string().min(1, "Group ID is required"),
        permissions: z
          .array(
            z.enum(['view', 'download', 'upload', 'delete', 'share'])
          )
          .min(1, "At least one permission is required"),
      })
    )
    .optional()
    .default([]),
}).refine(
  (data) => data.users.length > 0 || data.groups.length > 0,
  {
    message: "At least one user or group must be specified",
  }
);