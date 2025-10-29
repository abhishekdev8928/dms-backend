import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  action: {
    type: String,
    enum: ['upload', 'download', 'view', 'edit', 'delete', 'rename', 'move', 'login', 'logout', 'create_folder', 'delete_folder', 'update_permissions'],
    required: true
  },
  resourceType: {
    type: String,
    enum: ['document', 'folder', 'user', 'department', 'system'],
    required: true
  },
  resourceId: {
    type: mongoose.Schema.Types.ObjectId
  },
  resourceName: {
    type: String
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  },
  details: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: false
});

// Indexes
auditLogSchema.index({ user: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ resourceType: 1, resourceId: 1 });
auditLogSchema.index({ department: 1, timestamp: -1 });
auditLogSchema.index({ timestamp: -1 });

// TTL index - auto-delete logs older than 2 years
auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 63072000 });

// Default export
const AuditLogModel = mongoose.model('AuditLog', auditLogSchema);
export default AuditLogModel;
