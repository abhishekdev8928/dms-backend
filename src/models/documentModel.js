import mongoose from "mongoose";
import {
  findGroupByExtension,
  findGroupByMimeType,
  validateFile,
  areExtensionsEquivalent
} from '../utils/constant.js';

const documentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Document name is required'],
    trim: true,
    maxlength: [255, 'Document name cannot exceed 255 characters']
  },

  originalName: {
    type: String,
    required: [true, 'Original filename is required']
  },

  // 🔥 Resource type identifier - ALWAYS 'document'
  type: {
    type: String,
    default: 'document',
    enum: ['document'],
    immutable: true
  },

  // 🔥 File type based on extension/mime (no enum - dynamic)
  fileType: {
    type: String,
    required: [true, 'File type is required'],
    lowercase: true
  },

  // 🔥 Parent reference
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Parent folder ID is required'],
    index: true
  },

  // 🔥 Department reference
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    index: true
  },

  path: {
    type: String,
    index: true
  },

  fileUrl: {
    type: String,
    required: [true, 'File URL is required']
  },

  mimeType: {
    type: String,
    required: [true, 'MIME type is required']
  },

  extension: {
    type: String,
    required: [true, 'File extension is required'],
    lowercase: true,
    trim: true
  },

  size: {
    type: Number,
    required: [true, 'File size is required'],
    min: [0, 'File size cannot be negative']
  },

  version: {
    type: Number,
    default: 1,
    min: 1
  },

  currentVersionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DocumentVersion'
  },

  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },

  tags: [{
    type: String,
    trim: true,
    lowercase: true,
    maxlength: [50, 'Tag cannot exceed 50 characters']
  }],

  // Deletion Tracking
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },

  deletedAt: {
    type: Date,
    default: null
  },

  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  // User Tracking
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Creator information is required']
  },

  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ✅ Indexes
documentSchema.index({ parentId: 1, isDeleted: 1 });
documentSchema.index({ departmentId: 1, isDeleted: 1 });
documentSchema.index({ tags: 1 });
documentSchema.index({ createdAt: -1 });
documentSchema.index({ updatedAt: -1 });
documentSchema.index({ extension: 1 });
documentSchema.index({ mimeType: 1 });
documentSchema.index({ name: "text", description: "text", path: "text" });

// 🔥 Helper method to determine fileType from extension using constant groups
documentSchema.statics.getFileTypeFromExtension = function (extension) {
  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  const group = findGroupByExtension(ext);
  
  if (!group) return 'other';
  
  // ✅ Use group.category instead of group.name
  return group.category.toLowerCase();
};

// 🔥 Helper method to determine fileType from MIME type using constant groups
documentSchema.statics.getFileTypeFromMimeType = function (mimeType) {
  if (!mimeType) return 'other';
  
  const group = findGroupByMimeType(mimeType);
  
  if (!group) return 'other';
  
  // ✅ Use group.category instead of group.name
  return group.category.toLowerCase();
};

// 🔥 Combined method - try MIME first, then extension
documentSchema.statics.determineFileType = function (mimeType, extension) {
  // Try MIME type first
  if (mimeType) {
    const typeFromMime = this.getFileTypeFromMimeType(mimeType);
    if (typeFromMime !== 'other') return typeFromMime;
  }
  
  // Fallback to extension
  if (extension) {
    return this.getFileTypeFromExtension(extension);
  }
  
  return 'other';
};

// Virtuals
documentSchema.virtual('sizeFormatted').get(function () {
  const bytes = this.size;
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
});

documentSchema.virtual('fileCategory').get(function () {
  // Use the constant groups to determine category
  const ext = this.extension.startsWith('.') ? this.extension : `.${this.extension}`;
  const group = findGroupByExtension(ext);
  // ✅ Use group.category instead of group.name
  return group ? group.category.toLowerCase() : 'other';
});

documentSchema.virtual('displayName').get(function () {
  if (this.name.endsWith(`.${this.extension}`)) {
    return this.name;
  }
  return `${this.name}.${this.extension}`;
});

// Instance methods
documentSchema.methods.buildPath = async function () {
  const FolderModel = mongoose.model('Folder');
  const DepartmentModel = mongoose.model('Department');

  let parent = await FolderModel.findById(this.parentId);
  let parentType = 'Folder';

  if (!parent) {
    parent = await DepartmentModel.findById(this.parentId);
    parentType = 'Department';
  }

  if (!parent) {
    throw new Error('Parent (Folder or Department) not found');
  }

  const fileName = this.name.endsWith(`.${this.extension}`)
    ? this.name
    : `${this.name}.${this.extension}`;

  this.path = `${parent.path}/${fileName}`;

  return this.path;
};

documentSchema.methods.getBreadcrumbs = function () {
  const parts = this.path.split('/').filter(part => part.length > 0);
  return parts;
};

documentSchema.methods.getDepartment = async function () {
  const DepartmentModel = mongoose.model('Department');
  return DepartmentModel.findById(this.departmentId);
};

documentSchema.methods.getParentFolder = async function () {
  const FolderModel = mongoose.model('Folder');
  return FolderModel.findById(this.parentId);
};

// 🔥 Re-upload method using constant file format groups
documentSchema.methods.reUpload = async function (
  newFileData,
  changeDescription,
  userId
) {
  const DocumentVersionModel = mongoose.model("DocumentVersion");
  const DocumentModel = mongoose.model("Document");

  // 1️⃣ Normalize extensions (add dot if missing)
  const currentExtension = this.extension.startsWith('.')
    ? this.extension.toLowerCase()
    : `.${this.extension.toLowerCase()}`;

  const newExtension = newFileData.extension.startsWith('.')
    ? newFileData.extension.toLowerCase()
    : `.${newFileData.extension.toLowerCase()}`;

  // 2️⃣ Validate using format groups from constants (allows jpg→jpeg, png→jpg, etc.)
  if (!areExtensionsEquivalent(currentExtension, newExtension)) {
    const currentGroup = findGroupByExtension(currentExtension);
    const newGroup = findGroupByExtension(newExtension);

    throw new Error(
      `File format mismatch. Current: ${currentGroup?.name || 'unknown'}, New: ${newGroup?.name || 'unknown'}`
    );
  }

  // 3️⃣ Validate the new file completely
  const validation = validateFile(newExtension, newFileData.mimeType);
  if (!validation.valid) {
    throw new Error(`File validation failed: ${validation.reason}`);
  }

  // 4️⃣ Determine file type using constant groups
  const fileType = DocumentModel.determineFileType(
    newFileData.mimeType,
    newExtension
  );

  // 5️⃣ Create a new version - ✅ INCLUDE type: 'document'
  const newVersion = await DocumentVersionModel.createNewVersion(
    this._id,
    {
      ...newFileData,
      name: this.name,
      originalName: newFileData.originalName,
      fileType: fileType,
      extension: newExtension.replace('.', ''),
      type: 'document' // ✅ FIXED: Always pass type as 'document'
    },
    changeDescription || "File re-uploaded",
    userId
  );

  // 6️⃣ Update document metadata (including extension if changed within same group)
  this.fileUrl = newFileData.fileUrl;
  this.size = newFileData.size;
  this.mimeType = newFileData.mimeType;
  this.extension = newExtension.replace('.', '');
  this.fileType = fileType;
  this.version = newVersion.versionNumber;
  this.currentVersionId = newVersion._id;
  this.updatedBy = userId;

  await this.save();

  return newVersion;
};

// Rename method
documentSchema.methods.rename = async function (
  newName,
  userId,
  session = null
) {
  const DocumentVersionModel = mongoose.model('DocumentVersion');

  this.name = newName;
  this.updatedBy = userId;

  await this.buildPath();
  await this.save({ session });

  await DocumentVersionModel.updateLatestVersionName(
    this._id,
    newName,
    session
  );

  return this;
};

documentSchema.methods.getAllVersions = async function () {
  const DocumentVersionModel = mongoose.model('DocumentVersion');
  return DocumentVersionModel.find({ documentId: this._id })
    .populate('createdBy', 'name email avatar')
    .sort({ versionNumber: -1 })
    .lean();
};

documentSchema.methods.getVersion = async function (versionNumber) {
  const DocumentVersionModel = mongoose.model('DocumentVersion');
  return DocumentVersionModel.findOne({
    documentId: this._id,
    versionNumber: versionNumber
  });
};

// Revert to version method
documentSchema.methods.revertToVersion = async function (targetVersionNumber, userId) {
  const DocumentVersion = mongoose.model("DocumentVersion");

  // 1. Get the version to restore from
  const oldVersion = await DocumentVersion.findOne({
    documentId: this._id,
    versionNumber: targetVersionNumber
  });

  if (!oldVersion) throw new Error("Version not found");

  // 2. Validate that old version's format is still compatible using constant groups
  const currentExt = this.extension.startsWith('.') ? this.extension : `.${this.extension}`;
  const oldExt = oldVersion.extension.startsWith('.') ? oldVersion.extension : `.${oldVersion.extension}`;

  if (!areExtensionsEquivalent(currentExt, oldExt)) {
    throw new Error(
      `Cannot revert: format incompatibility between current version and version ${targetVersionNumber}`
    );
  }

  // 3. Create NEW version based on old version - ✅ INCLUDE type: 'document'
  const newVersion = await DocumentVersion.createNewVersion(
    this._id,
    {
      name: oldVersion.name,
      originalName: oldVersion.originalName,
      mimeType: oldVersion.mimeType,
      extension: oldVersion.extension,
      size: oldVersion.size,
      fileType: oldVersion.fileType,
      fileUrl: oldVersion.fileUrl,
      type: 'document' // ✅ FIXED: Always pass type as 'document'
    },
    `Restored from version ${targetVersionNumber}`,
    userId
  );

  // 4. Update Document to reflect this restored version
  this.name = newVersion.name;
  this.originalName = newVersion.originalName;
  this.mimeType = newVersion.mimeType;
  this.extension = newVersion.extension;
  this.size = newVersion.size;
  this.fileUrl = newVersion.fileUrl;
  this.fileType = newVersion.fileType;
  this.version = newVersion.versionNumber;
  this.currentVersionId = newVersion._id;
  this.updatedBy = userId;

  await this.save();

  return newVersion;
};

documentSchema.methods.moveTo = async function (newParentId, session = null) {
  const FolderModel = mongoose.model('Folder');
  const DepartmentModel = mongoose.model('Department');

  let newParent = await FolderModel.findById(newParentId).session(session);

  if (!newParent) {
    newParent = await DepartmentModel.findById(newParentId).session(session);
  }

  if (!newParent) {
    throw new Error('New parent not found');
  }

  this.parentId = newParentId;

  // Update departmentId if moving to different department
  if (
    newParent.departmentId &&
    newParent.departmentId.toString() !== this.departmentId.toString()
  ) {
    this.departmentId = newParent.departmentId;
  }

  await this.buildPath();
  await this.save({ session });

  return this;
};

documentSchema.methods.softDelete = async function (session = null) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  await this.save({ session });
  return this;
};

documentSchema.methods.restore = async function (session = null) {
  this.isDeleted = false;
  this.deletedAt = null;
  await this.save({ session });
  return this;
};

documentSchema.methods.addTags = async function (newTags, session = null) {
  const uniqueTags = [...new Set([...this.tags, ...newTags.map(t => t.toLowerCase().trim())])];
  this.tags = uniqueTags;
  await this.save({ session });
  return this;
};

documentSchema.methods.removeTags = async function (tagsToRemove, session = null) {
  const tagsSet = new Set(tagsToRemove.map(t => t.toLowerCase().trim()));
  this.tags = this.tags.filter(tag => !tagsSet.has(tag));
  await this.save({ session });
  return this;
};

// Static methods
documentSchema.statics.findByFolder = function (folderId, includeDeleted = false) {
  const query = { parentId: folderId };
  if (!includeDeleted) {
    query.isDeleted = false;
  }
  return this.find(query).sort({ name: 1 });
};

documentSchema.statics.searchByName = function (searchTerm, departmentId = null, options = {}) {
  const query = {
    $text: { $search: searchTerm },
    isDeleted: false
  };

  if (departmentId) {
    query.departmentId = departmentId;
  }

  return this.find(query, { score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' } })
    .limit(options.limit || 20);
};

documentSchema.statics.findByPath = function (fullPath) {
  return this.findOne({
    path: fullPath,
    isDeleted: false
  });
};

documentSchema.statics.findByDepartment = function (
  departmentId,
  includeDeleted = false
) {
  const query = { departmentId };
  if (!includeDeleted) {
    query.isDeleted = false;
  }
  return this.find(query).sort({ path: 1 });
};

// Pre-save middleware
documentSchema.pre('save', async function (next) {
  if (this.isNew && !this.extension && this.originalName) {
    const match = this.originalName.match(/\.([^.]+)$/);
    if (match) {
      this.extension = match[1].toLowerCase();
    }
  }

  if (this.isModified('tags')) {
    this.tags = [...new Set(this.tags.map(tag => tag.toLowerCase().trim()))];
  }

  // 🔥 Auto-set departmentId from parent if not set
  if (this.isNew && !this.departmentId) {
    const FolderModel = mongoose.model('Folder');
    const DepartmentModel = mongoose.model('Department');

    let parent = await FolderModel.findById(this.parentId);

    if (!parent) {
      parent = await DepartmentModel.findById(this.parentId);
    }

    if (parent) {
      if (parent.departmentId) {
        this.departmentId = parent.departmentId;
      } else if (parent.ownerType === 'ORG' || parent.ownerType === 'USER') {
        this.departmentId = parent._id;
      }
    }
    
    // 🔥 Validate that departmentId was set
    if (!this.departmentId) {
      throw new Error('Unable to determine departmentId from parent');
    }
  }

  // Auto-set fileType if not set (using constant groups)
  if (this.isNew && !this.fileType) {
    this.fileType = this.constructor.determineFileType(this.mimeType, this.extension);
  }

  // Rebuild path if parentId changes
  if (this.isModified('parentId')) {
    await this.buildPath();
  }

  next();
});

// Post-save middleware
documentSchema.post('save', async function (doc) {
  if (this.wasNew || this.isModified('isDeleted') || this.isModified('size')) {
    const department = await this.getDepartment();
    if (department) {
      await department.updateStats();
    }
  }
});

// Post-remove middleware
documentSchema.post('remove', async function (doc) {
  const department = await this.getDepartment();
  if (department) {
    await department.updateStats();
  }
});

const DocumentModel = mongoose.models.Document || mongoose.model('Document', documentSchema);
export default DocumentModel;