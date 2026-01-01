// validation/shareValidation.js

import { z } from "zod";

// ✅ ObjectId validator
export const objectIdValidator = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid ObjectId format");

// ✅ Resource type validator
const resourceTypeValidator = z.enum(["folder", "document", "FOLDER", "DOCUMENT"], {
  errorMap: () => ({
    message: "resourceType must be either 'folder' or 'document'",
  }),
});

// ✅ Permission enum schema
const permissionsSchema = z
  .array(
    z.enum(["view", "download", "upload", "delete", "share"], {
      errorMap: () => ({
        message: "Invalid permission. Allowed: view, download, upload, delete, share",
      }),
    })
  )
  .min(1, "At least one permission is required")
  .max(5, "Maximum 5 permissions allowed")
  .refine((permissions) => {
    // Remove duplicates and check
    const unique = [...new Set(permissions)];
    return unique.length === permissions.length;
  }, {
    message: "Duplicate permissions are not allowed",
  });

// ✅ User share object schema
const userShareSchema = z.object({
  userId: objectIdValidator,
  permissions: permissionsSchema,
});

// ✅ Group share object schema
const groupShareSchema = z.object({
  groupId: objectIdValidator,
  permissions: permissionsSchema,
});

// ============================================================
// GET RESOURCE ACCESS DETAILS
// ============================================================
/**
 * @route GET /api/v1/share/:resourceType/:resourceId
 * @desc Get complete access details for a resource
 */
export const getResourceAccessDetailsSchema = z.object({
  params: z.object({
    resourceType: resourceTypeValidator,
    resourceId: objectIdValidator,
  }),
});

// ============================================================
// SHARE RESOURCE (ADD/UPDATE ACCESS)
// ============================================================
/**
 * @route POST /api/v1/share/:resourceType/:resourceId
 * @desc Share resource with users and/or groups
 */
export const shareResourceSchema = z.object({
  params: z.object({
    resourceType: resourceTypeValidator,
    resourceId: objectIdValidator,
  }),
  body: z
    .object({
      users: z
        .array(userShareSchema)
        .max(50, "Maximum 50 users can be shared at once")
        .optional()
        .default([]),
      groups: z
        .array(groupShareSchema)
        .max(20, "Maximum 20 groups can be shared at once")
        .optional()
        .default([]),
    })
    .refine(
      (data) => data.users.length > 0 || data.groups.length > 0,
      {
        message: "At least one user or group must be specified for sharing",
        path: ["body"],
      }
    ),
});

// ============================================================
// UPDATE USER PERMISSIONS
// ============================================================
/**
 * @route PATCH /api/v1/share/:resourceType/:resourceId/user/:userId
 * @desc Update permissions for a specific user
 */
export const updateUserPermissionsSchema = z.object({
  params: z.object({
    resourceType: resourceTypeValidator,
    resourceId: objectIdValidator,
    userId: objectIdValidator,
  }),
  body: z.object({
    permissions: permissionsSchema,
  }),
});

// ============================================================
// UPDATE GROUP PERMISSIONS
// ============================================================
/**
 * @route PATCH /api/v1/share/:resourceType/:resourceId/group/:groupId
 * @desc Update permissions for a specific group
 */
export const updateGroupPermissionsSchema = z.object({
  params: z.object({
    resourceType: resourceTypeValidator,
    resourceId: objectIdValidator,
    groupId: objectIdValidator,
  }),
  body: z.object({
    permissions: permissionsSchema,
  }),
});

// ============================================================
// REMOVE USER ACCESS
// ============================================================
/**
 * @route DELETE /api/v1/share/:resourceType/:resourceId/user/:userId
 * @desc Remove access for a specific user
 */
export const removeUserAccessSchema = z.object({
  params: z.object({
    resourceType: resourceTypeValidator,
    resourceId: objectIdValidator,
    userId: objectIdValidator,
  }),
});

// ============================================================
// REMOVE GROUP ACCESS
// ============================================================
/**
 * @route DELETE /api/v1/share/:resourceType/:resourceId/group/:groupId
 * @desc Remove access for a specific group
 */
export const removeGroupAccessSchema = z.object({
  params: z.object({
    resourceType: resourceTypeValidator,
    resourceId: objectIdValidator,
    groupId: objectIdValidator,
  }),
});

// ============================================================
// BULK REMOVE ACCESS
// ============================================================
/**
 * @route DELETE /api/v1/share/:resourceType/:resourceId/bulk
 * @desc Remove access for multiple users and/or groups at once
 */
export const bulkRemoveAccessSchema = z.object({
  params: z.object({
    resourceType: resourceTypeValidator,
    resourceId: objectIdValidator,
  }),
  body: z
    .object({
      users: z
        .array(objectIdValidator)
        .max(50, "Maximum 50 users can be removed at once")
        .optional()
        .default([]),
      groups: z
        .array(objectIdValidator)
        .max(20, "Maximum 20 groups can be removed at once")
        .optional()
        .default([]),
    })
    .refine(
      (data) => data.users.length > 0 || data.groups.length > 0,
      {
        message: "At least one user or group must be specified for removal",
        path: ["body"],
      }
    ),
});


// Alias for backwards compatibility
export const getAccessSchema = getResourceAccessDetailsSchema;