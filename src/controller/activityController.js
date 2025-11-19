/**
 * UPDATED ACTIVITY CONTROLLER
 * ✅ Returns properly formatted grouped activities
 * ✅ Compatible with existing activity model grouping logic
 */

import ActivityLogModel from '../models/activityModel.js';
import mongoose from 'mongoose';

/**
 * Get user's activities grouped by date with upload grouping
 * Route: GET /api/activities/user/:userId
 * Route: GET /api/activities/grouped (if using req.user.id)
 */
export const getUserActivitiesGrouped = async (req, res) => {
  try {
    // Support both path param and authenticated user
    const userId = req.params.userId || req.user?.id;
    const { limit = 100 } = req.query;

    // Validate userId
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or missing user ID'
      });
    }

    // Get grouped activities using model method
    const grouped = await ActivityLogModel.getGroupedActivities(userId, parseInt(limit));

    // Enrich each activity with formatted message and time
    const enrichActivities = (activities) => {
      return activities.map(activity => {
        // Create model instance to use instance methods
        const activityDoc = new ActivityLogModel(activity);
        
        return {
          _id: activity._id,
          action: activity.action,
          targetType: activity.targetType,
          targetId: activity.targetId,
          metadata: activity.metadata,
          createdAt: activity.createdAt,
          user: activity.userId,
          
          // Formatted fields
          message: activityDoc.getMessage(),
          formattedTime: activityDoc.getFormattedTime(),
          
          // Grouping fields (if grouped upload)
          ...(activity._grouped && {
            _grouped: true,
            _groupCount: activity._groupCount,
            _groupItems: activity._groupItems
          })
        };
      });
    };

    const response = {
      success: true,
      data: {
        today: enrichActivities(grouped.today),
        yesterday: enrichActivities(grouped.yesterday),
        lastWeek: enrichActivities(grouped.lastWeek),
        older: enrichActivities(grouped.older)
      },
      meta: {
        totalCount: 
          grouped.today.length + 
          grouped.yesterday.length + 
          grouped.lastWeek.length + 
          grouped.older.length,
        groupedUploads: grouped.today
          .concat(grouped.yesterday, grouped.lastWeek, grouped.older)
          .filter(a => a._grouped).length
      }
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching user activities:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch user activities',
      error: error.message
    });
  }
};

/**
 * Get activity for a specific file (document)
 * Route: GET /api/activities/file/:fileId
 */
export const getFileActivity = async (req, res) => {
  try {
    const { fileId } = req.params;
    const { limit = 50 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(fileId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file ID'
      });
    }

    const activities = await ActivityLogModel.find({
      targetType: 'file',
      targetId: fileId
    })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate('userId', 'name email avatar')
      .lean();

    const enrichedActivities = activities.map(activity => {
      const activityDoc = new ActivityLogModel(activity);
      return {
        _id: activity._id,
        action: activity.action,
        targetType: activity.targetType,
        targetId: activity.targetId,
        metadata: activity.metadata,
        createdAt: activity.createdAt,
        message: activityDoc.getMessage(),
        formattedTime: activityDoc.getFormattedTime(),
        user: activity.userId
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        fileId,
        activities: enrichedActivities,
        count: enrichedActivities.length
      }
    });
  } catch (error) {
    console.error('Error fetching file activity:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch file activity',
      error: error.message
    });
  }
};

/**
 * Get activity for a specific folder
 * Route: GET /api/activities/folder/:folderId
 */
export const getFolderActivity = async (req, res) => {
  try {
    const { folderId } = req.params;
    const { limit = 50, actionType } = req.query;

    if (!mongoose.Types.ObjectId.isValid(folderId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid folder ID'
      });
    }

    const query = {
      targetType: 'folder',
      targetId: folderId
    };

    if (actionType) {
      query.action = actionType;
    }

    const activities = await ActivityLogModel.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate('userId', 'name email avatar')
      .lean();

    const enrichedActivities = activities.map(activity => {
      const activityDoc = new ActivityLogModel(activity);
      return {
        _id: activity._id,
        action: activity.action,
        targetType: activity.targetType,
        targetId: activity.targetId,
        metadata: activity.metadata,
        createdAt: activity.createdAt,
        message: activityDoc.getMessage(),
        formattedTime: activityDoc.getFormattedTime(),
        user: activity.userId
      };
    });

    const actionBreakdown = await ActivityLogModel.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    return res.status(200).json({
      success: true,
      data: {
        folderId,
        activities: enrichedActivities,
        count: enrichedActivities.length,
        actionBreakdown
      }
    });
  } catch (error) {
    console.error('Error fetching folder activity:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch folder activity',
      error: error.message
    });
  }
};

/**
 * Get activities by bulk group ID (for expanded view)
 * Route: GET /api/activities/bulk/:bulkGroupId
 */
export const getBulkGroupActivities = async (req, res) => {
  try {
    const { bulkGroupId } = req.params;

    const activities = await ActivityLogModel.find({
      'metadata.bulkGroupId': bulkGroupId
    })
      .sort({ createdAt: -1 })
      .populate('userId', 'name email avatar')
      .lean();

    if (activities.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No activities found for this bulk group ID'
      });
    }

    const enrichedActivities = activities.map(activity => {
      const activityDoc = new ActivityLogModel(activity);
      return {
        _id: activity._id,
        action: activity.action,
        targetType: activity.targetType,
        targetId: activity.targetId,
        metadata: activity.metadata,
        createdAt: activity.createdAt,
        message: activityDoc.getMessage(),
        formattedTime: activityDoc.getFormattedTime(),
        user: activity.userId
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        bulkGroupId,
        activities: enrichedActivities,
        totalItems: activities[0]?.metadata?.itemCount || activities.length,
        count: enrichedActivities.length
      }
    });
  } catch (error) {
    console.error('Error fetching bulk group activities:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch bulk group activities',
      error: error.message
    });
  }
};

/**
 * Get recent activities across the system
 * Route: GET /api/activities/recent
 */
export const getRecentActivities = async (req, res) => {
  try {
    const { 
      limit = 50, 
      page = 1,
      userId,
      actionType,
      targetType
    } = req.query;

    const skip = (page - 1) * limit;
    const filters = {};
    
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      filters.userId = userId;
    }
    
    if (actionType) {
      filters.action = actionType;
    }
    
    if (targetType) {
      filters.targetType = targetType;
    }

    const activities = await ActivityLogModel.find(filters)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .populate('userId', 'name email avatar')
      .lean();

    const totalCount = await ActivityLogModel.countDocuments(filters);

    const enrichedActivities = activities.map(activity => {
      const activityDoc = new ActivityLogModel(activity);
      return {
        _id: activity._id,
        action: activity.action,
        targetType: activity.targetType,
        targetId: activity.targetId,
        metadata: activity.metadata,
        createdAt: activity.createdAt,
        message: activityDoc.getMessage(),
        formattedTime: activityDoc.getFormattedTime(),
        user: activity.userId
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        activities: enrichedActivities,
        pagination: {
          total: totalCount,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(totalCount / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching recent activities:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch recent activities',
      error: error.message
    });
  }
};

/**
 * Get activity statistics
 * Route: GET /api/activities/stats
 */
export const getActivityStats = async (req, res) => {
  try {
    const { startDate, endDate, userId, targetType } = req.query;

    const filters = {};
    
    if (startDate || endDate) {
      filters.createdAt = {};
      if (startDate) filters.createdAt.$gte = new Date(startDate);
      if (endDate) filters.createdAt.$lte = new Date(endDate);
    }
    
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      filters.userId = mongoose.Types.ObjectId(userId);
    }
    
    if (targetType) {
      filters.targetType = targetType;
    }

    const actionBreakdown = await ActivityLogModel.aggregate([
      { $match: filters },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    const targetTypeBreakdown = await ActivityLogModel.aggregate([
      { $match: filters },
      {
        $group: {
          _id: '$targetType',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    const dailyTrend = await ActivityLogModel.aggregate([
      { $match: filters },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: -1 } },
      { $limit: 30 }
    ]);

    const totalActivities = await ActivityLogModel.countDocuments(filters);
    const uniqueUsers = await ActivityLogModel.distinct('userId', filters);

    return res.status(200).json({
      success: true,
      data: {
        totalActivities,
        uniqueUsers: uniqueUsers.length,
        actionBreakdown,
        targetTypeBreakdown,
        dailyTrend: dailyTrend.reverse()
      }
    });
  } catch (error) {
    console.error('Error fetching activity stats:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch activity statistics',
      error: error.message
    });
  }
};

/**
 * Search activities
 * Route: GET /api/activities/search
 */
export const searchActivities = async (req, res) => {
  try {
    const { 
      query,
      action,
      targetType,
      userId,
      startDate,
      endDate,
      limit = 50,
      page = 1
    } = req.query;

    const skip = (page - 1) * limit;
    const filters = {};

    if (action) {
      filters.action = action;
    }

    if (targetType) {
      filters.targetType = targetType;
    }

    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      filters.userId = userId;
    }

    if (startDate || endDate) {
      filters.createdAt = {};
      if (startDate) filters.createdAt.$gte = new Date(startDate);
      if (endDate) filters.createdAt.$lte = new Date(endDate);
    }

    if (query) {
      filters.$or = [
        { 'metadata.fileName': { $regex: query, $options: 'i' } },
        { 'metadata.folderName': { $regex: query, $options: 'i' } },
        { 'metadata.oldName': { $regex: query, $options: 'i' } },
        { 'metadata.newName': { $regex: query, $options: 'i' } }
      ];
    }

    const activities = await ActivityLogModel.find(filters)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .populate('userId', 'name email avatar')
      .lean();

    const totalCount = await ActivityLogModel.countDocuments(filters);

    const enrichedActivities = activities.map(activity => {
      const activityDoc = new ActivityLogModel(activity);
      return {
        _id: activity._id,
        action: activity.action,
        targetType: activity.targetType,
        targetId: activity.targetId,
        metadata: activity.metadata,
        createdAt: activity.createdAt,
        message: activityDoc.getMessage(),
        formattedTime: activityDoc.getFormattedTime(),
        user: activity.userId
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        activities: enrichedActivities,
        pagination: {
          total: totalCount,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(totalCount / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error searching activities:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to search activities',
      error: error.message
    });
  }
};

/**
 * TEST ENDPOINT: Check grouped activity data structure
 * Route: GET /api/activities/test/grouped
 * This endpoint helps verify the JSON structure
 */
export const testGroupedActivities = async (req, res) => {
  try {
    const userId = req.user?.id || req.query.userId;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID required (as query param or authenticated user)'
      });
    }

    const grouped = await ActivityLogModel.getGroupedActivities(userId, 10);
    
    // Show raw structure
    const sampleActivity = grouped.today[0] || grouped.yesterday[0] || grouped.lastWeek[0];
    
    return res.status(200).json({
      success: true,
      message: 'Test data for grouped activities',
      data: {
        groupedData: grouped,
        sampleActivity: sampleActivity ? {
          _id: sampleActivity._id,
          action: sampleActivity.action,
          targetType: sampleActivity.targetType,
          metadata: sampleActivity.metadata,
          _grouped: sampleActivity._grouped,
          _groupCount: sampleActivity._groupCount,
          _groupItems: sampleActivity._groupItems
        } : null,
        counts: {
          today: grouped.today.length,
          yesterday: grouped.yesterday.length,
          lastWeek: grouped.lastWeek.length,
          older: grouped.older.length
        },
        groupedUploadsCount: grouped.today
          .concat(grouped.yesterday, grouped.lastWeek, grouped.older)
          .filter(a => a._grouped).length
      }
    });
  } catch (error) {
    console.error('Error in test endpoint:', error);
    return res.status(500).json({
      success: false,
      message: 'Test endpoint failed',
      error: error.message
    });
  }
};