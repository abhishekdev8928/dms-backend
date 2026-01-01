import mongoose from "mongoose";

const departmentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Department name is required'],
    trim: true,
    maxlength: [100, 'Department name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  
  // 🔥 NEW: Flag to differentiate Org vs User department
  ownerType: {
    type: String,
    enum: ['ORG', 'USER'],
    required: [true, 'Owner type is required'],
    uppercase: true,
    immutable: true // Cannot be changed after creation
  },
  
  // 🔥 NEW: For USER type departments (MyDrive), store the user ID
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    // Validate: if ownerType is USER, ownerId must exist
    validate: {
      validator: function(value) {
        if (this.ownerType === 'USER') {
          return value != null;
        }
        return true;
      },
      message: 'ownerId is required when ownerType is USER'
    }
  },
  
  // Parent-child hierarchy fields
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
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

// 🔥 UPDATED: Indexes for performance
departmentSchema.index({ name: 1 });
departmentSchema.index({ isActive: 1 });
departmentSchema.index({ createdAt: -1 });
departmentSchema.index({ parentId: 1 });
departmentSchema.index({ path: 1 });
departmentSchema.index({ ownerType: 1 });
departmentSchema.index({ ownerId: 1 });

// 🔥 Ensure global uniqueness for ORG departments
departmentSchema.index(
  { name: 1, ownerType: 1 },
  {
    unique: true,
    partialFilterExpression: { ownerType: 'ORG' } // only enforce for ORG
  }
);

// 🔥 Ensure per-user uniqueness for USER departments (MyDrive)
departmentSchema.index(
  { name: 1, ownerType: 1, ownerId: 1 },
  {
    unique: true,
    partialFilterExpression: { ownerType: 'USER' } // only enforce for USER
  }
);


// 🔥 NEW: Compound unique index - each user can only have ONE USER-type department
departmentSchema.index(
  { ownerType: 1, ownerId: 1 },
  { 
    unique: true,
    partialFilterExpression: { ownerType: 'USER' }
  }
);

// Virtual for formatted storage size
departmentSchema.virtual('stats.totalStorageFormatted').get(function() {
  const bytes = this.stats.totalStorageBytes;
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
});

// 🔥 NEW: Virtual to check if this is a MyDrive department
departmentSchema.virtual('isMyDrive').get(function() {
  return this.ownerType === 'USER';
});

// 🔥 NEW: Virtual to check if this is an Org department
departmentSchema.virtual('isOrgDepartment').get(function() {
  return this.ownerType === 'ORG';
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

// 🔥 NEW: Get user's MyDrive department
departmentSchema.statics.getUserMyDrive = function(userId) {
  return this.findOne({ 
    ownerType: 'USER', 
    ownerId: userId,
    isActive: true 
  });
};

// 🔥 NEW: Get all organizational departments (not MyDrive)
departmentSchema.statics.getOrgDepartments = function() {
  return this.find({ 
    ownerType: 'ORG',
    isActive: true 
  }).sort({ name: 1 });
};

// 🔥 NEW: Create MyDrive for a user
departmentSchema.statics.createMyDrive = async function(userId, creatorId) {
  // Check if MyDrive already exists for this user
  const existing = await this.getUserMyDrive(userId);
  if (existing) {
    throw new Error('MyDrive already exists for this user');
  }
  
  const myDrive = await this.create({
    name: `MyDrive_${userId}`, // Unique name per user
    description: 'Personal drive for user',
    ownerType: 'USER',
    ownerId: userId,
    createdBy: creatorId || userId,
    isActive: true
  });
  
  return myDrive;
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
  
  // Ensure parentId is null for departments (they are root level)
  this.parentId = null;
  
  // 🔥 NEW: Validate ownerType and ownerId relationship
  if (this.ownerType === 'USER' && !this.ownerId) {
    return next(new Error('ownerId is required when ownerType is USER'));
  }
  
  if (this.ownerType === 'ORG' && this.ownerId) {
    // Clear ownerId for ORG departments
    this.ownerId = null;
  }
  
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