import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['document_upload', 'access_granted', 'version_update', 'folder_shared'],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  relatedDocument: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document'
  },
  relatedFolder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Folder'
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes
notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ createdAt: -1 });

// TTL index - auto-delete read notifications older than 30 days
notificationSchema.index({ readAt: 1 }, { 
  expireAfterSeconds: 2592000, // 30 days
  partialFilterExpression: { isRead: true } 
});

// Default export
const NotificationModel = mongoose.model('Notification', notificationSchema);
export default NotificationModel;
