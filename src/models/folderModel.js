import mongoose from "mongoose";
import DocumentModel from "./documentModel.js";

const folderSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Folder name is required"],
      trim: true,
      maxlength: [255, "Folder name cannot exceed 255 characters"],
    },
    type: {
      type: String,
      default: "folder",
      enum: ["folder"],
      immutable: true,
    },

    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, "Parent ID is required"],
      index: true,
    },

    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: [true, "Department ID is required"],
      index: true,
    },

    path: {
      type: String,
      index: true,
    },

    description: {
      type: String,
      trim: true,
      maxlength: [500, "Description cannot exceed 500 characters"],
    },
    color: {
      type: String,
      default: "#3B82F6",
      match: [/^#[0-9A-F]{6}$/i, "Please provide a valid hex color code"],
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Creator information is required"],
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ✅ Updated indexes with new field names
folderSchema.index({ parentId: 1 });
folderSchema.index({ path: 1 });
folderSchema.index({ isDeleted: 1 });
folderSchema.index({ departmentId: 1 });
folderSchema.index({ aclId: 1 });
folderSchema.index({ parentId: 1, isDeleted: 1 });
folderSchema.index({ departmentId: 1, isDeleted: 1 });
folderSchema.index({ name: 1, parentId: 1 }, { unique: true });

// 🔥 UPDATED: Build path method with new field names
folderSchema.methods.buildPath = async function () {
  const FolderModel = mongoose.model("Folder");
  const DepartmentModel = mongoose.model("Department");

  let parent = await FolderModel.findById(this.parentId);
  if (!parent) parent = await DepartmentModel.findById(this.parentId);
  if (!parent) throw new Error("Parent not found");

  this.path = `${parent.path}/${this.name}`;
  return this.path;
};

folderSchema.methods.getChildren = async function (includeDeleted = false) {
  const FolderModel = mongoose.model("Folder");
  const DocumentModel = mongoose.model("Document");

  const query = { parentId: this._id };
  if (!includeDeleted) query.isDeleted = false;

  const [folders, documents] = await Promise.all([
    FolderModel.find(query)
      .populate('departmentId', 'name ownerType')  // ← Add this
      .populate('createdBy', 'email username')         // ← Add this
      .sort({ name: 1 })
      .lean(),
    DocumentModel.find(query)
      .populate('departmentId', 'name ownerType')  // ← Add this
      .populate('createdBy', 'email username')         // ← Add this
      .sort({ name: 1 })
      .lean(),
  ]);

  return [...folders, ...documents].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
};




// 🔥 UPDATED: Get all descendants
folderSchema.methods.getAllDescendants = async function (
  includeDeleted = false
) {
  const FolderModel = mongoose.model("Folder");
  const DocumentModel = mongoose.model("Document");

  const query = {
    path: new RegExp(`^${this.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`),
  };
  if (!includeDeleted) {
    query.isDeleted = false;
  }

  const [folders, documents] = await Promise.all([
    FolderModel.find(query).sort({ path: 1 }),
    DocumentModel.find(query).sort({ path: 1 }),
  ]);

  return [...folders, ...documents];
};

folderSchema.methods.getBreadcrumbs = function () {
  const parts = this.path.split("/").filter((part) => part.length > 0);
  return parts;
};

folderSchema.methods.getDepartment = async function () {
  const DepartmentModel = mongoose.model("Department");
  return DepartmentModel.findById(this.departmentId);
};

// 🔥 UPDATED: Move to method with new field names
folderSchema.methods.moveTo = async function (newParentId, session = null) {
  const FolderModel = mongoose.model("Folder");
  const DepartmentModel = mongoose.model("Department");

  let newParent = await FolderModel.findById(newParentId).session(session);

  if (!newParent) {
    newParent = await DepartmentModel.findById(newParentId).session(session);
  }

  if (!newParent) {
    throw new Error("New parent not found");
  }

  if (newParent.path && newParent.path.startsWith(this.path + "/")) {
    throw new Error("Cannot move folder to its own descendant");
  }

  const oldPath = this.path;

  // Update parentId and potentially departmentId
  this.parentId = newParentId;

  // If moving to a different department, update departmentId
  if (
    newParent.departmentId &&
    newParent.departmentId.toString() !== this.departmentId.toString()
  ) {
    this.departmentId = newParent.departmentId;
  }

  await this.buildPath();
  const newPath = this.path;

  await this.save({ session });

  await this.updateDescendantsPaths(oldPath, newPath, session);

  return this;
};

folderSchema.methods.updateDescendantsPaths = async function (
  oldPath,
  newPath,
  session = null
) {
  const FolderModel = mongoose.model("Folder");
  const DocumentModel = mongoose.model("Document");

  const escapedOldPath = oldPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const folders = await FolderModel.find({
    path: new RegExp(`^${escapedOldPath}/`),
  }).session(session);

  const documents = await DocumentModel.find({
    path: new RegExp(`^${escapedOldPath}/`),
  }).session(session);

  for (const folder of folders) {
    folder.path = folder.path.replace(oldPath, newPath);
    // Update departmentId if moving cross-department
    folder.departmentId = this.departmentId;
    await folder.save({ session });
  }

  for (const document of documents) {
    document.path = document.path.replace(oldPath, newPath);
    // Update departmentId if moving cross-department
    document.departmentId = this.departmentId;
    await document.save({ session });
  }
};

folderSchema.methods.softDelete = async function (session = null) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  await this.save({ session });

  const FolderModel = mongoose.model("Folder");
  const DocumentModel = mongoose.model("Document");

  const escapedPath = this.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  await Promise.all([
    FolderModel.updateMany(
      { path: new RegExp(`^${escapedPath}/`) },
      { isDeleted: true, deletedAt: new Date() }
    ).session(session),
    DocumentModel.updateMany(
      { path: new RegExp(`^${escapedPath}/`) },
      { isDeleted: true, deletedAt: new Date() }
    ).session(session),
  ]);

  return this;
};

folderSchema.methods.restore = async function (session = null) {
  this.isDeleted = false;
  this.deletedAt = null;
  await this.save({ session });

  return this;
};

// 🔥 UPDATED: Static methods with new field names
folderSchema.statics.getRootFoldersForDepartment = function (
  departmentId,
  includeDeleted = false
) {
  const query = {
    parentId: departmentId,
  };
  if (!includeDeleted) {
    query.isDeleted = false;
  }
  return this.find(query).sort({ name: 1 });
};

folderSchema.statics.findByPath = async function (fullPath) {
  return this.findOne({
    path: fullPath,
    isDeleted: false,
  });
};

// 🔥 NEW: Find folders by department
folderSchema.statics.findByDepartment = function (
  departmentId,
  includeDeleted = false
) {
  const query = { departmentId };
  if (!includeDeleted) {
    query.isDeleted = false;
  }
  return this.find(query).sort({ path: 1 });
};

// 🔥 UPDATED: Pre-save middleware with new field names
folderSchema.pre("save", async function (next) {
  if (this.isModified("name") || this.isModified("parentId")) {
    if (!this.isNew || this.isModified("parentId")) {
      await this.buildPath();
    }
  }

  // 🔥 NEW: Auto-set departmentId from parent if not set
  if (this.isNew && !this.departmentId) {
    const FolderModel = mongoose.model("Folder");
    const DepartmentModel = mongoose.model("Department");

    let parent = await FolderModel.findById(this.parentId);

    if (!parent) {
      parent = await DepartmentModel.findById(this.parentId);
    }

    if (parent) {
      if (parent.departmentId) {
        this.departmentId = parent.departmentId;
      } else if (parent.ownerType === "ORG" || parent.ownerType === "USER") {
        // Parent is a department itself
        this.departmentId = parent._id;
      }
    }
  }

  next();
});

// Post-save middleware to update department stats
folderSchema.post("save", async function (doc) {
  if (this.wasNew || this.isModified("isDeleted")) {
    const department = await this.getDepartment();
    if (department) {
      await department.updateStats();
    }
  }
});

const FolderModel =
  mongoose.models.Folder || mongoose.model("Folder", folderSchema);

export default FolderModel;
