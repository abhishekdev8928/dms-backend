import DepartmentModel from "../models/Department.js";
import FolderModel from "../models/Folder.js";
import DocumentModel from "../models/Document.js";

/**
 * Get complete department tree with nested folders and documents
 */
export const getDepartmentTree = async (req, res) => {
  try {
    const { departmentId } = req.params;
    const { includeInactive = false } = req.query;

    // Base query filter
    const filter = { isActive: true };
    if (includeInactive === 'true') {
      delete filter.isActive;
    }

    // Get department or all departments
    const departments = departmentId
      ? await DepartmentModel.findById(departmentId).populate('head', 'name email')
      : await DepartmentModel.find(filter).populate('head', 'name email');

    if (!departments || (Array.isArray(departments) && departments.length === 0)) {
      return res.status(404).json({
        success: false,
        message: "No departments found"
      });
    }

    // Process single or multiple departments
    const deptArray = Array.isArray(departments) ? departments : [departments];
    const treeData = [];

    for (const dept of deptArray) {
      const tree = await buildDepartmentTree(dept, filter);
      treeData.push(tree);
    }

    res.status(200).json({
      success: true,
      data: departmentId ? treeData[0] : treeData
    });

  } catch (error) {
    console.error("Error getting department tree:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get department tree",
      error: error.message
    });
  }
};

/**
 * Build nested tree structure for a department
 */
async function buildDepartmentTree(department, filter) {
  // Get all folders for this department
  const folders = await FolderModel.find({
    department: department._id,
    ...filter
  })
    .populate('createdBy', 'name email')
    .sort({ level: 1, name: 1 })
    .lean();

  // Get all documents for this department
  const documents = await DocumentModel.find({
    department: department._id,
    ...filter
  })
    .populate('uploadedBy', 'name email')
    .sort({ title: 1 })
    .lean();

  // Create a map for quick folder lookup
  const folderMap = new Map();
  folders.forEach(folder => {
    folderMap.set(folder._id.toString(), {
      ...folder,
      children: [],
      documents: []
    });
  });

  // Build folder hierarchy
  const rootFolders = [];
  folders.forEach(folder => {
    const folderId = folder._id.toString();
    const folderNode = folderMap.get(folderId);

    if (folder.parentFolder) {
      const parentId = folder.parentFolder.toString();
      const parent = folderMap.get(parentId);
      if (parent) {
        parent.children.push(folderNode);
      }
    } else {
      rootFolders.push(folderNode);
    }
  });

  // Assign documents to their folders
  documents.forEach(doc => {
    if (doc.folder) {
      const folderId = doc.folder.toString();
      const folder = folderMap.get(folderId);
      if (folder) {
        folder.documents.push({
          _id: doc._id,
          title: doc.title,
          originalFileName: doc.originalFileName,
          fileType: doc.fileType,
          fileSize: doc.fileSize,
          tags: doc.tags,
          uploadedBy: doc.uploadedBy,
          version: doc.version,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt
        });
      }
    }
  });

  // Calculate statistics
  const stats = {
    totalFolders: folders.length,
    totalDocuments: documents.length,
    rootFolders: rootFolders.length,
    fileTypes: documents.reduce((acc, doc) => {
      acc[doc.fileType] = (acc[doc.fileType] || 0) + 1;
      return acc;
    }, {}),
    totalSize: documents.reduce((sum, doc) => sum + doc.fileSize, 0)
  };

  return {
    _id: department._id,
    name: department.name,
    code: department.code,
    description: department.description,
    head: department.head,
    isActive: department.isActive,
    createdAt: department.createdAt,
    updatedAt: department.updatedAt,
    stats,
    folders: rootFolders,
    orphanDocuments: documents.filter(doc => !doc.folder).map(doc => ({
      _id: doc._id,
      title: doc.title,
      originalFileName: doc.originalFileName,
      fileType: doc.fileType,
      fileSize: doc.fileSize,
      tags: doc.tags,
      uploadedBy: doc.uploadedBy,
      version: doc.version,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    }))
  };
}

/**
 * Get folder tree starting from a specific folder
 */
export const getFolderTree = async (req, res) => {
  try {
    const { folderId } = req.params;

    const folder = await FolderModel.findById(folderId)
      .populate('department', 'name code')
      .populate('createdBy', 'name email');

    if (!folder) {
      return res.status(404).json({
        success: false,
        message: "Folder not found"
      });
    }

    const tree = await buildFolderSubtree(folderId);

    res.status(200).json({
      success: true,
      data: tree
    });

  } catch (error) {
    console.error("Error getting folder tree:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get folder tree",
      error: error.message
    });
  }
};

/**
 * Build subtree starting from a specific folder
 */
async function buildFolderSubtree(folderId) {
  const folder = await FolderModel.findById(folderId)
    .populate('createdBy', 'name email')
    .lean();

  if (!folder) return null;

  // Get child folders
  const childFolders = await FolderModel.find({
    parentFolder: folderId,
    isActive: true
  })
    .populate('createdBy', 'name email')
    .lean();

  // Get documents in this folder
  const documents = await DocumentModel.find({
    folder: folderId,
    isActive: true
  })
    .populate('uploadedBy', 'name email')
    .lean();

  // Recursively build child trees
  const children = await Promise.all(
    childFolders.map(child => buildFolderSubtree(child._id))
  );

  return {
    ...folder,
    children: children.filter(Boolean),
    documents: documents.map(doc => ({
      _id: doc._id,
      title: doc.title,
      originalFileName: doc.originalFileName,
      fileType: doc.fileType,
      fileSize: doc.fileSize,
      tags: doc.tags,
      uploadedBy: doc.uploadedBy,
      version: doc.version,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    }))
  };
}

/**
 * Get all departments with basic stats (for listing)
 */
export const getDepartmentsList = async (req, res) => {
  try {
    const departments = await DepartmentModel.find({ isActive: true })
      .populate('head', 'name email')
      .lean();

    const departmentsWithStats = await Promise.all(
      departments.map(async (dept) => {
        const folderCount = await FolderModel.countDocuments({
          department: dept._id,
          isActive: true
        });

        const documentCount = await DocumentModel.countDocuments({
          department: dept._id,
          isActive: true
        });

        return {
          ...dept,
          stats: {
            folderCount,
            documentCount
          }
        };
      })
    );

    res.status(200).json({
      success: true,
      data: departmentsWithStats
    });

  } catch (error) {
    console.error("Error getting departments list:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get departments list",
      error: error.message
    });
  }
};