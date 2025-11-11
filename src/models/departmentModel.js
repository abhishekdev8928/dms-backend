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
    ref: 'Item',  // References the unified Item model
    default: null  // null means this is a root department
  },
 type: {
  type: String,
  default: "department",
  enum: ["department"], 
  immutable: true 
},
  path: {
    type: String,
    index: true  // For fast breadcrumb and lookup queries
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
departmentSchema.index({ parent_id: 1 });  // For parent-child queries
departmentSchema.index({ path: 1 });  // For path-based lookups

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
  const Item = mongoose.model('Item');
  
  // Count folders (items with type 'folder' under this department's path)
  const totalFolders = await Item.countDocuments({
    path: new RegExp(`^${this.path}/`),
    type: 'folder',
    isDeleted: false
  });
  
  // Count documents (items with type 'file' under this department's path)
  const totalDocuments = await Item.countDocuments({
    path: new RegExp(`^${this.path}/`),
    type: 'file',
    isDeleted: false
  });
  
  // Calculate total storage
  const storageResult = await Item.aggregate([
    {
      $match: {
        path: new RegExp(`^${this.path}/`),
        type: 'file',
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
  
  // Update stats
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
  // Department is always root level, so path is just "/DepartmentName"
  this.path = `/${this.name}`;
  return this.path;
};

// Static methods
departmentSchema.statics.findActive = function() {
  return this.find({ isActive: true }).sort({ name: 1 });
};

departmentSchema.statics.getByName = function(name) {
  return this.findOne({ name: new RegExp(`^${name}$`, 'i') });
};

// Pre-save middleware
departmentSchema.pre('save', function(next) {
  if (this.isModified('name')) {
    this.name = this.name.trim();
    // Auto-generate path when name changes
    this.buildPath();
  }
  
  // Ensure parent_id is null for departments (they are root level)
  this.parent_id = null;
  
  next();
});

const DepartmentModel = mongoose.model('Department', departmentSchema);

export default DepartmentModel;