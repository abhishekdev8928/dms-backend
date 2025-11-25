import mongoose from "mongoose";
import DocumentModel from "./documentModel.js";


const folderSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Folder name is required'],
    trim: true,
    maxlength: [255, 'Folder name cannot exceed 255 characters']
  },
  type: {
    type: String,
    default: "folder",
    enum: ["folder"],
    immutable: true
  },

  // Pure parent-child hierarchy - just stores ID, no ref
  parent_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Parent ID is required']
  },

  // Path for fast lookups and breadcrumbs
  path: {
    type: String
  },

  // Optional fields
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  color: {
    type: String,
    default: '#3B82F6',
    match: [/^#[0-9A-F]{6}$/i, 'Please provide a valid hex color code']
  },

  // Starred field
  starred: {
    type: Boolean,
    default: false
  },

  // Soft delete
  isDeleted: {
    type: Boolean,
    default: false
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

// ✅ Cleaned up index definitions
folderSchema.index({ parent_id: 1 });
folderSchema.index({ path: 1 });
folderSchema.index({ isDeleted: 1 });
folderSchema.index({ parent_id: 1, isDeleted: 1 });
folderSchema.index({ name: 1, parent_id: 1 }, { unique: true });

// (All your methods remain unchanged 👇)
folderSchema.methods.buildPath = async function() {
  const FolderModel = mongoose.model('Folder');
  const DepartmentModel = mongoose.model('Department');

  let parent = await FolderModel.findById(this.parent_id);
  if (!parent) parent = await DepartmentModel.findById(this.parent_id);
  if (!parent) throw new Error('Parent not found');

  this.path = `${parent.path}/${this.name}`;
  return this.path;
};

folderSchema.methods.getChildren = async function(includeDeleted = false) {
  const FolderModel = mongoose.model('Folder');
  const DocumentModel = mongoose.model('Document');

  const query = { parent_id: this._id };
  if (!includeDeleted) query.isDeleted = false;

  const [folders, documents] = await Promise.all([
    FolderModel.find(query).sort({ name: 1 }),
    DocumentModel.find(query).sort({ name: 1 })
  ]);

  return [...folders, ...documents];
};


folderSchema.methods.getAllDescendants = async function(includeDeleted = false) {
  const FolderModel = mongoose.model('Folder');
  const DocumentModel = mongoose.model('Document');
  
  const query = { 
    path: new RegExp(`^${this.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`)  // Escape special regex chars
  };
  if (!includeDeleted) {
    query.isDeleted = false;
  }
  
  // Get both folders and documents as descendants
  const [folders, documents] = await Promise.all([
    FolderModel.find(query).sort({ path: 1 }),
    DocumentModel.find(query).sort({ path: 1 })
  ]);
  
  return [...folders, ...documents];
};

folderSchema.methods.getBreadcrumbs = function() {
  // Parse breadcrumbs from path
  // Example: /Department/FolderA/SubfolderB
  // Returns: ['Department', 'FolderA', 'SubfolderB']
  const parts = this.path.split('/').filter(part => part.length > 0);
  return parts;
};

folderSchema.methods.getDepartment = async function() {
  const DepartmentModel = mongoose.model('Department');
  // Extract department name from path (first segment)
  const departmentName = this.path.split('/')[1];
  return DepartmentModel.findOne({ name: departmentName });
};

folderSchema.methods.moveTo = async function(newParentId, session = null) {
  const FolderModel = mongoose.model('Folder');
  const DepartmentModel = mongoose.model('Department');
  
  // Validate new parent exists
  let newParent = await FolderModel.findById(newParentId).session(session);
  
  if (!newParent) {
    // Check if parent is a Department
    newParent = await DepartmentModel.findById(newParentId).session(session);
  }
  
  if (!newParent) {
    throw new Error('New parent not found');
  }
  
  // Prevent circular reference (can't move to own descendant)
  if (newParent.path && newParent.path.startsWith(this.path + '/')) {
    throw new Error('Cannot move folder to its own descendant');
  }
  
  const oldPath = this.path;
  
  // Update parent_id
  this.parent_id = newParentId;
  
  // Rebuild path
  await this.buildPath();
  const newPath = this.path;
  
  await this.save({ session });
  
  // Update all descendants' paths
  await this.updateDescendantsPaths(oldPath, newPath, session);
  
  return this;
};

folderSchema.methods.updateDescendantsPaths = async function(oldPath, newPath, session = null) {
  const FolderModel = mongoose.model('Folder');
  const DocumentModel = mongoose.model('Document');
  
  // Escape special regex characters in oldPath
  const escapedOldPath = oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Find all descendant folders
  const folders = await FolderModel.find({ 
    path: new RegExp(`^${escapedOldPath}/`)
  }).session(session);
  
  // Find all descendant documents
  const documents = await DocumentModel.find({ 
    path: new RegExp(`^${escapedOldPath}/`)
  }).session(session);
  
  // Update folder paths
  for (const folder of folders) {
    folder.path = folder.path.replace(oldPath, newPath);
    await folder.save({ session });
  }
  
  // Update document paths
  for (const document of documents) {
    document.path = document.path.replace(oldPath, newPath);
    await document.save({ session });
  }
};

folderSchema.methods.softDelete = async function(session = null) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  await this.save({ session });
  
  // Soft delete all descendants
  const FolderModel = mongoose.model('Folder');
  const DocumentModel = mongoose.model('Document');
  
  const escapedPath = this.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  await Promise.all([
    FolderModel.updateMany(
      { path: new RegExp(`^${escapedPath}/`) },
      { isDeleted: true, deletedAt: new Date() }
    ).session(session),
    DocumentModel.updateMany(
      { path: new RegExp(`^${escapedPath}/`) },
      { isDeleted: true, deletedAt: new Date() }
    ).session(session)
  ]);
  
  return this;
};

folderSchema.methods.restore = async function(session = null) {
  this.isDeleted = false;
  this.deletedAt = null;
  await this.save({ session });
  
  return this;
};

// Static methods
folderSchema.statics.getRootFoldersForDepartment = function(departmentId, includeDeleted = false) {
  const query = {
    parent_id: departmentId
  };
  if (!includeDeleted) {
    query.isDeleted = false;
  }
  return this.find(query).sort({ name: 1 });
};

folderSchema.statics.findByPath = async function(fullPath) {
  return this.findOne({
    path: fullPath,
    isDeleted: false
  });
};

// Pre-save middleware
folderSchema.pre('save', async function(next) {
  // Auto-generate path when name or parent changes
  if (this.isModified('name') || this.isModified('parent_id')) {
    if (!this.isNew || this.isModified('parent_id')) {
      await this.buildPath();
    }
  }
  
  next();
});

// Post-save middleware to update department stats
folderSchema.post('save', async function(doc) {
  if (this.wasNew || this.isModified('isDeleted')) {
    const department = await this.getDepartment();
    if (department) {
      await department.updateStats();
    }
  }
});

// In FolderModel schema methods:
folderSchema.methods.getChildren = async function (includeDeleted = false) {
  const query= {
    parent_id: this._id,
    ...(includeDeleted ? {} : { isDeleted: false })
  };

  const [folders, documents] = await Promise.all([
    FolderModel.find(query),
    DocumentModel.find(query)
  ]);

  return [...folders, ...documents].sort((a, b) => b.createdAt - a.createdAt);
};


const FolderModel = mongoose.models.Folder || mongoose.model('Folder', folderSchema);

export default FolderModel;