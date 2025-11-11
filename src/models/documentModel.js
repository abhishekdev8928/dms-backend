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
    default: "documents",
    enum: ["documents"],
    immutable: true
  },

  parent_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Parent folder ID is required']
    // ❌ removed "index: true" (handled below)
  },

  path: {
    type: String
    // ❌ removed "index: true"
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

  isDeleted: {
    type: Boolean,
    default: false
    // ❌ removed "index: true"
  },
  deletedAt: {
    type: Date,
    default: null
  },

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

// ✅ Clean, no duplicate indexes
documentSchema.index({ parent_id: 1, isDeleted: 1 });
documentSchema.index({ tags: 1 });
documentSchema.index({ createdAt: -1 });
documentSchema.index({ updatedAt: -1 });
documentSchema.index({ extension: 1 });
documentSchema.index({ mimeType: 1 });

// 🧠 Use text index ONLY once, without separate { path: 1 } to avoid duplicates
documentSchema.index({ name: "text", description: "text", path: "text" });



// Virtual for formatted file size
documentSchema.virtual('sizeFormatted').get(function() {
  const bytes = this.size;
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
});

// Virtual for file type category
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

// Virtual for display name with extension
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

documentSchema.methods.createNewVersion = async function(
  fileUrl, 
  size, 
  changeDescription, 
  userId,
  options = {},
  session = null
) {
  const DocumentVersionModel = mongoose.model('DocumentVersion');
  
  // Find latest version to get the next version number
  const latestVersion = await DocumentVersionModel.findOne({ documentId: this._id })
    .sort({ versionNumber: -1 })
    .session(session);
  
  const nextVersionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;
  
  // Each version can have its own identity - use provided values or fallback to document's current values
  const versionData = {
    documentId: this._id,
    versionNumber: nextVersionNumber,
    name: options.name || this.name,
    originalName: options.originalName || this.originalName,
    fileUrl: fileUrl,
    size: size,
    mimeType: options.mimeType || this.mimeType,
    extension: options.extension || this.extension,
    changeDescription: changeDescription,
    pathAtCreation: this.path,
    createdBy: userId,
    isLatest: true // Will be managed by post-save hook
  };
  
  const newVersion = await DocumentVersionModel.create([versionData], { session });
  
  // Update document's version counter and pointers
  this.version = nextVersionNumber;
  this.currentVersionId = newVersion[0]._id;
  this.fileUrl = fileUrl;
  this.size = size;
  this.updatedBy = userId;
  
  // Optionally update document's name if version has different name
  if (options.name && options.name !== this.name) {
    this.name = options.name;
  }
  if (options.originalName && options.originalName !== this.originalName) {
    this.originalName = options.originalName;
  }
  
  await this.save({ session });
  
  return newVersion[0];
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

documentSchema.methods.revertToVersion = async function(versionNumber, userId, session = null) {
  const DocumentVersionModel = mongoose.model('DocumentVersion');
  
  const targetVersion = await DocumentVersionModel.findOne({
    documentId: this._id,
    versionNumber: versionNumber
  }).session(session);
  
  if (!targetVersion) {
    throw new Error(`Version ${versionNumber} not found`);
  }
  
  // Create new version based on old version
  return this.createNewVersion(
    targetVersion.fileUrl,
    targetVersion.size,
    `Reverted to version ${versionNumber}`,
    userId,
    session
  );
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

// Pre-save middleware
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
  
  if (this.isModified('name') || this.isModified('extension') || this.isModified('parent_id')) {
    if (!this.isNew || this.isModified('parent_id')) {
      await this.buildPath();
    }
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