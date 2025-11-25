import mongoose from 'mongoose';

// ============================================
// SUBDOCUMENT SCHEMAS
// ============================================

// Ancestor in the hierarchy (for breadcrumb trail)
const AncestorSchema = new mongoose.Schema({
  id: String,
  name: String,
  type: {
    type: String,
    enum: ['department', 'folder']
  }
}, { _id: false });

const TargetSchema = new mongoose.Schema({
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
  oldAncestors: [AncestorSchema],
  newAncestors: [AncestorSchema],
  
  // For versions
  version: Number,
  newVersion: Number,  // ✅ NEW - for restore operations (stores the new version number created)
  
  // For folder operations
  folderName: String,
  folderPath: String
}, { _id: false });

// Item snapshot for bulk operations
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

// Parent folder snapshot (immediate parent only)
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

// ============================================
// MAIN ACTIVITY LOG SCHEMA
// ============================================

const activityLogSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: [true, 'User ID is required'],
    index: true
  },
  
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
    'FILE_VERSION_RESTORED',
    'FILE_RENAMED',
    'FILE_MOVED',
    'ITEMS_DELETED',
    'FILE_DELETED',
    'FILE_RESTORED',
    'FILE_DOWNLOADED',
    'FILE_PREVIEWED',
    'FOLDER_CREATED',
    'FOLDER_RENAMED',
    'FOLDER_MOVED',
    'FOLDER_DELETED',
    'FOLDER_RESTORED',
    'ITEMS_RESTORED',
    'ITEMS_PERMANENTLY_DELETED',     // ✅ ADD THIS
    'FILE_PERMANENTLY_DELETED',      // ✅ ADD THIS
    'FOLDER_PERMANENTLY_DELETED'     // ✅ ADD THIS
  ],
  index: true
},
  
  targetType: {
    type: String,
    required: [true, 'Target type is required'],
    enum: ['file', 'folder', 'multiple'],
    index: true
  },
  
  target: TargetSchema,
  parentFolder: ParentFolderSnapshotSchema,
  ancestors: [AncestorSchema],
  fullPath: String,
  
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

if (mongoose.models.ActivityLog) {
  delete mongoose.models.ActivityLog;
  delete mongoose.connection.models.ActivityLog;
}

// ============================================
// INDEXES
// ============================================

activityLogSchema.index({ userId: 1, createdAt: -1 });
activityLogSchema.index({ 'target.id': 1, createdAt: -1 });
activityLogSchema.index({ action: 1, createdAt: -1 });
activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ 'ancestors.id': 1, createdAt: -1 }); // NEW: Query by any ancestor
activityLogSchema.index({ fullPath: 1, createdAt: -1 }); // NEW: Search by path

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get full ancestor chain from root to target entity
 * @param {String|ObjectId} entityId - Starting entity ID (folder or department)
 * @returns {Array} Array of ancestors ordered from root to immediate parent
 */
async function getAncestorChain(entityId) {
  if (!entityId) return [];
  
  const ancestors = [];
  const FolderModel = mongoose.model('Folder');
  const DepartmentModel = mongoose.model('Department');
  
  let currentId = entityId;
  let depth = 0;
  const MAX_DEPTH = 20; // Prevent infinite loops
  
  try {
    while (currentId && depth < MAX_DEPTH) {
      // Try to find as Folder first
      let entity = await FolderModel.findById(currentId)
        .select('_id name parent_id')
        .lean();
      
      if (entity) {
        // Add folder to beginning of array (we're walking backwards)
        ancestors.unshift({
          id: entity._id.toString(),
          name: entity.name,
          type: 'folder'
        });
        currentId = entity.parent_id;
      } else {
        // Try to find as Department
        entity = await DepartmentModel.findById(currentId)
          .select('_id name')
          .lean();
        
        if (entity) {
          // Add department to beginning
          ancestors.unshift({
            id: entity._id.toString(),
            name: entity.name,
            type: 'department'
          });
          break; // Departments are root level
        } else {
          // Entity not found, stop
          break;
        }
      }
      
      depth++;
    }
    
    return ancestors;
  } catch (error) {
    console.error('Error getting ancestor chain:', error);
    return [];
  }
}

/**
 * Build full path from ancestors and item name
 * @param {Array} ancestors - Array of ancestor objects
 * @param {String} itemName - Name of the item
 * @returns {String} Full path like "/Engineering/Projects/Q4/file.pdf"
 */
function buildFullPath(ancestors, itemName) {
  if (!ancestors || ancestors.length === 0) {
    return `/${itemName}`;
  }
  
  const pathParts = ancestors.map(a => a.name);
  if (itemName) {
    pathParts.push(itemName);
  }
  
  return '/' + pathParts.join('/');
}

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
 * Log bulk file upload
 */
/**
 * FIXED: Log bulk file upload
 * The issue was in the single file case - target fields should be set individually, not as an object
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

    // Get parent folder snapshot and ancestor chain
    const parentFolder = await getParentFolderSnapshot(parentId);
    const ancestors = await getAncestorChain(parentId);

    // Single file - create regular FILE_UPLOADED log
    if (files.length === 1) {
      const file = files[0];
      const fullPath = buildFullPath(ancestors, file.name);
      
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
        parentFolder,
        ancestors,
        fullPath
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
    
    const fullPath = buildFullPath(ancestors);
    
    const logData = {
      userId: userId.toString(),
      userSnapshot,
      action: 'FILES_UPLOADED',
      targetType: 'multiple',
      parentFolder,
      ancestors,
      fullPath,
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
    const ancestors = await getAncestorChain(parentId);
    const fullPath = buildFullPath(ancestors, file.name);

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
      parentFolder,
      ancestors,
      fullPath
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
    const ancestors = await getAncestorChain(file.parent_id);
    const fullPath = buildFullPath(ancestors, newName);

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
        path: fullPath
      },
      parentFolder,
      ancestors,
      fullPath
    });
  } catch (error) {
    console.error('Error logging file rename:', error);
    throw error;
  }
};
activityLogSchema.statics.logFileVersionUpload = async function(userId, file, versionNumber, userInfo) {
  try {
    if (!userInfo || !userInfo.name || !userInfo.email) {
      throw new Error('userInfo with name and email is required');
    }

    const parentFolder = await getParentFolderSnapshot(file.parent_id);
    const ancestors = await getAncestorChain(file.parent_id);
    const fullPath = buildFullPath(ancestors, file.name);

    return await this.create({
      userId: userId.toString(),
      userSnapshot: {
        id: userId.toString(),
        name: userInfo.name,
        email: userInfo.email,
        avatar: userInfo.avatar || null
      },
      action: 'FILE_VERSION_UPLOADED',
      targetType: 'file',
      target: {
        id: file.id?.toString() || file._id?.toString(),
        name: file.name,
        extension: file.extension || '',
        type: file.type || '',
        size: Number(file.size) || 0,
        version: versionNumber,
        path: fullPath
      },
      parentFolder,
      ancestors,
      fullPath
    });
  } catch (error) {
    console.error('Error logging file version upload:', error);
    throw error;
  }
};

activityLogSchema.statics.logFileVersionRestore = async function(userId, file, restoredVersionNumber, newVersionNumber, userInfo) {
  try {
    if (!userInfo || !userInfo.name || !userInfo.email) {
      throw new Error('userInfo with name and email is required');
    }

    const parentFolder = await getParentFolderSnapshot(file.parent_id);
    const ancestors = await getAncestorChain(file.parent_id);
    const fullPath = buildFullPath(ancestors, file.name);

    return await this.create({
      userId: userId.toString(),
      userSnapshot: {
        id: userId.toString(),
        name: userInfo.name,
        email: userInfo.email,
        avatar: userInfo.avatar || null
      },
      action: 'FILE_VERSION_RESTORED',
      targetType: 'file',
      target: {
        id: file.id?.toString() || file._id?.toString(),
        name: file.name,
        extension: file.extension || '',
        type: file.type || '',
        size: Number(file.size) || 0,
        version: restoredVersionNumber, // The version that was restored
        newVersion: newVersionNumber,    // The new version number created
        path: fullPath
      },
      parentFolder,
      ancestors,
      fullPath
    });
  } catch (error) {
    console.error('Error logging file version restore:', error);
    throw error;
  }
};
/**
 * 
 * Log file move
 */
activityLogSchema.statics.logFileMove = async function(userId, file, fromParentId, toParentId, userInfo) {
  try {
    if (!userInfo || !userInfo.name || !userInfo.email) {
      throw new Error('userInfo with name and email is required');
    }

    const oldParentFolder = await getParentFolderSnapshot(fromParentId);
    const newParentFolder = await getParentFolderSnapshot(toParentId);
    
    const oldAncestors = await getAncestorChain(fromParentId);
    const newAncestors = await getAncestorChain(toParentId);
    
    const oldPath = buildFullPath(oldAncestors, file.name);
    const newPath = buildFullPath(newAncestors, file.name);

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
        oldPath: oldPath,
        newPath: newPath,
        oldFolderName: oldParentFolder?.name || 'root',
        newFolderName: newParentFolder?.name || 'root',
        oldAncestors: oldAncestors,
        newAncestors: newAncestors
      },
      parentFolder: newParentFolder, // Current location after move
      ancestors: newAncestors,
      fullPath: newPath
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
    const ancestors = await getAncestorChain(file.parent_id);
    const fullPath = buildFullPath(ancestors, file.name);

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
        path: fullPath
      },
      parentFolder,
      ancestors,
      fullPath
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
    const ancestors = await getAncestorChain(parentId);
    const fullPath = buildFullPath(ancestors, folder.name);

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
        folderPath: fullPath
      },
      parentFolder,
      ancestors,
      fullPath
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
    const ancestors = await getAncestorChain(folder.parent_id);
    const fullPath = buildFullPath(ancestors, newName);

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
        folderPath: fullPath
      },
      parentFolder,
      ancestors,
      fullPath
    });
  } catch (error) {
    console.error('Error logging folder rename:', error);
    throw error;
  }
};

/**
 * Log folder move
 */
activityLogSchema.statics.logFolderMove = async function(userId, folder, fromParentId, toParentId, userInfo) {
  try {
    if (!userInfo || !userInfo.name || !userInfo.email) {
      throw new Error('userInfo with name and email is required');
    }

    const oldParentFolder = await getParentFolderSnapshot(fromParentId);
    const newParentFolder = await getParentFolderSnapshot(toParentId);
    
    const oldAncestors = await getAncestorChain(fromParentId);
    const newAncestors = await getAncestorChain(toParentId);
    
    const oldPath = buildFullPath(oldAncestors, folder.name);
    const newPath = buildFullPath(newAncestors, folder.name);

    return await this.create({
      userId: userId.toString(),
      userSnapshot: {
        id: userId.toString(),
        name: userInfo.name,
        email: userInfo.email,
        avatar: userInfo.avatar || null
      },
      action: 'FOLDER_MOVED',
      targetType: 'folder',
      target: {
        id: folder.id?.toString() || folder._id?.toString(),
        folderName: folder.name,
        oldPath: oldPath,
        newPath: newPath,
        oldFolderName: oldParentFolder?.name || 'root',
        newFolderName: newParentFolder?.name || 'root',
        oldAncestors: oldAncestors,
        newAncestors: newAncestors
      },
      parentFolder: newParentFolder,
      ancestors: newAncestors,
      fullPath: newPath
    });
  } catch (error) {
    console.error('Error logging folder move:', error);
    throw error;
  }
};

/**
 * Log folder deletion
 */
activityLogSchema.statics.logFolderDelete = async function(userId, folder, userInfo) {
  try {
    if (!userInfo || !userInfo.name || !userInfo.email) {
      throw new Error('userInfo with name and email is required');
    }

    const parentFolder = await getParentFolderSnapshot(folder.parent_id);
    const ancestors = await getAncestorChain(folder.parent_id);
    const fullPath = buildFullPath(ancestors, folder.name);

    return await this.create({
      userId: userId.toString(),
      userSnapshot: {
        id: userId.toString(),
        name: userInfo.name,
        email: userInfo.email,
        avatar: userInfo.avatar || null
      },
      action: 'FOLDER_DELETED',
      targetType: 'folder',
      target: {
        id: folder.id?.toString() || folder._id?.toString(),
        folderName: folder.name,
        folderPath: fullPath
      },
      parentFolder,
      ancestors,
      fullPath
    });
  } catch (error) {
    console.error('Error logging folder delete:', error);
    throw error;
  }
};

/**
 * Log bulk restore operation
 * FIXED: Now properly handles parent folder and ancestors for multiple items
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
      const ancestors = await getAncestorChain(item.parent_id);
      const fullPath = buildFullPath(ancestors, item.name);
      
      if (item.type === 'file' || item.itemType === 'file' || item.itemType === 'document') {
        return await this.create({
          userId: userId.toString(),
          userSnapshot,
          action: 'FILE_RESTORED',
          targetType: 'file',
          target: {
            id: item.id?.toString() || item._id?.toString(),
            name: item.name,
            extension: item.extension || '',
            type: item.type || item.itemType || '',
            size: Number(item.size) || 0,
            path: fullPath
          },
          parentFolder,
          ancestors,
          fullPath
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
            folderPath: fullPath
          },
          parentFolder,
          ancestors,
          fullPath
        });
      }
    }
    
    // ✅ FIXED: Multiple items restore - now with proper parent folder support
    // Get the most common parent folder for the bulk operation
    // (or you could use the first item's parent)
    const firstItem = items[0];
    const parentFolder = await getParentFolderSnapshot(firstItem.parent_id);
    const ancestors = await getAncestorChain(firstItem.parent_id);
    const fullPath = buildFullPath(ancestors);
    
    // Build item snapshots with proper folder information
    const itemSnapshots = await Promise.all(
      items.map(async (item) => {
        // Get each item's specific parent folder info
        const itemParentFolder = await getParentFolderSnapshot(item.parent_id);
        const itemAncestors = await getAncestorChain(item.parent_id);
        
        return {
          id: item.id?.toString() || item._id?.toString(),
          name: item.name,
          extension: item.extension || '',
          type: item.itemType || item.type || '',
          size: Number(item.size) || 0,
          folderPath: itemParentFolder?.path || item.path || '',
          folderName: itemParentFolder?.name || 
                     (item.itemType === 'folder' || item.type === 'folder' ? item.name : null)
        };
      })
    );
    
    return await this.create({
      userId: userId.toString(),
      userSnapshot,
      action: 'ITEMS_RESTORED',
      targetType: 'multiple',
      parentFolder, // ✅ Now included for bulk operations
      ancestors,     // ✅ Now included for bulk operations
      fullPath,      // ✅ Now included for bulk operations
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

/**
 * Get activities within a specific folder/department (including nested items)
 */
activityLogSchema.statics.getActivitiesInFolder = async function(folderId, limit = 100) {
  const idString = folderId.toString();
  
  return await this.find({
    'ancestors.id': idString
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

/**
 * Search activities by path
 */
activityLogSchema.statics.searchByPath = async function(pathQuery, limit = 100) {
  return await this.find({
    fullPath: { $regex: pathQuery, $options: 'i' }
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};


activityLogSchema.statics.logBulkDelete = async function(userId, items, userInfo) {
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

    // Get the most common parent folder for the bulk operation
    const firstItem = items[0];
    const parentFolder = await getParentFolderSnapshot(firstItem.parent_id);
    const ancestors = await getAncestorChain(firstItem.parent_id);
    const fullPath = buildFullPath(ancestors);
    
    // Build item snapshots with proper folder information
    const itemSnapshots = await Promise.all(
      items.map(async (item) => {
        // Get each item's specific parent folder info
        const itemParentFolder = await getParentFolderSnapshot(item.parent_id);
        const itemAncestors = await getAncestorChain(item.parent_id);
        
        return {
          id: item.id?.toString() || item._id?.toString(),
          name: item.name,
          extension: item.extension || '',
          type: item.itemType || item.type || '',
          size: Number(item.size) || 0,
          folderPath: itemParentFolder?.path || item.path || '',
          folderName: itemParentFolder?.name || 
                     (item.itemType === 'folder' || item.type === 'folder' ? item.name : null),
          // NEW: Include nested items count for folders
          nestedItemsCount: item.nestedItemsCount || 0
        };
      })
    );
    
    return await this.create({
      userId: userId.toString(),
      userSnapshot,
      action: 'ITEMS_DELETED', // Use ITEMS_DELETED instead of FILE_DELETED or FOLDER_DELETED
      targetType: 'multiple',
      parentFolder,
      ancestors,
      fullPath,
      bulkOperation: {
        itemCount: items.length,
        items: itemSnapshots
      }
    });
  } catch (error) {
    console.error('Error logging bulk delete:', error);
    throw error;
  }
};
// ============================================
// INSTANCE METHODS
// ============================================

/**
 * Generate human-readable message
 */
activityLogSchema.methods.getMessage = function() {
  const { action, target, bulkOperation, userSnapshot } = this;
  const userName = userSnapshot?.name || 'You';
  
  switch (action) {
    case 'FILES_UPLOADED':
      return `${userName} uploaded ${bulkOperation.itemCount} items`;
    
    case 'FILE_UPLOADED':
      return `${userName} uploaded ${target.name}`;
    
    case 'FILE_VERSION_UPLOADED':
      return `${userName} uploaded version ${target.version} of ${target.name}`;
    
    case 'FILE_VERSION_RESTORED':  // ✅ NEW CASE
      return `${userName} restored version ${target.version} of ${target.name}`;
    
    case 'FILE_RENAMED':
      return `${userName} renamed ${target.oldName} to ${target.newName}`;
    
    case 'FILE_MOVED':
      return `${userName} moved ${target.name}`;
    
    case 'ITEMS_DELETED':
      return `${userName} moved ${bulkOperation.itemCount} items to the bin`;
    
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
      return `${userName} moved folder ${target.folderName}`;
    
    case 'FOLDER_DELETED':
      return `${userName} moved folder ${target.folderName} to the bin`;
    
    case 'FOLDER_RESTORED':
      return `${userName} restored folder ${target.folderName}`;
    
    case 'ITEMS_RESTORED':
      return `${userName} restored ${bulkOperation.itemCount} items`;
    
     case 'ITEMS_PERMANENTLY_DELETED':
      return `${userName} permanently deleted ${bulkOperation.itemCount} items`;
    
    case 'FILE_PERMANENTLY_DELETED':
      return `${userName} permanently deleted ${target.name}`;
    
    case 'FOLDER_PERMANENTLY_DELETED':
      return `${userName} permanently deleted folder ${target.folderName}`;
    
    default:
      return 'Unknown action';
  }
};

/**
 * Get breadcrumb trail for UI display
 */
activityLogSchema.methods.getBreadcrumb = function() {
  const { ancestors } = this;
  
  if (!ancestors || ancestors.length === 0) {
    return [{ name: 'root', type: 'root' }];
  }
  
  return ancestors.map(a => ({
    id: a.id,
    name: a.name,
    type: a.type
  }));
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

/**
 * Check if activity is in a specific folder (by checking ancestors)
 */
activityLogSchema.methods.isInFolder = function(folderId) {
  const idString = folderId.toString();
  return this.ancestors && this.ancestors.some(a => a.id === idString);
};

/**
 * Get the deepest ancestor (closest parent in the chain)
 */
activityLogSchema.methods.getDeepestAncestor = function() {
  if (!this.ancestors || this.ancestors.length === 0) {
    return null;
  }
  return this.ancestors[this.ancestors.length - 1];
};

/**
 * Get the root ancestor (department level)
 */
activityLogSchema.methods.getRootAncestor = function() {
  if (!this.ancestors || this.ancestors.length === 0) {
    return null;
  }
  return this.ancestors[0];
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


/**
 * Log bulk permanent delete operation
 * This logs when items are permanently deleted from trash
 */
activityLogSchema.statics.logBulkPermanentDelete = async function(userId, items, userInfo) {
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

    // Single item permanent delete
    if (items.length === 1) {
      const item = items[0];
      const parentFolder = await getParentFolderSnapshot(item.parent_id);
      const ancestors = await getAncestorChain(item.parent_id);
      const fullPath = buildFullPath(ancestors, item.name);
      
      if (item.type === 'file' || item.itemType === 'file' || item.itemType === 'document') {
        return await this.create({
          userId: userId.toString(),
          userSnapshot,
          action: 'FILE_PERMANENTLY_DELETED',
          targetType: 'file',
          target: {
            id: item.id?.toString() || item._id?.toString(),
            name: item.name,
            extension: item.extension || '',
            type: item.type || item.itemType || '',
            size: Number(item.size) || 0,
            path: fullPath
          },
          parentFolder,
          ancestors,
          fullPath
        });
      } else {
        return await this.create({
          userId: userId.toString(),
          userSnapshot,
          action: 'FOLDER_PERMANENTLY_DELETED',
          targetType: 'folder',
          target: {
            id: item.id?.toString() || item._id?.toString(),
            folderName: item.name,
            folderPath: fullPath
          },
          parentFolder,
          ancestors,
          fullPath
        });
      }
    }
    
    // Multiple items permanent delete
    const firstItem = items[0];
    const parentFolder = await getParentFolderSnapshot(firstItem.parent_id);
    const ancestors = await getAncestorChain(firstItem.parent_id);
    const fullPath = buildFullPath(ancestors);
    
    // Build item snapshots with proper folder information
    const itemSnapshots = await Promise.all(
      items.map(async (item) => {
        // Get each item's specific parent folder info
        const itemParentFolder = await getParentFolderSnapshot(item.parent_id);
        
        return {
          id: item.id?.toString() || item._id?.toString(),
          name: item.name,
          extension: item.extension || '',
          type: item.itemType || item.type || '',
          size: Number(item.size) || 0,
          folderPath: itemParentFolder?.path || item.path || '',
          folderName: itemParentFolder?.name || 
                     (item.itemType === 'folder' || item.type === 'folder' ? item.name : null)
        };
      })
    );
    
    return await this.create({
      userId: userId.toString(),
      userSnapshot,
      action: 'ITEMS_PERMANENTLY_DELETED',
      targetType: 'multiple',
      parentFolder,
      ancestors,
      fullPath,
      bulkOperation: {
        itemCount: items.length,
        items: itemSnapshots
      }
    });
  } catch (error) {
    console.error('Error logging bulk permanent delete:', error);
    throw error;
  }
};

// ============================================
// MODEL EXPORT
// ============================================

// Clear any existing model to avoid caching issues
if (mongoose.models.ActivityLog) {
  delete mongoose.models.ActivityLog;
}

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

export default ActivityLog;

// ============================================
// USAGE EXAMPLES
// ============================================

/*
// Example 1: Log file upload to nested folder
await ActivityLog.logFileUpload(
  userId,
  {
    _id: fileId,
    name: 'report.pdf',
    extension: 'pdf',
    type: 'application/pdf',
    size: 1024000,
    parent_id: folderId
  },
  folderId, // Parent folder ID (Engineering/Projects/Q4)
  {
    name: 'John Doe',
    email: 'john@example.com',
    avatar: 'avatar.jpg'
  }
);

// This will create an activity with:
// - ancestors: [
//     { id: 'dept1', name: 'Engineering', type: 'department' },
//     { id: 'folder1', name: 'Projects', type: 'folder' },
//     { id: 'folder2', name: 'Q4', type: 'folder' }
//   ]
// - fullPath: '/Engineering/Projects/Q4/report.pdf'
// - getMessage() returns: "John Doe uploaded report.pdf in Engineering → Projects → Q4"

// Example 2: Get all activities in a department (including nested)
const activities = await ActivityLog.getActivitiesInFolder(departmentId, 50);
// Returns all activities that happened inside this department or any of its subfolders

// Example 3: Search by path
const searchResults = await ActivityLog.searchByPath('/Engineering/Projects', 100);
// Returns all activities with paths containing "/Engineering/Projects"

// Example 4: Get breadcrumb for UI
const activity = await ActivityLog.findById(activityId);
const breadcrumb = activity.getBreadcrumb();
// Returns: [
//   { id: 'dept1', name: 'Engineering', type: 'department' },
//   { id: 'folder1', name: 'Projects', type: 'folder' },
//   { id: 'folder2', name: 'Q4', type: 'folder' }
// ]
// You can render this as: Engineering → Projects → Q4

// Example 5: Check if activity is within a specific folder
const isInFolder = activity.isInFolder(folderId);

// Example 6: Get the department (root ancestor)
const department = activity.getRootAncestor();
// Returns: { id: 'dept1', name: 'Engineering', type: 'department' }
*/