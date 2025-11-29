import mongoose from "mongoose";
const ACLSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["file", "folder"],
      required: true,
    },
    visibility: {
      type: String,
      enum: ["public", "private", "restricted"],
      default: "private",
      required: true,
    },
    users: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        permissions: [
          {
            type: String,
            enum: ["view", "upload", "download", "delete", "change_visibility"],
            required: true,
          },
        ],
        _id: false,
      },
    ],
    roles: [
      {
        roleId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Role",
          required: true,
        },
        permissions: [
          {
            type: String,
            enum: ["view", "upload", "download", "delete", "change_visibility"],
          },
        ],
        _id: false,
      },
    ],
    memberBanks: [
      {
        memberBankId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "MemberBank",
          required: true,
        },
        permissions: [
          {
            type: String,
            enum: ["view", "upload", "download", "delete", "change_visibility"],
          },
        ],
        _id: false,
      },
    ],
    inheritsFromParent: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
ACLSchema.index({ type: 1 });
ACLSchema.index({ visibility: 1 });
ACLSchema.index({ "users.userId": 1 });
ACLSchema.index({ "roles.roleId": 1 });
ACLSchema.index({ "memberBanks.memberBankId": 1 });

// Methods

// Check permission for user
ACLSchema.methods.hasPermission = function (userId, requiredPermission) {
  const userGrant = this.users.find(
    (u) => u.userId.toString() === userId.toString()
  );
  if (userGrant) {
    return userGrant.permissions.includes(requiredPermission);
  }
  return false;
};

// Add user
ACLSchema.methods.addUser = function (userId, permissions) {
  const existingIndex = this.users.findIndex(
    (u) => u.userId.toString() === userId.toString()
  );

  if (existingIndex !== -1) {
    this.users[existingIndex].permissions = permissions;
  } else {
    this.users.push({ userId, permissions });
  }

  this.updatedAt = Date.now();
  return this.save();
};

// Remove user
ACLSchema.methods.removeUser = function (userId) {
  this.users = this.users.filter(
    (u) => u.userId.toString() !== userId.toString()
  );
  this.updatedAt = Date.now();
  return this.save();
};

// Update user permissions
ACLSchema.methods.updateUserPermissions = function (userId, permissions) {
  const userGrant = this.users.find(
    (u) => u.userId.toString() === userId.toString()
  );

  if (userGrant) {
    userGrant.permissions = permissions;
    this.updatedAt = Date.now();
    return this.save();
  }

  throw new Error("User not found in ACL");
};

// Get users with specific permission
ACLSchema.methods.getUsersWithPermission = function (permission) {
  return this.users
    .filter((u) => u.permissions.includes(permission))
    .map((u) => u.userId);
};

// STATIC METHODS

// Find ACL document by resourceId
ACLSchema.statics.findByResourceId = function (resourceId, type) {
  return this.findOne({ _id: resourceId, type });
};

// Create Private ACL
ACLSchema.statics.createPrivate = function (resourceId, type, creatorId) {
  return this.create({
    _id: resourceId,
    type,
    visibility: "private",
    users: [
      {
        userId: creatorId,
        permissions: [
          "view",
          "upload",
          "download",
          "delete",
          "change_visibility",
        ],
      },
    ],
    inheritsFromParent: false,
    createdBy: creatorId,
  });
};

// Create Public ACL
ACLSchema.statics.createPublic = function (resourceId, type, creatorId) {
  return this.create({
    _id: resourceId,
    type,
    visibility: "public",
    users: [],
    inheritsFromParent: false,
    createdBy: creatorId,
  });
};

const ACLModel = mongoose.model("ACL", ACLSchema);

export default ACLModel;
