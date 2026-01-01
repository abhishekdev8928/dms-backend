import express from 'express';

import DepartmentModel from '../models/departmentModel.js';
import FolderModel from '../models/folderModel.js';
import { authenticateUser } from '../middleware/authMiddleware.js';
import DocumentModel from '../models/documentModel.js';

const router = express.Router();


router.use(authenticateUser)


router.get('/navigation-tree', authenticateUser, async (req, res) => {
  try {
    const { role, departments, myDriveDepartmentId } = req.user;
   
    // 🔥 Build department query based on user role
    let departmentQuery = { isActive: true };
    
    if (role === ROLES.SUPER_ADMIN) {
      // Super Admin sees all ORG departments + own MyDrive
      departmentQuery.ownerType = 'ORG';
    } else {
      // Others see only their assigned ORG departments + own MyDrive
      const allowedDepartmentIds = [...departments];
      
      // Extract IDs (handle both populated and unpopulated)
      const deptIds = allowedDepartmentIds.map(dept => dept._id || dept);
      
      // Add their MyDrive
      if (myDriveDepartmentId) {
        const myDriveId = myDriveDepartmentId._id || myDriveDepartmentId;
        deptIds.push(myDriveId);
      }
      
      departmentQuery._id = { $in: deptIds };
    }

    // Get accessible departments
    let accessibleDepartments = await DepartmentModel
      .find(departmentQuery)
      .sort({ name: 1 })
      .lean();

    // 🔥 Super Admin: Add their MyDrive separately and override name
    if (role === ROLES.SUPER_ADMIN && myDriveDepartmentId) {
      const myDriveId = myDriveDepartmentId._id || myDriveDepartmentId;
      const myDrive = await DepartmentModel.findById(myDriveId).lean();
      
      if (myDrive) {
        // Override the name to "My Drive"
        myDrive.name = 'My Drive';
        accessibleDepartments.push(myDrive);
      }
    }

    // Get department IDs for folder filtering
    const accessibleDeptIds = accessibleDepartments.map(d => d._id.toString());

    // Get folders only from accessible departments
    const folders = await FolderModel
      .find({ 
        isDeleted: false,
        departmentId: { $in: accessibleDeptIds }
      })
      .sort({ path: 1 })
      .lean();

    // Build tree structure
    const tree = buildTree(accessibleDepartments, folders);

    res.status(200).json({
      success: true,
      data: tree
    });

  } catch (error) {
    console.error('Error building tree:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to build navigation tree',
      error: error.message
    });
  }
});

/**
 * Helper: Build tree structure from flat arrays
 */
function buildTree(departments, folders) {
  // Create a map for quick folder lookup by parentId
  const foldersByParent = new Map();
  
  folders.forEach(folder => {
    // 🔥 FIX: Use parentId instead of parent_id
    const parentId = folder.parentId.toString();
    if (!foldersByParent.has(parentId)) {
      foldersByParent.set(parentId, []);
    }
    foldersByParent.get(parentId).push(folder);
  });

  // Recursive function to build folder tree
  function buildFolderTree(parentId) {
    const childFolders = foldersByParent.get(parentId) || [];
    
    return childFolders.map(folder => {
      const folderId = folder._id.toString();
      const children = buildFolderTree(folderId);
      
      return {
        id: folderId,
        name: folder.name,
        type: 'folder', // 🔥 Added type for clarity
        children: children
      };
    });
  }

  // Build tree starting from departments
  const tree = departments.map(dept => {
    const deptId = dept._id.toString();
    const children = buildFolderTree(deptId);
    
    return {
      id: deptId,
      name: dept.name,
      type: dept.ownerType === 'USER' ? 'mydrive' : 'department', // 🔥 Distinguish MyDrive vs Org
      ownerType: dept.ownerType, // 🔥 Include ownerType
      children: children
    };
  });

  return tree;
}


import AccessControlModel from '../models/accessControlModel.js';
import { formatBytes } from '../utils/helper/folderHelper.js';
import { ROLES } from '../utils/constant.js';
import StarredModel from '../models/starredModel.js';
import { attachActionsBulk } from '../utils/helper/aclHelpers.js';




/**
 * @route   GET /api/shared/with-me
 * @desc    Get all folders and documents shared with the current user
 * @access  Private
 * @query   type - Filter by resource type: 'folder', 'document', or 'all' (default: 'all')
 * @query   page - Page number (default: 1)
 * @query   limit - Items per page (default: 20)
 */
router.get('/with-me', authenticateUser, async (req, res, next) => {
  try {
    const { _id: userId, groups = [] } = req.user;
    const { type = 'all', page = 1, limit = 20 } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build ACL query - find all resources shared with this user (directly or via groups)
    const aclQuery = {
      $or: [
        { subjectType: 'USER', subjectId: userId },
        { subjectType: 'GROUP', subjectId: { $in: groups } }
      ]
    };

    // Filter by resource type if specified
    if (type === 'folder') {
      aclQuery.resourceType = 'FOLDER';
    } else if (type === 'document') {
      aclQuery.resourceType = 'DOCUMENT';
    }

    // Get all ACL entries for this user
    const aclEntries = await AccessControlModel
      .find(aclQuery)
      .populate('grantedBy', 'username email')
      .sort({ createdAt: -1 })
      .lean();

    // Separate folder and document IDs
    const folderIds = [];
    const documentIds = [];
    const aclMap = new Map(); // Store ACL info by resource

    aclEntries.forEach(acl => {
      const resourceKey = `${acl.resourceType}-${acl.resourceId}`;
      
      // Store ACL info
      if (!aclMap.has(resourceKey)) {
        aclMap.set(resourceKey, {
          permissions: new Set(acl.permissions),
          sharedBy: acl.grantedBy,
          sharedAt: acl.createdAt
        });
      } else {
        // Merge permissions if multiple ACL entries (user + group)
        const existing = aclMap.get(resourceKey);
        acl.permissions.forEach(p => existing.permissions.add(p));
        // Keep the earliest share info
        if (new Date(acl.createdAt) < new Date(existing.sharedAt)) {
          existing.sharedBy = acl.grantedBy;
          existing.sharedAt = acl.createdAt;
        }
      }

      if (acl.resourceType === 'FOLDER') {
        folderIds.push(acl.resourceId);
      } else if (acl.resourceType === 'DOCUMENT') {
        documentIds.push(acl.resourceId);
      }
    });

    // Fetch actual folders and documents
    const [folders, documents] = await Promise.all([
      folderIds.length > 0
        ? FolderModel
            .find({ 
              _id: { $in: folderIds }, 
              isDeleted: false 
            })
            .populate('createdBy', 'username email')
            .populate('updatedBy', 'username email')
            .populate('departmentId', 'name ownerType')
            .lean()
        : [],
      documentIds.length > 0
        ? DocumentModel
            .find({ 
              _id: { $in: documentIds }, 
              isDeleted: false 
            })
            .populate('createdBy', 'username email')
            .populate('updatedBy', 'username email')
            .populate('departmentId', 'name ownerType')
            .lean()
        : []
    ]);

    // Combine folders and documents with type field and sharing info
    let sharedItems = [
      ...folders.map(folder => {
        const aclKey = `FOLDER-${folder._id}`;
        const aclInfo = aclMap.get(aclKey);
        return {
          ...folder,
          type: 'folder',
          sharedBy: aclInfo?.sharedBy || null,
          sharedAt: aclInfo?.sharedAt || null,
          sharedPermissions: aclInfo ? Array.from(aclInfo.permissions) : []
        };
      }),
      ...documents.map(doc => {
        const aclKey = `DOCUMENT-${doc._id}`;
        const aclInfo = aclMap.get(aclKey);
        return {
          ...doc,
          type: 'document',
          sharedBy: aclInfo?.sharedBy || null,
          sharedAt: aclInfo?.sharedAt || null,
          sharedPermissions: aclInfo ? Array.from(aclInfo.permissions) : []
        };
      })
    ];

    // Get starred status for all items
    const itemIds = sharedItems.map(item => item._id);
    const starredItems = await StarredModel.find({
      userId: req.user._id,
      itemId: { $in: itemIds }
    }).lean();

    // Create a Map of starred item IDs with their starredAt timestamps
    const starredItemsMap = new Map(
      starredItems.map(item => [item.itemId.toString(), item.createdAt])
    );

    // Add isStarred and starredAt fields to each child
    sharedItems = sharedItems.map(item => ({
      ...item,
      isStarred: starredItemsMap.has(item._id.toString()),
      starredAt: starredItemsMap.get(item._id.toString()) || null
    }));

    // Attach actions to all items
    const itemsWithActions = await attachActionsBulk(sharedItems, req.user);

    // Sort by sharedAt (most recent first)
    itemsWithActions.sort((a, b) => {
      if (a.sharedAt && b.sharedAt) {
        return new Date(b.sharedAt) - new Date(a.sharedAt);
      }
      return 0;
    });

    // Pagination
    const total = itemsWithActions.length;
    const paginatedItems = itemsWithActions.slice(skip, skip + limitNum);

    res.status(200).json({
      success: true,
      count: total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      children: paginatedItems
    });

  } catch (error) {
    next(error);
  }
});





export default router;