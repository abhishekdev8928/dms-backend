import { z } from 'zod';

// MongoDB ObjectId regex pattern
const objectIdPattern = /^[0-9a-fA-F]{24}$/;

// Move item(s) to trash
export const moveToTrashSchema = z.object({
  itemIds: z.array(
    z.string().regex(objectIdPattern, 'Invalid item ID')
  ).min(1, 'At least one item ID is required'),
  itemType: z.enum(['file', 'folder']).optional(),
});

// Restore item(s) from trash
export const restoreFromTrashSchema = z.object({
  itemIds: z.array(
    z.string().regex(objectIdPattern, 'Invalid item ID')
  ).min(1, 'At least one item ID is required'),
  restoreToFolderId: z.string()
    .regex(objectIdPattern, 'Invalid folder ID')
    .optional(),
});

// Permanently delete item(s) from trash
export const permanentDeleteSchema = z.object({
  itemIds: z.array(
    z.string().regex(objectIdPattern, 'Invalid item ID')
  ).min(1, 'At least one item ID is required'),
  confirmation: z.boolean().refine((val) => val === true, {
    message: 'Confirmation is required to permanently delete items'
  }).optional(),
});

// Get trash items with filters
export const getTrashItemsSchema = z.object({
  page: z.number().int().min(1).default(1).optional(),
  limit: z.number().int().min(1).max(100).default(20).optional(),
  type: z.enum(['file', 'folder', 'all']).default('all').optional(),
  sortBy: z.enum(['name', 'deletedAt', 'size', 'type']).default('deletedAt').optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc').optional(),
  search: z.string().max(100).optional(),
});

// Empty entire trash
export const emptyTrashSchema = z.object({
  confirmation: z.boolean().refine((val) => val === true, {
    message: 'Confirmation is required to empty trash'
  }),
  olderThanDays: z.number().int().min(0).max(365).optional(),
});

// Get single trash item details
export const getTrashItemSchema = z.object({
  itemId: z.string().regex(objectIdPattern, 'Invalid item ID'),
});

// Bulk restore with conflict handling
export const bulkRestoreSchema = z.object({
  itemIds: z.array(
    z.string().regex(objectIdPattern, 'Invalid item ID')
  ).min(1, 'At least one item ID is required'),
  conflictResolution: z.enum(['rename', 'replace', 'skip']).default('rename').optional(),
  targetFolderId: z.string().regex(objectIdPattern, 'Invalid folder ID').optional(),
});