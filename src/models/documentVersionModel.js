import mongoose from "mongoose";

const documentVersionSchema = new mongoose.Schema({
  document: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
    required: true
  },
  version: {
    type: Number,
    required: true
  },
  fileUrl: {
    type: String,
    required: true
  },
  fileKey: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  changes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Indexes
documentVersionSchema.index({ document: 1, version: -1 });
documentVersionSchema.index({ uploadedBy: 1 });

// Default export
const DocumentVersionModel = mongoose.model('DocumentVersion', documentVersionSchema);
export default DocumentVersionModel;
