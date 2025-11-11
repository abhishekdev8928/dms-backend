import { z } from 'zod';
import mongoose from 'mongoose';

// ===== SIMPLE VALIDATORS =====

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

// ===== DEPARTMENT SCHEMAS =====

export const createDepartmentSchema = z.object({
  name: safeString(2, 100),
  description: safeString(0, 500).optional()
});

export const getAllDepartmentsSchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  order: z.string().optional(),
  activeOnly: z.string().optional()
});

export const getDepartmentByIdSchema = z.object({
  id: objectIdSchema
});

export const updateDepartmentSchema = z.object({
  name: safeString(2, 100).optional(),
  description: safeString(0, 500).optional(),
  isActive: z.boolean().optional()
});

export const deleteDepartmentSchema = z.object({
  id: objectIdSchema
});

export const getDepartmentByNameSchema = z.object({
  name: safeString(2, 100)
});

export const getDepartmentHierarchySchema = z.object({
  depth: z.string().optional()
});