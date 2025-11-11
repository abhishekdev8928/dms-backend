import express from 'express';
import mongoose from 'mongoose';
import DepartmentModel from '../models/departmentModel.js';
import FolderModel from '../models/folderModel.js';
import DocumentModel from '../models/documentModel.js';
import app from '../app.js';
import { authenticateUser } from '../middleware/authMiddleware.js';

const router = express.Router();


router.use(authenticateUser)


router.get('/tree', async (req, res) => {
  try {
    // Get all active departments
    const departments = await DepartmentModel
      .find({ isActive: true })
      .sort({ name: 1 })
      .lean();

    // Get all folders (not deleted)
    const folders = await FolderModel
      .find({ isDeleted: false })
      .sort({ path: 1 })
      .lean();

    // Build tree structure
    const tree = buildTree(departments, folders);

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
  // Create a map for quick folder lookup by parent_id
  const foldersByParent = new Map();
  
  folders.forEach(folder => {
    const parentId = folder.parent_id.toString();
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
      children: children
    };
  });

  return tree;
}

/**
 * @route   GET /api/children/:parentId
 * @desc    Get all children (folders and files) for a given parent
 * @access  Private (add auth middleware as needed)
 * @query   includeDeleted - boolean to include soft-deleted items
 * @query   sortBy - field to sort by (name, createdAt, updatedAt, size)
 * @query   sortOrder - asc or desc
 * @query   type - filter by type (folder, file, all)
 */
router.get('/:parentId', async (req, res) => {
  try {
    const { parentId } = req.params;
    const { 
      includeDeleted = false, 
      sortBy = 'name', 
      sortOrder = 'asc',
      type = 'all' 
    } = req.query;

    // Validate parentId
    if (!mongoose.Types.ObjectId.isValid(parentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid parent ID'
      });
    }

    // Check if parent exists (could be Department or Folder)
    let parent = await DepartmentModel.findById(parentId);
    let parentType = 'department';
    
    if (!parent) {
      parent = await FolderModel.findById(parentId);
      parentType = 'folder';
    }

    if (!parent) {
      return res.status(404).json({
        success: false,
        message: 'Parent not found'
      });
    }

    // Build query for children
    const query = { parent_id: parentId };
    
    if (!includeDeleted) {
      query.isDeleted = false;
    }

    // Determine sort options
    const sortOptions = {};
    const validSortFields = ['name', 'createdAt', 'updatedAt', 'size'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'name';
    sortOptions[sortField] = sortOrder === 'desc' ? -1 : 1;

    // Fetch folders and documents based on type filter
    let folders = [];
    let documents = [];

    if (type === 'all' || type === 'folder') {
      folders = await FolderModel.find(query)
        .sort(sortOptions)
        .select('-__v')
        .lean();
    }

    if (type === 'all' || type === 'file') {
      documents = await DocumentModel.find(query)
        .sort(sortOptions)
        .select('-__v')
        .lean();
    }

    // Add type discriminator to each item
    const foldersWithType = folders.map(folder => ({
      ...folder,
      itemType: 'folder',
      hasChildren: true // Folders can have children
    }));

    const documentsWithType = documents.map(doc => ({
      ...doc,
      itemType: 'file',
      hasChildren: false // Files don't have children
    }));

    // Combine and sort if needed
    let children = [...foldersWithType, ...documentsWithType];

    // If sorting by a field that both have, re-sort the combined array
    if (type === 'all') {
      children.sort((a, b) => {
        let aVal = a[sortField];
        let bVal = b[sortField];

        // Handle string comparisons (case-insensitive)
        if (typeof aVal === 'string') {
          aVal = aVal.toLowerCase();
          bVal = bVal.toLowerCase();
        }

        if (sortOrder === 'desc') {
          return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
        } else {
          return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
        }
      });
    }

    // Get parent info
    const parentInfo = {
      _id: parent._id,
      name: parent.name,
      type: parentType,
      path: parent.path,
      ...(parentType === 'department' && {
        stats: parent.stats
      })
    };

    // Calculate summary statistics
    const stats = {
      totalItems: children.length,
      totalFolders: foldersWithType.length,
      totalFiles: documentsWithType.length,
      totalSize: documentsWithType.reduce((sum, doc) => sum + (doc.size || 0), 0)
    };

    return res.status(200).json({
      success: true,
      data: {
        parent: parentInfo,
        children,
        stats
      },
      message: 'Children fetched successfully'
    });

  } catch (error) {
    console.error('Error fetching children:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch children',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/children/:parentId/tree
 * @desc    Get full tree structure (all descendants) for a given parent
 * @access  Private
 * @query   includeDeleted - boolean to include soft-deleted items
 * @query   maxDepth - maximum depth to traverse (default: unlimited)
 */
router.get('/:parentId/tree', async (req, res) => {
  try {
    const { parentId } = req.params;
    const { includeDeleted = false, maxDepth } = req.query;

    if (!mongoose.Types.ObjectId.isValid(parentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid parent ID'
      });
    }

    // Check if parent exists
    let parent = await DepartmentModel.findById(parentId);
    let parentType = 'department';
    
    if (!parent) {
      parent = await FolderModel.findById(parentId);
      parentType = 'folder';
    }

    if (!parent) {
      return res.status(404).json({
        success: false,
        message: 'Parent not found'
      });
    }

    // Build recursive tree
    const buildTree = async (parentId, currentDepth = 0) => {
      // Check depth limit
      if (maxDepth && currentDepth >= parseInt(maxDepth)) {
        return [];
      }

      const query = { parent_id: parentId };
      if (!includeDeleted) {
        query.isDeleted = false;
      }

      // Get folders and documents
      const [folders, documents] = await Promise.all([
        FolderModel.find(query).select('-__v').lean(),
        DocumentModel.find(query).select('-__v').lean()
      ]);

      // Recursively build tree for each folder
      const foldersWithChildren = await Promise.all(
        folders.map(async (folder) => ({
          ...folder,
          itemType: 'folder',
          children: await buildTree(folder._id, currentDepth + 1)
        }))
      );

      // Add documents with type
      const documentsWithType = documents.map(doc => ({
        ...doc,
        itemType: 'file',
        children: []
      }));

      return [...foldersWithChildren, ...documentsWithType];
    };

    const tree = await buildTree(parentId);

    return res.status(200).json({
      success: true,
      data: {
        parent: {
          _id: parent._id,
          name: parent.name,
          type: parentType,
          path: parent.path
        },
        tree
      },
      message: 'Tree structure fetched successfully'
    });

  } catch (error) {
    console.error('Error fetching tree:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch tree structure',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/children/:parentId/breadcrumbs
 * @desc    Get breadcrumb trail for a given parent
 * @access  Private
 */
router.get('/:parentId/breadcrumbs', async (req, res) => {
  try {
    const { parentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(parentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid parent ID'
      });
    }

    // Check if parent is Department or Folder
    let parent = await DepartmentModel.findById(parentId);
    let breadcrumbs = [];

    if (parent) {
      // Department - root level
      breadcrumbs = [{
        _id: parent._id,
        name: parent.name,
        type: 'department',
        path: parent.path
      }];
    } else {
      // Try Folder
      parent = await FolderModel.findById(parentId);
      
      if (!parent) {
        return res.status(404).json({
          success: false,
          message: 'Parent not found'
        });
      }

      // Parse path to build breadcrumbs
      const pathParts = parent.path.split('/').filter(part => part.length > 0);
      
      // First part is always department
      const departmentName = pathParts[0];
      const department = await DepartmentModel.findOne({ name: departmentName });
      
      if (department) {
        breadcrumbs.push({
          _id: department._id,
          name: department.name,
          type: 'department',
          path: department.path
        });
      }

      // Build remaining breadcrumbs by traversing up
      let currentPath = `/${departmentName}`;
      
      for (let i = 1; i < pathParts.length; i++) {
        currentPath += `/${pathParts[i]}`;
        const folder = await FolderModel.findOne({ path: currentPath });
        
        if (folder) {
          breadcrumbs.push({
            _id: folder._id,
            name: folder.name,
            type: 'folder',
            path: folder.path
          });
        }
      }
    }

    return res.status(200).json({
      success: true,
      data: breadcrumbs,
      message: 'Breadcrumbs fetched successfully'
    });

  } catch (error) {
    console.error('Error fetching breadcrumbs:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch breadcrumbs',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/children/:parentId/stats
 * @desc    Get statistics for a given parent (total folders, files, size)
 * @access  Private
 */
router.get('/:parentId/stats', async (req, res) => {
  try {
    const { parentId } = req.params;
    const { includeDeleted = false } = req.query;

    if (!mongoose.Types.ObjectId.isValid(parentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid parent ID'
      });
    }

    // Check if parent exists
    let parent = await DepartmentModel.findById(parentId);
    let parentType = 'department';
    
    if (!parent) {
      parent = await FolderModel.findById(parentId);
      parentType = 'folder';
    }

    if (!parent) {
      return res.status(404).json({
        success: false,
        message: 'Parent not found'
      });
    }

    // Build query for descendants
    const pathRegex = new RegExp(`^${parent.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`);
    const query = { path: pathRegex };
    
    if (!includeDeleted) {
      query.isDeleted = false;
    }

    // Count folders and documents
    const [folderCount, documentCount] = await Promise.all([
      FolderModel.countDocuments({ ...query }),
      DocumentModel.countDocuments({ ...query })
    ]);

    // Calculate total size
    const sizeResult = await DocumentModel.aggregate([
      { $match: { ...query } },
      {
        $group: {
          _id: null,
          totalSize: { $sum: '$size' }
        }
      }
    ]);

    const totalSize = sizeResult.length > 0 ? sizeResult[0].totalSize : 0;

    // Get file type breakdown
    const fileTypeBreakdown = await DocumentModel.aggregate([
      { $match: { ...query } },
      {
        $group: {
          _id: '$extension',
          count: { $sum: 1 },
          totalSize: { $sum: '$size' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    return res.status(200).json({
      success: true,
      data: {
        parent: {
          _id: parent._id,
          name: parent.name,
          type: parentType
        },
        stats: {
          totalFolders: folderCount,
          totalDocuments: documentCount,
          totalSize,
          fileTypeBreakdown
        }
      },
      message: 'Statistics fetched successfully'
    });

  } catch (error) {
    console.error('Error fetching stats:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message
    });
  }
});

export default router;