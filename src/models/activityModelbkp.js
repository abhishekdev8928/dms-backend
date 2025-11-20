import mongoose from 'mongoose';

// Define the subdocument schema for items in bulk operations
const ItemSnapshotSchema = new mongoose.Schema({
  id: String,
  name: {
    type: String,
    required: true
  },
  extension: {
    type: String,
    default: ''
  },
  type: {
    type: String,
    default: ''
  },
  size: {
    type: Number,
    default: 0
  },
  folderPath: String,
  folderName: String
}, { _id: false });

// 📸 Parent Folder Snapshot Schema
const ParentFolderSnapshotSchema = new mongoose.Schema({
  id: String,
  name: String,
  path: String,
  type: {
    type: String,
    enum: ['folder', 'department'],
    default: 'folder'
  }
}, { _id: false });

const activityLogSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: [true, 'User ID is required'],
    index: true
  },
  
  // 📸 COMPLETE snapshot of user at time of action
  userSnapshot: {
    id: String,
    name: String,
    email: String,
    avatar: String
  },
  
  action: {
    type: String,
    required: [true, 'Action is required'],
    enum: [
      'FILES_UPLOADED',
      'FILE_UPLOADED',
      'FILE_VERSION_UPLOADED',
      'FILE_RENAMED',
      'FILE_MOVED',
      'FILE_DELETED',
      'FILE_RESTORED',
      'FILE_DOWNLOADED',
      'FILE_PREVIEWED',
      'FOLDER_CREATED',
      'FOLDER_RENAMED',
      'FOLDER_MOVED',
      'FOLDER_DELETED',
      'FOLDER_RESTORED',
      'ITEMS_RESTORED'
    ],
    index: true
  },
  
  targetType: {
    type: String,
    required: [true, 'Target type is required'],
    enum: ['file', 'folder', 'multiple'],
    index: true
  },
  
  // 📸 COMPLETE snapshot of the target(s)
  target: {
    id: String,
    name: String,
    extension: String,
    type: String,
    size: Number,
    path: String,
    
    // For renames
    oldName: String,
    newName: String,
    
    // For moves
    oldPath: String,
    newPath: String,
    oldFolderName: String,
    newFolderName: String,
    
    // For versions
    version: Number,
    
    // For folder operations
    folderName: String,
    folderPath: String
  },
  
  // 📸 Parent Folder Snapshot (unified)
  parentFolder: ParentFolderSnapshotSchema,
  
  // For bulk operations (multiple files/folders)
  bulkOperation: {
    itemCount: {
      type: Number,
      default: 0
    },
    items: [ItemSnapshotSchema]
  }
}, {
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'activitylogs'
});

// Compound indexes
activityLogSchema.index({ userId: 1, createdAt: -1 });
activityLogSchema.index({ 'target.id': 1, createdAt: -1 });
activityLogSchema.index({ action: 1, createdAt: -1 });
activityLogSchema.index({ createdAt: -1 });

// ============================================
// HELPER FUNCTION - Get Parent Folder Snapshot
// ============================================

/**
 * Get parent folder snapshot from parentId
 * @param {String|ObjectId} parentId - Parent folder or department ID
 * @returns {Object} Parent folder snapshot
 */
async function getParentFolderSnapshot(parentId) {
  if (!parentId) return null;
  
  const FolderModel = mongoose.model('Folder');
  const DepartmentModel = mongoose.model('Department');
  
  try {
    // Try to find as Folder first
    let parent = await FolderModel.findById(parentId).lean();
    
    if (parent) {
      return {
        id: parent._id.toString(),
        name: parent.name,
        path: parent.path,
        type: 'folder'
      };
    }
    
    // Try to find as Department
    parent = await DepartmentModel.findById(parentId).lean();
    
    if (parent) {
      return {
        id: parent._id.toString(),
        name: parent.name,
        path: `/${parent.name}`,
        type: 'department'
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error getting parent folder snapshot:', error);
    return null;
  }
}

// ============================================
// STATIC METHODS
// ============================================

/**
 * Log bulk file upload - Called after all files are uploaded
 */
activityLogSchema.statics.logBulkFileUpload = async function(userId, parentId, files, userInfo) {
  try {
    // Validate inputs
    if (!userId) {
      throw new Error('userId is required');
    }
    if (!userInfo || (!userInfo.name && !userInfo.username) || !userInfo.email) {
      throw new Error('userInfo must include name/username and email');
    }
    if (!files || !Array.isArray(files) || files.length === 0) {
      throw new Error('files must be a non-empty array');
    }

    console.log('🔍 logBulkFileUpload - files count:', files.length);

    // Create user snapshot
    const userSnapshot = {
      id: userId.toString(),
      name: userInfo.name || userInfo.username,
      email: userInfo.email,
      avatar: userInfo.avatar || null
    };

    // Get parent folder snapshot
    const parentFolder = await getParentFolderSnapshot(parentId);

    // Single file - create regular FILE_UPLOADED log
    if (files.length === 1) {
      const file = files[0];
      const folderPath = parentFolder?.path || '/';
      const fullPath = folderPath === '/' 
        ? `/${file.name}` 
        : `${folderPath}/${file.name}`;
      
      const logData = {
        userId: userId.toString(),
        userSnapshot,
        action: 'FILE_UPLOADED',
        targetType: 'file',
        target: {
          id: file.id?.toString() || file._id?.toString(),
          name: file.name,
          extension: file.extension || '',
          type: file.type || '',
          size: Number(file.size) || 0,
          path: fullPath
        },
        parentFolder
      };
      
      console.log('✅ Creating single file log');
      return await this.create(logData);
    }
    
    // Multiple files - create bulk log
    const items = files.map(f => ({
      id: f.id?.toString() || f._id?.toString(),
      name: f.name,
      extension: f.extension || '',
      type: f.type || '',
      size: Number(f.size) || 0,
      folderPath: parentFolder?.path,
      folderName: parentFolder?.name
    }));
    
    console.log('🔍 Items to be saved:', JSON.stringify(items, null, 2));
    
    const logData = {
      userId: userId.toString(),
      userSnapshot,
      action: 'FILES_UPLOADED',
      targetType: 'multiple',
      parentFolder,
      bulkOperation: {
        itemCount: files.length,
        items: items
      }
    };
    
    console.log('✅ Creating bulk log with', items.length, 'items');
    
    const log = await this.create(logData);
    console.log('✅ Bulk log created successfully:', log._id);
    return log;
  } catch (error) {
    console.error('❌ Error in logBulkFileUpload:', error);
    throw error;
  }
};

/**
 * Log single file upload
 */
activityLogSchema.statics.logFileUpload = async function(userId, file, parentId, userInfo) {
  try {
    if (!userInfo || !userInfo.name || !userInfo.email) {
      throw new Error('userInfo with name and email is required');
    }

    const parentFolder = await getParentFolderSnapshot(parentId);
    const folderPath = parentFolder?.path || '/';
    const fullPath = folderPath === '/' 
      ? `/${file.name}` 
      : `${folderPath}/${file.name}`;

    return await this.create({
      userId: userId.toString(),
      userSnapshot: {
        id: userId.toString(),
        name: userInfo.name,
        email: userInfo.email,
        avatar: userInfo.avatar || null
      },
      action: 'FILE_UPLOADED',
      targetType: 'file',
      target: {
        id: file.id?.toString() || file._id?.toString(),
        name: file.name,
        extension: file.extension || '',
        type: file.type || '',
        size: Number(file.size) || 0,
        path: fullPath
      },
      parentFolder
    });
  } catch (error) {
    console.error('Error logging file upload:', error);
    throw error;
  }
};

/**
 * Log file rename
 */
activityLogSchema.statics.logFileRename = async function(userId, file, oldName, newName, userInfo) {
  try {
    if (!userInfo || !userInfo.name || !userInfo.email) {
      throw new Error('userInfo with name and email is required');
    }

    const parentFolder = await getParentFolderSnapshot(file.parent_id);

    return await this.create({
      userId: userId.toString(),
      userSnapshot: {
        id: userId.toString(),
        name: userInfo.name,
        email: userInfo.email,
        avatar: userInfo.avatar || null
      },
      action: 'FILE_RENAMED',
      targetType: 'file',
      target: {
        id: file.id?.toString() || file._id?.toString(),
        oldName: oldName,
        newName: newName,
        extension: file.extension || '',
        type: file.type || '',
        path: file.path || ''
      },
      parentFolder
    });
  } catch (error) {
    console.error('Error logging file rename:', error);
    throw error;
  }
};

/**
 * Log file move
 */
activityLogSchema.statics.logFileMove = async function(userId, file, fromParentId, toParentId, userInfo) {
  try {
    if (!userInfo || !userInfo.name || !userInfo.email) {
      throw new Error('userInfo with name and email is required');
    }

    const oldParentFolder = await getParentFolderSnapshot(fromParentId);
    const newParentFolder = await getParentFolderSnapshot(toParentId);

    const oldPath = oldParentFolder?.path || '/';
    const newPath = newParentFolder?.path || '/';

    return await this.create({
      userId: userId.toString(),
      userSnapshot: {
        id: userId.toString(),
        name: userInfo.name,
        email: userInfo.email,
        avatar: userInfo.avatar || null
      },
      action: 'FILE_MOVED',
      targetType: 'file',
      target: {
        id: file.id?.toString() || file._id?.toString(),
        name: file.name,
        extension: file.extension || '',
        type: file.type || '',
        oldPath: `${oldPath}/${file.name}`,
        newPath: `${newPath}/${file.name}`,
        oldFolderName: oldParentFolder?.name || 'root',
        newFolderName: newParentFolder?.name || 'root'
      },
      parentFolder: newParentFolder // Current location after move
    });
  } catch (error) {
    console.error('Error logging file move:', error);
    throw error;
  }
};

/**
 * Log file deletion
 */
activityLogSchema.statics.logFileDelete = async function(userId, file, userInfo) {
  try {
    if (!userInfo || !userInfo.name || !userInfo.email) {
      throw new Error('userInfo with name and email is required');
    }

    const parentFolder = await getParentFolderSnapshot(file.parent_id);

    return await this.create({
      userId: userId.toString(),
      userSnapshot: {
        id: userId.toString(),
        name: userInfo.name,
        email: userInfo.email,
        avatar: userInfo.avatar || null
      },
      action: 'FILE_DELETED',
      targetType: 'file',
      target: {
        id: file.id?.toString() || file._id?.toString(),
        name: file.name,
        extension: file.extension || '',
        type: file.type || '',
        size: Number(file.size) || 0,
        path: file.path || ''
      },
      parentFolder
    });
  } catch (error) {
    console.error('Error logging file delete:', error);
    throw error;
  }
};

/**
 * Log folder creation
 */
activityLogSchema.statics.logFolderCreate = async function(userId, folder, parentId, userInfo) {
  try {
    if (!userInfo || !userInfo.name || !userInfo.email) {
      throw new Error('userInfo with name and email is required');
    }

    const parentFolder = await getParentFolderSnapshot(parentId);
    const folderPath = folder.path || (parentFolder?.path === '/' 
      ? `/${folder.name}` 
      : `${parentFolder?.path}/${folder.name}`);

    return await this.create({
      userId: userId.toString(),
      userSnapshot: {
        id: userId.toString(),
        name: userInfo.name,
        email: userInfo.email,
        avatar: userInfo.avatar || null
      },
      action: 'FOLDER_CREATED',
      targetType: 'folder',
      target: {
        id: folder.id?.toString() || folder._id?.toString(),
        folderName: folder.name,
        folderPath: folderPath
      },
      parentFolder
    });
  } catch (error) {
    console.error('Error logging folder create:', error);
    throw error;
  }
};

/**
 * Log folder rename
 */
activityLogSchema.statics.logFolderRename = async function(userId, folder, oldName, newName, userInfo) {
  try {
    if (!userInfo || !userInfo.name || !userInfo.email) {
      throw new Error('userInfo with name and email is required');
    }

    const parentFolder = await getParentFolderSnapshot(folder.parent_id);

    return await this.create({
      userId: userId.toString(),
      userSnapshot: {
        id: userId.toString(),
        name: userInfo.name,
        email: userInfo.email,
        avatar: userInfo.avatar || null
      },
      action: 'FOLDER_RENAMED',
      targetType: 'folder',
      target: {
        id: folder.id?.toString() || folder._id?.toString(),
        oldName: oldName,
        newName: newName,
        folderPath: folder.path || ''
      },
      parentFolder
    });
  } catch (error) {
    console.error('Error logging folder rename:', error);
    throw error;
  }
};

/**
 * Log bulk restore operation
 */
activityLogSchema.statics.logBulkRestore = async function(userId, items, userInfo) {
  try {
    if (!userInfo || !userInfo.name || !userInfo.email) {
      throw new Error('userInfo with name and email is required');
    }

    const userSnapshot = {
      id: userId.toString(),
      name: userInfo.name,
      email: userInfo.email,
      avatar: userInfo.avatar || null
    };

    // Single item restore
    if (items.length === 1) {
      const item = items[0];
      const parentFolder = await getParentFolderSnapshot(item.parent_id);
      
      if (item.type === 'file') {
        return await this.create({
          userId: userId.toString(),
          userSnapshot,
          action: 'FILE_RESTORED',
          targetType: 'file',
          target: {
            id: item.id?.toString() || item._id?.toString(),
            name: item.name,
            extension: item.extension || '',
            type: item.type || '',
            size: Number(item.size) || 0,
            path: item.path || ''
          },
          parentFolder
        });
      } else {
        return await this.create({
          userId: userId.toString(),
          userSnapshot,
          action: 'FOLDER_RESTORED',
          targetType: 'folder',
          target: {
            id: item.id?.toString() || item._id?.toString(),
            folderName: item.name,
            folderPath: item.path || ''
          },
          parentFolder
        });
      }
    }
    
    // Multiple items restore
    const itemSnapshots = items.map(item => ({
      id: item.id?.toString() || item._id?.toString(),
      name: item.name,
      extension: item.extension || '',
      type: item.itemType || item.type || '',
      size: Number(item.size) || 0,
      folderPath: item.path || '',
      folderName: item.itemType === 'folder' ? item.name : null
    }));
    
    return await this.create({
      userId: userId.toString(),
      userSnapshot,
      action: 'ITEMS_RESTORED',
      targetType: 'multiple',
      bulkOperation: {
        itemCount: items.length,
        items: itemSnapshots
      }
    });
  } catch (error) {
    console.error('Error logging bulk restore:', error);
    throw error;
  }
};

/**
 * Get user's recent activities grouped by time period
 */
activityLogSchema.statics.getUserActivities = async function(userId, limit = 100) {
  const activities = await this.find({ userId: userId.toString() })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  
  const grouped = {
    today: [],
    yesterday: [],
    lastWeek: [],
    lastMonth: [],
    older: []
  };
  
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const lastWeekStart = new Date(todayStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastMonthStart = new Date(todayStart);
  lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
  
  activities.forEach(activity => {
    const activityDate = new Date(activity.createdAt);
    
    if (activityDate >= todayStart) {
      grouped.today.push(activity);
    } else if (activityDate >= yesterdayStart) {
      grouped.yesterday.push(activity);
    } else if (activityDate >= lastWeekStart) {
      grouped.lastWeek.push(activity);
    } else if (activityDate >= lastMonthStart) {
      grouped.lastMonth.push(activity);
    } else {
      grouped.older.push(activity);
    }
  });
  
  return grouped;
};

/**
 * Get entity history
 */
activityLogSchema.statics.getEntityHistory = function(targetId, limit = 50) {
  const idString = targetId.toString();
  
  return this.find({ 
    $or: [
      { 'target.id': idString },
      { 'bulkOperation.items.id': idString }
    ]
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

// ============================================
// INSTANCE METHODS
// ============================================

/**
 * Generate human-readable message
 */
activityLogSchema.methods.getMessage = function() {
  const { action, target, bulkOperation, userSnapshot, parentFolder } = this;
  const userName = userSnapshot?.name || 'You';
  
  switch (action) {
    case 'FILES_UPLOADED':
      const location = parentFolder?.name || 'root';
      return `${userName} uploaded ${bulkOperation.itemCount} items to ${location}`;
    
    case 'FILE_UPLOADED':
      return `${userName} uploaded ${target.name}`;
    
    case 'FILE_VERSION_UPLOADED':
      return `${userName} uploaded version ${target.version} of ${target.name}`;
    
    case 'FILE_RENAMED':
      return `${userName} renamed ${target.oldName} to ${target.newName}`;
    
    case 'FILE_MOVED':
      const toFolder = target.newFolderName || 'root';
      return `${userName} moved ${target.name} to ${toFolder}`;
    
    case 'FILE_DELETED':
      return `${userName} moved ${target.name} to the bin`;
    
    case 'FILE_RESTORED':
      return `${userName} restored ${target.name}`;
    
    case 'FILE_DOWNLOADED':
      return `${userName} downloaded ${target.name}`;
    
    case 'FILE_PREVIEWED':
      return `${userName} previewed ${target.name}`;
    
    case 'FOLDER_CREATED':
      return `${userName} created folder ${target.folderName}`;
    
    case 'FOLDER_RENAMED':
      return `${userName} renamed folder ${target.oldName} to ${target.newName}`;
    
    case 'FOLDER_MOVED':
      const destFolder = target.newFolderName || 'root';
      return `${userName} moved folder ${target.folderName} to ${destFolder}`;
    
    case 'FOLDER_DELETED':
      return `${userName} moved folder ${target.folderName} to the bin`;
    
    case 'FOLDER_RESTORED':
      return `${userName} restored folder ${target.folderName}`;
    
    case 'ITEMS_RESTORED':
      return `${userName} restored ${bulkOperation.itemCount} items`;
    
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

/**
 * Get time label
 */
activityLogSchema.methods.getTimeLabel = function() {
  const date = new Date(this.createdAt);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const day = date.getDate();
  const month = date.toLocaleString('en-US', { month: 'short' });
  
  return `${hours}:${minutes} ${day} ${month}`;
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

// Clear any existing model to avoid caching issues
if (mongoose.models.ActivityLog) {
  delete mongoose.models.ActivityLog;
}

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

export default ActivityLog;