import mongoose from "mongoose";

const folderSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  parentFolder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Folder',
    default: null
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: true
  },
  path: {
    type: String,
    required: true
  },
  level: {
    type: Number,
    default: 0
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  folderAccess: {
    type: String,
    enum: ['private', 'department', 'organization'],
    default: 'private'
  },
  permissions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FolderPermission'
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
folderSchema.index({ department: 1, parentFolder: 1 });
folderSchema.index({ department: 1, path: 1 }, { unique: true });
folderSchema.index({ createdBy: 1 });

// Default export
const FolderModel = mongoose.model('Folder', folderSchema);
export default FolderModel;
