import mongoose from "mongoose";

const departmentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Department name is required'],
    trim: true,
    unique: true,
    maxlength: [100, 'Department name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  
  // Parent-child hierarchy fields
  parent_id: {
    type: mongoose.Schema.Types.ObjectId,
    default: null  // Just a mongoose ID - can reference anything
  },
  type: {
    type: String,
    default: "department",
    enum: ["department"], 
    immutable: true 
  },
  path: {
    type: String,
    index: true
  },
  
  // Auto-calculated statistics
  stats: {
    totalFolders: {
      type: Number,
      default: 0,
      min: 0
    },
    totalDocuments: {
      type: Number,
      default: 0,
      min: 0
    },
    totalStorageBytes: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  
  isActive: {
    type: Boolean,
    default: true
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

// Indexes for performance
departmentSchema.index({ name: 1 });
departmentSchema.index({ isActive: 1 });
departmentSchema.index({ createdAt: -1 });
departmentSchema.index({ parent_id: 1 });
departmentSchema.index({ path: 1 });

// Virtual for formatted storage size
departmentSchema.virtual('stats.totalStorageFormatted').get(function() {
  const bytes = this.stats.totalStorageBytes;
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
});

// Methods
departmentSchema.methods.updateStats = async function() {
  const FolderModel = mongoose.model('Folder');
  const DocumentModel = mongoose.model('Document');
  
  // Escape path for regex
  const escapedPath = this.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Count folders under this department
  const totalFolders = await FolderModel.countDocuments({
    path: new RegExp(`^${escapedPath}/`),
    isDeleted: false
  });
  
  // Count documents under this department
  const totalDocuments = await DocumentModel.countDocuments({
    path: new RegExp(`^${escapedPath}/`),
    isDeleted: false
  });
  
  // Calculate total storage from documents
  const storageResult = await DocumentModel.aggregate([
    {
      $match: {
        path: new RegExp(`^${escapedPath}/`),
        isDeleted: false
      }
    },
    {
      $group: {
        _id: null,
        totalSize: { $sum: '$size' }
      }
    }
  ]);
  
  const totalStorageBytes = storageResult.length > 0 ? storageResult[0].totalSize : 0;
  
  this.stats = {
    totalFolders,
    totalDocuments,
    totalStorageBytes
  };
  
  await this.save();
  return this.stats;
};

// Method to build path automatically
departmentSchema.methods.buildPath = function() {
  this.path = `/${this.name}`;
  return this.path;
};

// Update all child paths when department is renamed
departmentSchema.methods.updateChildPaths = async function(oldPath) {
  const FolderModel = mongoose.model('Folder');
  const DocumentModel = mongoose.model('Document');
  const newPath = this.path;
  
  // Escape special regex characters
  const escapedOldPath = oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Find all folders and documents that start with the old path
  const [folders, documents] = await Promise.all([
    FolderModel.find({
      path: new RegExp(`^${escapedOldPath}`)
    }),
    DocumentModel.find({
      path: new RegExp(`^${escapedOldPath}`)
    })
  ]);
  
  // Update folder paths
  const folderOps = folders.map(folder => {
    const newFolderPath = folder.path.replace(oldPath, newPath);
    return {
      updateOne: {
        filter: { _id: folder._id },
        update: { $set: { path: newFolderPath } }
      }
    };
  });
  
  // Update document paths
  const documentOps = documents.map(doc => {
    const newDocPath = doc.path.replace(oldPath, newPath);
    return {
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { path: newDocPath } }
      }
    };
  });
  
  // Execute bulk updates
  if (folderOps.length > 0) {
    await FolderModel.bulkWrite(folderOps);
  }
  
  if (documentOps.length > 0) {
    await DocumentModel.bulkWrite(documentOps);
  }
  
  return folderOps.length + documentOps.length;
};

// Static methods
departmentSchema.statics.findActive = function() {
  return this.find({ isActive: true }).sort({ name: 1 });
};

departmentSchema.statics.getByName = function(name) {
  return this.findOne({ name: new RegExp(`^${name}$`, 'i') });
};

// Pre-save middleware
departmentSchema.pre('save', async function(next) {
  if (this.isModified('name')) {
    // Store old path before building new one
    if (!this.isNew) {
      const oldDoc = await this.constructor.findById(this._id);
      if (oldDoc && oldDoc.path) {
        this._oldPath = oldDoc.path;
      }
    }
    
    this.name = this.name.trim();
    this.buildPath();
  }
  
  // Ensure parent_id is null for departments (they are root level)
  this.parent_id = null;
  
  next();
});

// Post-save middleware to update child paths
departmentSchema.post('save', async function(doc) {
  if (doc._oldPath && doc._oldPath !== doc.path) {
    await doc.updateChildPaths(doc._oldPath);
    delete doc._oldPath;
  }
});

const DepartmentModel = mongoose.model('Department', departmentSchema);

export default DepartmentModel;