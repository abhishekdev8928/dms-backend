import ActivityLog from '../models/activityModel.js';
import mongoose from 'mongoose';

// ============================================
// HELPER: Get User Info for Snapshot
// ============================================
const getUserSnapshot = (user) => {
  if (!user) return null;

  return {
    id: user._id?.toString() || user.id?.toString(),
    name: user.username || user.name,
    email: user.email,
    avatar: user.profilePic || user.avatar || null
  };
};

// ============================================
// POST CONTROLLER - Only Bulk Upload
// ============================================

/**
 * @route   POST /api/activity/bulk-upload
 * @desc    Log bulk file upload after successful uploads
 * @access  Private
 */
export const logBulkFileUpload = async (req, res) => {
  try {
    console.log("user details", req.user);
    let { parentId, files } = req.body; 
    
    console.log('📥 Raw request body:', JSON.stringify(req.body, null, 2));
    console.log('📥 Files type:', typeof files);
    console.log('📥 Files value:', files);
    
    const userId = req.user?._id || req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    // Validate parentId
    if (!parentId) {
      return res.status(400).json({
        success: false,
        message: 'Parent ID is required'
      });
    }

    // Parse files if it's a stringified array
    if (typeof files === 'string') {
      try {
        console.log('⚠️ Files is a string, parsing...');
        files = JSON.parse(files);
        console.log('✅ Parsed files:', files);
      } catch (parseError) {
        console.error('❌ Failed to parse files:', parseError);
        return res.status(400).json({
          success: false,
          message: 'Invalid files format'
        });
      }
    }

    // Validation
    if (!files || !Array.isArray(files) || files.length === 0) {
      console.error('❌ Files validation failed:', { files, isArray: Array.isArray(files) });
      return res.status(400).json({
        success: false,
        message: 'Files array is required and cannot be empty'
      });
    }

    // Validate file structure
    const invalidFiles = files.filter(f => !f.id && !f._id || !f.name);
    if (invalidFiles.length > 0) {
      console.error('❌ Invalid files found:', invalidFiles);
      return res.status(400).json({
        success: false,
        message: 'Each file must have id and name',
        invalidFiles
      });
    }

    console.log('✅ Validation passed, logging activity...');
    
    // Get user snapshot
    const userInfo = getUserSnapshot(req.user);
    
    // Log bulk upload
    const log = await ActivityLog.logBulkFileUpload(
      userId,
      parentId,
      files,
      userInfo
    );

    console.log('✅ Activity logged successfully:', log._id);

    res.status(201).json({
      success: true,
      message: 'Bulk upload logged successfully',
      data: {
        logId: log._id,
        action: log.action,
        itemCount: log.bulkOperation?.itemCount || files.length,
        message: log.getMessage(),
        timestamp: log.createdAt
      }
    });

  } catch (error) {
    console.error('❌ Error logging bulk upload:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to log bulk upload',
      error: error.message
    });
  }
};

// ============================================
// GET CONTROLLERS - Fetching Activity Logs
// ============================================

/**
 * @route   GET /api/activity/user
 * @desc    Get authenticated user's activities grouped by date
 * @access  Private
 */
export const getUserActivitiesGrouped = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const limit = parseInt(req.query.limit) || 100;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const groupedActivities = await ActivityLog.getUserActivities(userId, limit);

    // Format activities
    const formatActivities = (activities) => {
      return activities.map(activity => ({
        ...activity,
        user: activity.userSnapshot || { name: 'You' },
        message: new ActivityLog(activity).getMessage(),
        timeLabel: new ActivityLog(activity).getTimeLabel(),
        formattedTime: new ActivityLog(activity).getFormattedTime()
      }));
    };

    const response = {
      today: formatActivities(groupedActivities.today),
      yesterday: formatActivities(groupedActivities.yesterday),
      lastWeek: formatActivities(groupedActivities.lastWeek),
      lastMonth: formatActivities(groupedActivities.lastMonth),
      older: formatActivities(groupedActivities.older)
    };

    res.status(200).json({
      success: true,
      data: response,
      totalActivities: 
        groupedActivities.today.length +
        groupedActivities.yesterday.length +
        groupedActivities.lastWeek.length +
        groupedActivities.lastMonth.length +
        groupedActivities.older.length
    });

  } catch (error) {
    console.error('Error fetching user activities:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user activities',
      error: error.message
    });
  }
};

/**
 * @route   GET /api/activity/file/:fileId
 * @desc    Get complete activity history for a specific file
 * @access  Private
 */
export const getFileActivity = async (req, res) => {
  try {
    const { fileId } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    if (!mongoose.Types.ObjectId.isValid(fileId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file ID format'
      });
    }

    // Get all activities related to this file
    const activities = await ActivityLog.getEntityHistory(fileId, limit);

    // Filter and transform activities for this specific file
    const fileSpecificActivities = activities
      .map(activity => {
        // If it's a bulk operation, check if this file is part of it
        if (activity.targetType === 'multiple' && activity.bulkOperation?.items) {
          const fileInBulk = activity.bulkOperation.items.find(
            item => item.id === fileId
          );

          // If this file is part of the bulk operation, transform it to show only this file
          if (fileInBulk) {
            return {
              ...activity,
              // Override to make it look like a single file operation
              targetType: 'file',
              target: {
                id: fileInBulk.id,
                name: fileInBulk.name,
                extension: fileInBulk.extension,
                type: fileInBulk.type,
                size: fileInBulk.size
              },
              // Remove bulk operation data for cleaner display
              bulkOperation: {
                itemCount: 1,
                items: [fileInBulk]
              },
              // Update message to reflect single file
              originalAction: activity.action
            };
          }
          
          // File not in this bulk operation, exclude it
          return null;
        }

        // If it's a single file operation targeting this file, show it as-is
        if (activity.targetType === 'file' && 
            (activity.target?.id === fileId || activity.targetId === fileId)) {
          return activity;
        }

        // Exclude other activities
        return null;
      })
      .filter(activity => activity !== null); // Remove excluded activities

    const formattedActivities = fileSpecificActivities.map(activity => {
      const activityLog = new ActivityLog(activity);
      
      // Generate custom message for transformed bulk operations
      let message = activityLog.getMessage();
      if (activity.originalAction) {
        const userName = activity.userSnapshot?.name || 'Someone';
        const fileName = activity.target?.name || 'this file';
        
        switch (activity.originalAction) {
          case 'FILES_UPLOADED':
            message = `${userName} uploaded ${fileName}`;
            break;
          case 'ITEMS_RESTORED':
            message = `${userName} restored ${fileName}`;
            break;
          case 'ITEMS_DELETED':
            message = `${userName} moved ${fileName} to the bin`;
            break;
          case 'ITEMS_MOVED':
            message = `${userName} moved ${fileName}`;
            break;
          default:
            message = activityLog.getMessage();
        }
      }

      return {
        ...activity,
        user: activity.userSnapshot || { name: 'Unknown User' },
        message: message,
        timeLabel: activityLog.getTimeLabel(),
        formattedTime: activityLog.getFormattedTime()
      };
    });

    res.status(200).json({
      success: true,
      data: formattedActivities,
      count: formattedActivities.length,
      fileId: fileId
    });

  } catch (error) {
    console.error('Error fetching file activity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch file activity',
      error: error.message
    });
  }
};

/**
 * @route   GET /api/activity/folder/:folderId
 * @desc    Get complete activity history for a specific folder
 * @access  Private
 */
export const getFolderActivity = async (req, res) => {
  try {
    const { folderId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const actionType = req.query.actionType;

    if (!mongoose.Types.ObjectId.isValid(folderId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid folder ID format'
      });
    }

    const folderIdString = folderId.toString();
    
    const query = {
      $or: [
        // Direct folder operations
        { targetType: 'folder', 'target.id': folderIdString },
        
        // Files/folders in this folder via parentFolder snapshot
        { 'parentFolder.id': folderIdString },
        
        // Bulk operations
        { 'bulkOperation.items.folderPath': new RegExp(`/${folderId}`) }
      ]
    };

    if (actionType) {
      query.action = actionType;
    }

    const activities = await ActivityLog.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const formattedActivities = activities.map(activity => {
      const activityInstance = new ActivityLog(activity);
      return {
        ...activity,
        user: activity.userSnapshot || { name: 'Unknown User' },
        message: activityInstance.getMessage(),
        timeLabel: activityInstance.getTimeLabel(),
        formattedTime: activityInstance.getFormattedTime()
      };
    });

    res.status(200).json({
      success: true,
      data: formattedActivities,
      count: formattedActivities.length,
      folderId: folderId
    });

  } catch (error) {
    console.error('Error fetching folder activity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch folder activity',
      error: error.message
    });
  }
};

/**
 * @route   GET /api/activity/recent
 * @desc    Get recent activities with optional filters
 * @access  Private
 */
export const getRecentActivities = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;
    const { actionType, targetType } = req.query;
    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const query = { userId: userId.toString() };
    if (actionType) query.action = actionType;
    if (targetType) query.targetType = targetType;

    const [activities, totalCount] = await Promise.all([
      ActivityLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ActivityLog.countDocuments(query)
    ]);

    const formattedActivities = activities.map(activity => ({
      ...activity,
      user: activity.userSnapshot || { name: 'Unknown User' },
      message: new ActivityLog(activity).getMessage(),
      timeLabel: new ActivityLog(activity).getTimeLabel(),
      formattedTime: new ActivityLog(activity).getFormattedTime()
    }));

    res.status(200).json({
      success: true,
      data: formattedActivities,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalItems: totalCount,
        itemsPerPage: limit,
        hasNextPage: page < Math.ceil(totalCount / limit),
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error('Error fetching recent activities:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent activities',
      error: error.message
    });
  }
};

/**
 * @route   GET /api/activity/stats
 * @desc    Get activity statistics and breakdowns
 * @access  Private
 */
export const getActivityStats = async (req, res) => {
  try {
    const { startDate, endDate, targetType } = req.query;
    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const query = { userId: userId.toString() };
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    if (targetType) query.targetType = targetType;

    const stats = await ActivityLog.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 },
          lastActivity: { $max: '$createdAt' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    const totalActivities = await ActivityLog.countDocuments(query);

    const typeBreakdown = await ActivityLog.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$targetType',
          count: { $sum: 1 }
        }
      }
    ]);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentTrend = await ActivityLog.aggregate([
      { 
        $match: { 
          userId: userId.toString(),
          createdAt: { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalActivities,
        actionBreakdown: stats,
        typeBreakdown,
        recentTrend
      }
    });

  } catch (error) {
    console.error('Error fetching activity stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activity statistics',
      error: error.message
    });
  }
};

/**
 * @route   GET /api/activity/search
 * @desc    Search activities with filters
 * @access  Private
 */
export const searchActivities = async (req, res) => {
  try {
    const { 
      query: searchQuery, 
      action, 
      targetType, 
      startDate, 
      endDate 
    } = req.query;
    const limit = parseInt(req.query.limit) || 50;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;
    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const query = { userId: userId.toString() };

    if (action) query.action = action;
    if (targetType) query.targetType = targetType;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    if (searchQuery) {
      query.$or = [
        { 'target.name': { $regex: searchQuery, $options: 'i' } },
        { 'target.folderName': { $regex: searchQuery, $options: 'i' } },
        { 'target.oldName': { $regex: searchQuery, $options: 'i' } },
        { 'target.newName': { $regex: searchQuery, $options: 'i' } },
        { 'target.path': { $regex: searchQuery, $options: 'i' } },
        { 'parentFolder.name': { $regex: searchQuery, $options: 'i' } },
        { 'parentFolder.path': { $regex: searchQuery, $options: 'i' } },
        { 'bulkOperation.items.name': { $regex: searchQuery, $options: 'i' } }
      ];
    }

    const [activities, totalCount] = await Promise.all([
      ActivityLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ActivityLog.countDocuments(query)
    ]);

    const formattedActivities = activities.map(activity => ({
      ...activity,
      user: activity.userSnapshot || { name: 'Unknown User' },
      message: new ActivityLog(activity).getMessage(),
      timeLabel: new ActivityLog(activity).getTimeLabel(),
      formattedTime: new ActivityLog(activity).getFormattedTime()
    }));

    res.status(200).json({
      success: true,
      data: formattedActivities,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalItems: totalCount,
        itemsPerPage: limit,
        hasNextPage: page < Math.ceil(totalCount / limit),
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error('Error searching activities:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search activities',
      error: error.message
    });
  }
};