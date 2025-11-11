import mongoose from 'mongoose';

const activityLogSchema = new mongoose.Schema({
  // Action details
  action: {
    type: String,
    required: [true, 'Action is required'],
    enum: [
      // Department actions
      'DEPARTMENT_CREATED',
      'DEPARTMENT_UPDATED',
      'DEPARTMENT_DELETED',
      'DEPARTMENT_ACTIVATED',
      'DEPARTMENT_DEACTIVATED',
      
      // Folder actions
      'FOLDER_CREATED',
      'FOLDER_UPDATED',
      'FOLDER_DELETED',
      'FOLDER_RESTORED',
      'FOLDER_MOVED',
      
      // Document actions
      'DOCUMENT_UPLOADED',
      'DOCUMENT_UPDATED',
      'DOCUMENT_DELETED',
      'DOCUMENT_RESTORED',
      'DOCUMENT_MOVED',
      'DOCUMENT_DOWNLOADED',
      'DOCUMENT_VIEWED',
      
      // Version actions
      'VERSION_CREATED',
      'VERSION_REVERTED',
      
      // Tag actions
      'TAGS_ADDED',
      'TAGS_REMOVED',
      
      // User actions
      'USER_LOGIN',
      'USER_LOGOUT',
      'USER_CREATED',
      'USER_UPDATED'
    ],
    index: true
  },
  
  // Entity information
  entityType: {
    type: String,
    required: [true, 'Entity type is required'],
    enum: ['Department', 'Folder', 'Document', 'DocumentVersion', 'User'],
    index: true
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Entity ID is required'],
    index: true
  },
  entityName: {
    type: String,
    trim: true
    // Store name for quick reference (e.g., folder name, document name)
  },
  
  // User who performed the action
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User information is required'],
    index: true
  },
  performedByName: {
    type: String,
    trim: true
    // Store user name for quick reference
  },
  performedByEmail: {
    type: String,
    trim: true,
    lowercase: true
  },
  
  // Related entities (for context)
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    index: true
  },
  folderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Folder',
    index: true
  },
  
  // Action details
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
    // Human-readable description of the action
  },
  
  // Changes made (for update actions)
  changes: {
    type: mongoose.Schema.Types.Mixed
    // Store before/after values for updates
    // Example: { before: { name: 'Old Name' }, after: { name: 'New Name' } }
  },
  
  // Additional metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed
    // Store any additional context (IP address, user agent, etc.)
  },
  
  // Request information
  ipAddress: {
    type: String,
    trim: true
  },
  userAgent: {
    type: String,
    trim: true
  }
}, {
  timestamps: { createdAt: true, updatedAt: false }
  // Only track creation time (logs are immutable)
});

// Indexes for performance
activityLogSchema.index({ action: 1, createdAt: -1 });
activityLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
activityLogSchema.index({ performedBy: 1, createdAt: -1 });
activityLogSchema.index({ departmentId: 1, createdAt: -1 });
activityLogSchema.index({ folderId: 1, createdAt: -1 });
activityLogSchema.index({ createdAt: -1 });

// Virtual for formatted date
activityLogSchema.virtual('createdAtFormatted').get(function() {
  return this.createdAt.toLocaleString();
});

// Virtual for time ago
activityLogSchema.virtual('timeAgo').get(function() {
  if (!this.createdAt) return '';
  
  const now = new Date();
  const diff = now - this.createdAt;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);
  
  if (years > 0) return `${years} year${years > 1 ? 's' : ''} ago`;
  if (months > 0) return `${months} month${months > 1 ? 's' : ''} ago`;
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'Just now';
});

// Static method to create activity log
activityLogSchema.statics.logActivity = async function(data) {
  try {
    const log = await this.create(data);
    return log;
  } catch (error) {
    console.error('Error creating activity log:', error);
    // Don't throw error - logging should not break the main flow
    return null;
  }
};

// Static method to get recent activities
activityLogSchema.statics.getRecentActivities = function(limit = 50, filters = {}) {
  const query = {};
  
  if (filters.userId) query.performedBy = filters.userId;
  if (filters.entityType) query.entityType = filters.entityType;
  if (filters.entityId) query.entityId = filters.entityId;
  if (filters.departmentId) query.departmentId = filters.departmentId;
  if (filters.action) query.action = filters.action;
  
  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('performedBy', 'name email avatar')
    .lean();
};

// Static method to get user activity
activityLogSchema.statics.getUserActivity = function(userId, limit = 50) {
  return this.find({ performedBy: userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('departmentId', 'name')
    .populate('folderId', 'name')
    .lean();
};

// Static method to get entity history
activityLogSchema.statics.getEntityHistory = function(entityType, entityId, limit = 50) {
  return this.find({ entityType, entityId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('performedBy', 'name email avatar')
    .lean();
};

// Static method to get department activity
activityLogSchema.statics.getDepartmentActivity = function(departmentId, limit = 100) {
  return this.find({ departmentId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('performedBy', 'name email avatar')
    .lean();
};

// Static method to get activity stats
activityLogSchema.statics.getActivityStats = async function(filters = {}) {
  const matchStage = {};
  
  if (filters.startDate || filters.endDate) {
    matchStage.createdAt = {};
    if (filters.startDate) matchStage.createdAt.$gte = new Date(filters.startDate);
    if (filters.endDate) matchStage.createdAt.$lte = new Date(filters.endDate);
  }
  
  if (filters.userId) matchStage.performedBy = new mongoose.Types.ObjectId(filters.userId);
  if (filters.departmentId) matchStage.departmentId = new mongoose.Types.ObjectId(filters.departmentId);
  
  const stats = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$action',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } }
  ]);
  
  const totalActivities = stats.reduce((sum, stat) => sum + stat.count, 0);
  
  return {
    totalActivities,
    byAction: stats
  };
};

// Prevent updates to activity logs (immutable)
activityLogSchema.pre('findOneAndUpdate', function(next) {
  next(new Error('Activity logs are immutable and cannot be updated'));
});

activityLogSchema.pre('updateOne', function(next) {
  next(new Error('Activity logs are immutable and cannot be updated'));
});

activityLogSchema.pre('updateMany', function(next) {
  next(new Error('Activity logs are immutable and cannot be updated'));
});

const ActivityLogModel = mongoose.model('ActivityLog', activityLogSchema);

export default ActivityLogModel;