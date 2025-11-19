import mongoose from "mongoose";

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

  type: {
    type: String,
    required: [true, 'Type is required'],
    enum: [
      'folder',
      'pdf',
      'document',
      'spreadsheet',
      'presentation',
      'image',
      'video',
      'audio',
      'zip',
      'archive',
      'code',
      'other'
    ],
    lowercase: true
  },

  parent_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Parent folder ID is required']
  },

  path: {
    type: String
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

  // 🔥 Deletion Tracking
  isDeleted: {
    type: Boolean,
    default: false
  },

  deletedAt: {
    type: Date,
    default: null
  },

  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null // <-- NEW FIELD
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
documentSchema.index({ parent_id: 1, isDeleted: 1 });
documentSchema.index({ tags: 1 });
documentSchema.index({ createdAt: -1 });
documentSchema.index({ updatedAt: -1 });
documentSchema.index({ extension: 1 });
documentSchema.index({ mimeType: 1 });
documentSchema.index({ name: "text", description: "text", path: "text" });

// Helper method to determine type from MIME type
documentSchema.statics.getTypeFromMimeType = function (mimeType, extension) {
  const mimeTypeMap = {
    'application/pdf': 'pdf',
    'application/msword': 'document',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
    'text/plain': 'document',
    'application/rtf': 'document',
    'application/vnd.ms-excel': 'spreadsheet',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'spreadsheet',
    'text/csv': 'spreadsheet',
    'application/vnd.ms-powerpoint': 'presentation',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'presentation',

    // image types
    'image/jpeg': 'image',
    'image/jpg': 'image',
    'image/png': 'image',
    'image/gif': 'image',
    'image/webp': 'image',
    'image/svg+xml': 'image',
    'image/bmp': 'image',
    'image/tiff': 'image',

    // zip types
    'application/zip': 'zip',
    'application/x-zip-compressed': 'zip',
    'application/x-rar-compressed': 'zip',
    'application/x-7z-compressed': 'zip',
    'application/gzip': 'zip',
    'application/x-tar': 'zip'
  };

  // 1️⃣ Check MIME type FIRST (PNG → image)
  if (mimeType && mimeTypeMap[mimeType]) {
    return mimeTypeMap[mimeType];
  }

  // 2️⃣ If MIME fails, fallback to extension
  if (extension) {
    const ext = extension.toLowerCase().replace('.', '');

    const zipExtensions = ['zip', 'rar', '7z', 'gz', 'tar'];
    if (zipExtensions.includes(ext)) return 'zip';

    const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'bmp', 'tiff', 'webp'];
    if (imageExtensions.includes(ext)) return 'image';
  }

  return 'other';
};


// Virtuals
documentSchema.virtual('sizeFormatted').get(function() {
  const bytes = this.size;
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
});

documentSchema.virtual('fileCategory').get(function() {
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'];
  const docExts = ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'];
  const spreadsheetExts = ['xls', 'xlsx', 'csv', 'ods'];
  const presentationExts = ['ppt', 'pptx', 'odp'];
  const videoExts = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm'];
  const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'm4a'];
  const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz'];
  
  const ext = this.extension.toLowerCase();
  
  if (imageExts.includes(ext)) return 'image';
  if (docExts.includes(ext)) return 'document';
  if (spreadsheetExts.includes(ext)) return 'spreadsheet';
  if (presentationExts.includes(ext)) return 'presentation';
  if (videoExts.includes(ext)) return 'video';
  if (audioExts.includes(ext)) return 'audio';
  if (archiveExts.includes(ext)) return 'archive';
  
  return 'other';
});

documentSchema.virtual('displayName').get(function() {
  if (this.name.endsWith(`.${this.extension}`)) {
    return this.name;
  }
  return `${this.name}.${this.extension}`;
});

// Instance methods
documentSchema.methods.buildPath = async function () {
  const FolderModel = mongoose.model('Folder');
  const DepartmentModel = mongoose.model('Department');

  let parent = await FolderModel.findById(this.parent_id);
  let parentType = 'Folder';

  if (!parent) {
    parent = await DepartmentModel.findById(this.parent_id);
    parentType = 'Department';
  }

  if (!parent) {
    throw new Error('Parent (Folder or Department) not found');
  }

  const fileName = this.name.endsWith(`.${this.extension}`)
    ? this.name
    : `${this.name}.${this.extension}`;

  if (parentType === 'Department') {
    this.path = `/${parent.name}/${fileName}`;
  } else {
    this.path = `${parent.path}/${fileName}`;
  }

  return this.path;
};

documentSchema.methods.getBreadcrumbs = function() {
  const parts = this.path.split('/').filter(part => part.length > 0);
  return parts;
};

documentSchema.methods.getDepartment = async function() {
  const DepartmentModel = mongoose.model('Department');
  const departmentName = this.path.split('/')[1];
  return DepartmentModel.findOne({ name: departmentName });
};

documentSchema.methods.getParentFolder = async function() {
  const FolderModel = mongoose.model('Folder');
  return FolderModel.findById(this.parent_id);
};

// ✅ FIXED: Re-upload method - replaces ALL metadata with new file
// ✅ FIXED: Re-upload method - validates extension and preserves display name
// 📌 DOCUMENT MODEL — REUPLOAD LOGIC
documentSchema.methods.reUpload = async function (
  newFileData,
  changeDescription,
  userId
) {
  

  const DocumentVersionModel = mongoose.model("DocumentVersion");
  const DocumentModel = mongoose.model("Document");

  // 1️⃣ Validate extension
  const currentExtension = this.extension.toLowerCase();
  const newExtension = newFileData.extension.toLowerCase();

  if (currentExtension !== newExtension) {
    throw new Error(
      `File format mismatch. Expected .${currentExtension} but received .${newExtension}`
    );
  }

  // 2️⃣ Determine file type
  const fileType = DocumentModel.getTypeFromMimeType(
    newFileData.mimeType,
    newFileData.extension
  );

  // 3️⃣ Create a new version (🔥 FIXED NAME HANDLING)
  const newVersion = await DocumentVersionModel.createNewVersion(
    this._id,
    {
      ...newFileData,

      // NAME RULES:
      // ✔ "name" = DO NOT TAKE FROM FRONTEND
      // ✔ Frozen = use main document name
      name: this.name,

      // ✔ original uploaded filename (correct)
      originalName: newFileData.originalName,

      type: fileType,
    },
    changeDescription || "File re-uploaded",
    userId
  );

  // 4️⃣ Update only metadata (NOT names)
  this.fileUrl = newFileData.fileUrl;
  this.size = newFileData.size;
  this.mimeType = newFileData.mimeType;
  this.version = newVersion.versionNumber;
  this.currentVersionId = newVersion._id;
  this.updatedBy = userId;

  // ❌ Do NOT change:
  // this.name
  // this.originalName

  await this.save();

  return newVersion;
};





// ✅ NEW: Rename method - only updates name, keeps file metadata
documentSchema.methods.rename = async function(
  newName,
  userId,
  session = null
) {
  const DocumentVersionModel = mongoose.model('DocumentVersion');
  
  // Update Document name
  this.name = newName;
  this.updatedBy = userId;
  
  // Rebuild path
  await this.buildPath();
  await this.save({ session });
  
  // Update ONLY the latest version's name
  await DocumentVersionModel.updateLatestVersionName(
    this._id,
    newName,
    session
  );
  
  return this;
};

documentSchema.methods.getAllVersions = async function() {
  const DocumentVersionModel = mongoose.model('DocumentVersion');
  return DocumentVersionModel.find({ documentId: this._id })
    .populate('createdBy', 'name email avatar')
    .sort({ versionNumber: -1 })
    .lean();
};

documentSchema.methods.getVersion = async function(versionNumber) {
  const DocumentVersionModel = mongoose.model('DocumentVersion');
  return DocumentVersionModel.findOne({
    documentId: this._id,
    versionNumber: versionNumber
  });
};

// ✅ FIXED: Revert creates new version with old version's metadata
// documentSchema.methods.revertToVersion = async function(versionNumber, userId, session = null) {
//   const DocumentVersionModel = mongoose.model('DocumentVersion');
  
//   const targetVersion = await DocumentVersionModel.findOne({
//     documentId: this._id,
//     versionNumber: versionNumber
//   }).session(session);
  
//   if (!targetVersion) {
//     throw new Error(`Version ${versionNumber} not found`);
//   }
  
//   // Create new version based on old version's file
//   const revertedFileData = {
//     fileUrl: targetVersion.fileUrl,
//     size: targetVersion.size,
//     mimeType: targetVersion.mimeType,
//     extension: targetVersion.extension,
//     name: targetVersion.name,
//     originalName: targetVersion.originalName
//   };
  
//   return this.reUpload(
//     revertedFileData,
//     `Reverted to version ${versionNumber}`,
//     userId,
//     session
//   );
// };

documentSchema.methods.revertToVersion = async function (targetVersionNumber, userId) {
  const DocumentVersion = mongoose.model("DocumentVersion");

  // 1. Get the version to restore from
  const oldVersion = await DocumentVersion.findOne({
    documentId: this._id,
    versionNumber: targetVersionNumber
  });

  if (!oldVersion) throw new Error("Version not found");

  // 2. Create NEW version based on old version
  const newVersion = await DocumentVersion.createNewVersion(
    this._id,
    {
      name: oldVersion.name,
      originalName: oldVersion.originalName,
      mimeType: oldVersion.mimeType,
      extension: oldVersion.extension,
      size: oldVersion.size,
      type: oldVersion.type,
      fileUrl: oldVersion.fileUrl
    },
    `Restored from version ${targetVersionNumber}`,
    userId
  );

  // 3. Update Document to reflect this restored version
  this.name = newVersion.name;
  this.originalName = newVersion.originalName;
  this.mimeType = newVersion.mimeType;
  this.extension = newVersion.extension;
  this.size = newVersion.size;
  this.fileUrl = newVersion.fileUrl;

  await this.save();

  return newVersion;
};





documentSchema.methods.moveTo = async function(newParentId, session = null) {
  const FolderModel = mongoose.model('Folder');
  
  const folder = await FolderModel.findById(newParentId).session(session);
  if (!folder) {
    throw new Error('Target folder not found');
  }
  
  const oldDepartment = await this.getDepartment();
  const newDepartmentName = folder.path.split('/')[1];
  const DepartmentModel = mongoose.model('Department');
  const newDepartment = await DepartmentModel.findOne({ name: newDepartmentName }).session(session);
  
  this.parent_id = newParentId;
  await this.buildPath();
  await this.save({ session });
  
  if (oldDepartment && newDepartment && !oldDepartment._id.equals(newDepartment._id)) {
    await oldDepartment.updateStats();
    await newDepartment.updateStats();
  } else if (oldDepartment) {
    await oldDepartment.updateStats();
  }
  
  return this;
};

documentSchema.methods.softDelete = async function(session = null) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  await this.save({ session });
  return this;
};

documentSchema.methods.restore = async function(session = null) {
  this.isDeleted = false;
  this.deletedAt = null;
  await this.save({ session });
  return this;
};

documentSchema.methods.addTags = async function(newTags, session = null) {
  const uniqueTags = [...new Set([...this.tags, ...newTags.map(t => t.toLowerCase().trim())])];
  this.tags = uniqueTags;
  await this.save({ session });
  return this;
};

documentSchema.methods.removeTags = async function(tagsToRemove, session = null) {
  const tagsSet = new Set(tagsToRemove.map(t => t.toLowerCase().trim()));
  this.tags = this.tags.filter(tag => !tagsSet.has(tag));
  await this.save({ session });
  return this;
};

// Static methods
documentSchema.statics.findByFolder = function(folderId, includeDeleted = false) {
  const query = { parent_id: folderId };
  if (!includeDeleted) {
    query.isDeleted = false;
  }
  return this.find(query).sort({ name: 1 });
};

documentSchema.statics.searchByName = function(searchTerm, departmentName = null, options = {}) {
  const query = {
    $text: { $search: searchTerm },
    isDeleted: false
  };
  
  if (departmentName) {
    const escapedName = departmentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.path = new RegExp(`^/${escapedName}/`);
  }
  
  return this.find(query, { score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' } })
    .limit(options.limit || 20);
};

documentSchema.statics.findByPath = function(fullPath) {
  return this.findOne({
    path: fullPath,
    isDeleted: false
  });
};

// ✅ FIXED: Pre-save middleware - only rebuild path if parent changes
documentSchema.pre('save', async function(next) {
  if (this.isNew && !this.extension && this.originalName) {
    const match = this.originalName.match(/\.([^.]+)$/);
    if (match) {
      this.extension = match[1].toLowerCase();
    }
  }
  
  if (this.isModified('tags')) {
    this.tags = [...new Set(this.tags.map(tag => tag.toLowerCase().trim()))];
  }
  
  // Only rebuild path if parent_id changes (move operation)
  // Name changes are handled by rename() method
  if (this.isModified('parent_id')) {
    await this.buildPath();
  }
  
  next();
});

// Post-save middleware to update department stats
documentSchema.post('save', async function(doc) {
  if (this.wasNew || this.isModified('isDeleted') || this.isModified('size')) {
    const department = await this.getDepartment();
    if (department) {
      await department.updateStats();
    }
  }
});

// Post-remove middleware to update department stats
documentSchema.post('remove', async function(doc) {
  const department = await this.getDepartment();
  if (department) {
    await department.updateStats();
  }
});

const DocumentModel = mongoose.models.Document || mongoose.model('Document', documentSchema);
export default DocumentModel;