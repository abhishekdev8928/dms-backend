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
  parent_id: objectIdSchema,
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
  type: z.enum(['folder', 'documents']).optional(), // Changed 'file' to 'documents' to match your data
  extension: z.string().optional(), // ✅ ADDED
  userEmail: z.string().email().optional(), // ✅ ADDED with email validation
  search: z.string().optional(), // ✅ ADDED
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