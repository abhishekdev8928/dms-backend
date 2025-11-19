import mongoose from 'mongoose';

const activityLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  
  action: {
    type: String,
    required: [true, 'Action is required'],
    enum: [
      'FOLDER_CREATED',
      'FOLDER_RENAMED',
      'FOLDER_MOVED',
      'FOLDER_DELETED',
      'FOLDER_RESTORED',
      'FILE_UPLOADED',
      'FILE_VERSION_UPLOADED',
      'FILE_RENAMED',
      'FILE_MOVED',
      'FILE_DELETED',
      'FILE_RESTORED',
      'FILE_DOWNLOADED',
      'FILE_PREVIEWED',
      'BULK_RESTORE'
    ],
    index: true
  },
  
  targetType: {
    type: String,
    required: [true, 'Target type is required'],
    enum: ['file', 'folder'],
    index: true
  },
  
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Target ID is required'],
    index: true
  },
  
  metadata: {
    oldName: String,
    newName: String,
    version: Number,
    fromFolder: String,
    toFolder: String,
    fromFolderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Folder'
    },
    toFolderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Folder'
    },
    itemCount: Number,
    bulkGroupId: String,           // For grouping multiple uploads
    fileName: String,
    fileExtension: String,
    folderName: String,
    fileType: String,
    parentFolderId: mongoose.Schema.Types.ObjectId,  // NEW: For upload grouping
    parentFolderName: String       // NEW: For display
  }
}, {
  timestamps: { createdAt: true, updatedAt: false }
});

// Compound indexes
activityLogSchema.index({ userId: 1, createdAt: -1 });
activityLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
activityLogSchema.index({ action: 1, createdAt: -1 });
activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ 'metadata.bulkGroupId': 1 });

// ============================================
// STATIC METHODS
// ============================================

/**
 * Create activity log entry with auto-grouping for uploads
 */
activityLogSchema.statics.logActivity = async function(data) {
  try {
    // Auto-generate bulkGroupId for FILE_UPLOADED actions
    if (data.action === 'FILE_UPLOADED' && !data.metadata?.bulkGroupId) {
      // Check if there's a recent upload to the same folder (within 5 seconds)
      const fiveSecondsAgo = new Date(Date.now() - 5000);
      
      const recentUpload = await this.findOne({
        userId: data.userId,
        action: 'FILE_UPLOADED',
        'metadata.parentFolderId': data.metadata?.parentFolderId,
        createdAt: { $gte: fiveSecondsAgo }
      }).sort({ createdAt: -1 });

      if (recentUpload && recentUpload.metadata?.bulkGroupId) {
        // Use existing group
        if (!data.metadata) data.metadata = {};
        data.metadata.bulkGroupId = recentUpload.metadata.bulkGroupId;
      } else {
        // Create new group
        if (!data.metadata) data.metadata = {};
        data.metadata.bulkGroupId = `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }
    }

    const log = await this.create(data);
    return log;
  } catch (error) {
    console.error('Error creating activity log:', error);
    return null;
  }
};

/**
 * Get activities with filters and pagination
 */
activityLogSchema.statics.getActivities = function(filters = {}, limit = 50) {
  const query = {};
  
  if (filters.userId) query.userId = filters.userId;
  if (filters.targetType) query.targetType = filters.targetType;
  if (filters.targetId) query.targetId = filters.targetId;
  if (filters.action) query.action = filters.action;
  if (filters.bulkGroupId) query['metadata.bulkGroupId'] = filters.bulkGroupId;
  
  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('userId', 'name email avatar')
    .lean();
};

/**
 * Get user's recent activities (GROUPED for display)
 */
activityLogSchema.statics.getUserActivities = function(userId, limit = 50) {
  return this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

/**
 * Get entity history
 */
activityLogSchema.statics.getEntityHistory = function(targetType, targetId, limit = 50) {
  return this.find({ targetType, targetId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('userId', 'name email avatar')
    .lean();
};

/**
 * Get activities grouped by date AND by bulkGroupId (NEW)
 */
activityLogSchema.statics.getGroupedActivities = async function(userId, limit = 100) {
  const activities = await this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('userId', 'name email avatar')
    .lean();
  
  // First group by time periods
  const grouped = {
    today: [],
    yesterday: [],
    lastWeek: [],
    older: []
  };
  
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const lastWeekStart = new Date(todayStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  
  activities.forEach(activity => {
    const activityDate = new Date(activity.createdAt);
    
    if (activityDate >= todayStart) {
      grouped.today.push(activity);
    } else if (activityDate >= yesterdayStart) {
      grouped.yesterday.push(activity);
    } else if (activityDate >= lastWeekStart) {
      grouped.lastWeek.push(activity);
    } else {
      grouped.older.push(activity);
    }
  });
  
  // Now collapse FILE_UPLOADED activities with same bulkGroupId
  const collapseGroups = (activities) => {
    const result = [];
    const processedGroups = new Set();
    
    for (const activity of activities) {
      // Check if it's a FILE_UPLOADED with bulkGroupId
      if (activity.action === 'FILE_UPLOADED' && activity.metadata?.bulkGroupId) {
        const groupId = activity.metadata.bulkGroupId;
        
        // Skip if already processed
        if (processedGroups.has(groupId)) continue;
        
        // Find all activities in this group
        const groupActivities = activities.filter(
          a => a.action === 'FILE_UPLOADED' && a.metadata?.bulkGroupId === groupId
        );
        
        if (groupActivities.length > 1) {
          // Create grouped activity
          result.push({
            ...activity,
            _grouped: true,
            _groupCount: groupActivities.length,
            _groupItems: groupActivities.map(a => ({
              targetId: a.targetId,
              fileName: a.metadata?.fileName,
              fileExtension: a.metadata?.fileExtension,
              fileType: a.metadata?.fileType
            }))
          });
        } else {
          // Single item, push as-is
          result.push(activity);
        }
        
        processedGroups.add(groupId);
      } else {
        // Non-upload action, push as-is
        result.push(activity);
      }
    }
    
    return result;
  };
  
  return {
    today: collapseGroups(grouped.today),
    yesterday: collapseGroups(grouped.yesterday),
    lastWeek: collapseGroups(grouped.lastWeek),
    older: collapseGroups(grouped.older)
  };
};

/**
 * Log bulk restore operation
 */
activityLogSchema.statics.logBulkRestore = async function(userId, items) {
  const bulkGroupId = `restore-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const logs = items.map(item => ({
    userId,
    action: 'BULK_RESTORE',
    targetType: item.type,
    targetId: item.id,
    metadata: {
      bulkGroupId,
      itemCount: items.length,
      fileName: item.type === 'file' ? item.name : undefined,
      fileExtension: item.type === 'file' ? item.extension : undefined,
      folderName: item.type === 'folder' ? item.name : undefined
    }
  }));
  
  try {
    await this.insertMany(logs);
    return { success: true, bulkGroupId, count: logs.length };
  } catch (error) {
    console.error('Error logging bulk restore:', error);
    return { success: false, error: error.message };
  }
};

// ============================================
// INSTANCE METHODS
// ============================================

/**
 * Generate human-readable message (UPDATED)
 */
activityLogSchema.methods.getMessage = function() {
  const { action, metadata, _grouped, _groupCount } = this;
  
  // Handle grouped uploads
  if (_grouped && _groupCount > 1) {
    const folderName = metadata.parentFolderName || 'a folder';
    return `You uploaded ${_groupCount} items to ${folderName}`;
  }
  
  switch (action) {
    case 'FILE_UPLOADED':
      return `You uploaded ${metadata.fileName}`;
    
    case 'FILE_VERSION_UPLOADED':
      return `You uploaded version ${metadata.version} of ${metadata.fileName}`;
    
    case 'FILE_RENAMED':
      return `You renamed ${metadata.oldName} → ${metadata.newName}`;
    
    case 'FILE_MOVED':
      return `You moved ${metadata.fileName} to ${metadata.toFolder}`;
    
    case 'FILE_DELETED':
      return `You moved ${metadata.fileName} to the bin`;
    
    case 'FILE_RESTORED':
      return `You restored ${metadata.fileName}`;
    
    case 'FILE_DOWNLOADED':
      return `You downloaded ${metadata.fileName}`;
    
    case 'FILE_PREVIEWED':
      return `You previewed ${metadata.fileName}`;
    
    case 'FOLDER_CREATED':
      return `You created folder ${metadata.folderName}`;
    
    case 'FOLDER_RENAMED':
      return `You renamed folder ${metadata.oldName} → ${metadata.newName}`;
    
    case 'FOLDER_MOVED':
      return `You moved folder ${metadata.folderName} into ${metadata.toFolder}`;
    
    case 'FOLDER_DELETED':
      return `You moved folder ${metadata.folderName} to the bin`;
    
    case 'FOLDER_RESTORED':
      return `You restored folder ${metadata.folderName}`;
    
    case 'BULK_RESTORE':
      return `You restored ${metadata.itemCount} items`;
    
    default:
      return 'Unknown action';
  }
};

/**
 * Get formatted timestamp
 */
activityLogSchema.methods.getFormattedTime = function() {
  const date = new Date(this.createdAt);
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const time = `${hours}:${minutes}`;
  const day = date.getDate();
  const month = date.toLocaleString('en-US', { month: 'short' });
  
  return `${time} · ${day} ${month}`;
};

// ============================================
// MIDDLEWARE - Prevent updates
// ============================================

activityLogSchema.pre('findOneAndUpdate', function(next) {
  next(new Error('Activity logs are immutable and cannot be updated'));
});

activityLogSchema.pre('updateOne', function(next) {
  next(new Error('Activity logs are immutable and cannot be updated'));
});

activityLogSchema.pre('updateMany', function(next) {
  next(new Error('Activity logs are immutable and cannot be updated'));
});

// ============================================
// HELPER
// ============================================
activityLogSchema.statics.getFileExtension = function(filename) {
  if (!filename) return null;
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : null;
};

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

export default ActivityLog;