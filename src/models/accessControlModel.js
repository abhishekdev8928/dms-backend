import mongoose from "mongoose";

const accessControlSchema = new mongoose.Schema(
  {
    resourceType: {
      type: String,
      enum: ["FOLDER", "DOCUMENT"],
      required: true,
      uppercase: true,
      index: true,
    },
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    subjectType: {
      type: String,
      enum: ["USER", "GROUP"],
      required: true,
      uppercase: true,
      index: true,
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    permissions: [
      {
        type: String,
        enum: ["view", "download", "upload", "delete", "share"],
        lowercase: true,
      },
    ],
    grantedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// ============================================
// INDEXES
// ============================================
accessControlSchema.index({ resourceType: 1, resourceId: 1 });
accessControlSchema.index({ subjectType: 1, subjectId: 1 });
accessControlSchema.index(
  {
    resourceType: 1,
    resourceId: 1,
    subjectType: 1,
    subjectId: 1,
  },
  { unique: true }
);

// ============================================
// STATIC METHODS
// ============================================

/**
 * Check if user has specific permission on resource
 */
accessControlSchema.statics.userHasPermission = async function (
  resourceType,
  resourceId,
  userId,
  permission,
  userGroupIds = []
) {
  const acls = await this.find({
    resourceType: resourceType.toUpperCase(),
    resourceId,
    $or: [
      { subjectType: "USER", subjectId: userId },
      { subjectType: "GROUP", subjectId: { $in: userGroupIds } },
    ],
  });

  return acls.some((acl) => acl.permissions.includes(permission.toLowerCase()));
};

/**
 * Get merged permissions for user (direct + group)
 */
accessControlSchema.statics.getUserPermissions = async function (
  resourceType,
  resourceId,
  userId,
  userGroupIds = []
) {
  const acls = await this.find({
    resourceType: resourceType.toUpperCase(),
    resourceId,
    $or: [
      { subjectType: "USER", subjectId: userId },
      { subjectType: "GROUP", subjectId: { $in: userGroupIds } },
    ],
  });

  const allPermissions = new Set();
  acls.forEach((acl) => {
    acl.permissions.forEach((perm) => allPermissions.add(perm));
  });

  return Array.from(allPermissions);
};

/**
 * Grant permission to subject
 */
accessControlSchema.statics.grantToSubject = async function (
  resourceType,
  resourceId,
  subjectType,
  subjectId,
  permissions,
  grantedBy
) {
  return this.findOneAndUpdate(
    {
      resourceType: resourceType.toUpperCase(),
      resourceId,
      subjectType: subjectType.toUpperCase(),
      subjectId,
    },
    {
      permissions: Array.isArray(permissions) ? permissions : [permissions],
      grantedBy,
    },
    {
      upsert: true,
      new: true,
    }
  );
};

/**
 * Revoke access from subject
 */
accessControlSchema.statics.revokeFromSubject = async function (
  resourceType,
  resourceId,
  subjectType,
  subjectId
) {
  return this.deleteOne({
    resourceType: resourceType.toUpperCase(),
    resourceId,
    subjectType: subjectType.toUpperCase(),
    subjectId,
  });
};

/**
 * Get all ACL entries for a resource
 */
accessControlSchema.statics.findByResource = function (
  resourceType,
  resourceId
) {
  return this.find({
    resourceType: resourceType.toUpperCase(),
    resourceId,
  }).populate("subjectId grantedBy");
};
accessControlSchema.statics.hasAnyACL = async function (resourceType, resourceId) {
  const count = await this.countDocuments({
    resourceType: resourceType.toUpperCase(),
    resourceId,
  });
  return count > 0;
};
const AccessControlModel =
  mongoose.models.AccessControl ||
  mongoose.model("AccessControl", accessControlSchema);

export default AccessControlModel;
