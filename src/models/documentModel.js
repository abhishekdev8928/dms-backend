import mongoose from "mongoose";

const documentSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  originalFileName: {
    type: String,
    required: true
  },
  fileKey: {
    type: String,
    required: true
  },
  fileType: {
    type: String,
    enum: ['pdf', 'docx', 'xlsx', 'jpg', 'png', 'zip'],
    required: true
  },
  fileSize: {
    type: Number,
    required: true
  },
   folder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Folder",
      default: null,
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
    },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  version: {
    type: Number,
    default: 1
  },
  permissions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['superadmin', 'admin', 'team_member', 'member_bank']
    },
    access: [{
      type: String,
      enum: ['view', 'edit', 'delete', 'download']
    }]
  }],
  metadata: {
    type: Map,
    of: String
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
documentSchema.index({ folder: 1 });
documentSchema.index({ department: 1 });
documentSchema.index({ uploadedBy: 1 });
documentSchema.index({ tags: 1 });
documentSchema.index({ title: 'text', tags: 'text' });
documentSchema.index({ createdAt: -1 });
documentSchema.index({ 'permissions.user': 1 });
documentSchema.index({ 'permissions.role': 1 });
documentSchema.index({ folder: 1, isActive: 1 });
documentSchema.index({ department: 1, createdAt: -1 });

// Default export
const DocumentModel = mongoose.model('Document', documentSchema);
export default DocumentModel;
