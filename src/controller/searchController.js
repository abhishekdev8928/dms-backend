import DocumentModel from "../models/documentModel.js";
import FolderModel from "../models/folderModel.js";
import UserModel from "../models/userModel.js"
/**
 * Simple Search Controller - Search by name with type and date filters
 */

/**
 * Main search function
 * Supports:
 * - Search by folder/file name
 * - Filter by type (folders, pdf, docs, images, videos, zip)
 * - Filter by modified date
 */
export const search = async (req, res) => {
  try {
    const {
      query,              // Search term for name
      type = 'all',       // 'all', 'folders', 'pdf', 'docs', 'images', 'videos', 'zip'
      modifiedFrom,       // Modified date from (ISO format)
      modifiedTo,         // Modified date to (ISO format)
      page = 1,
      limit = 20
    } = req.query;

    // Validate search query
    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters'
      });
    }

    // Create search regex for name
    const searchRegex = new RegExp(query.trim(), 'i');

    // Base queries
    let documentQuery = {
      isDeleted: false,
      name: searchRegex
    };

    let folderQuery = {
      isDeleted: false,
      name: searchRegex
    };

    // Modified date filter
    if (modifiedFrom || modifiedTo) {
      const dateFilter = {};
      if (modifiedFrom) {
        dateFilter.$gte = new Date(modifiedFrom);
      }
      if (modifiedTo) {
        dateFilter.$lte = new Date(modifiedTo);
      }
      documentQuery.updatedAt = dateFilter;
      folderQuery.updatedAt = dateFilter;
    }

    // Type-based filtering
    let searchFolders = false;
    let searchDocuments = false;

    // Define extension mappings
    const typeExtensionMap = {
      'pdf': ['pdf'],
      'docs': ['doc', 'docx', 'txt', 'rtf', 'odt'],
      'images': ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'],
      'videos': ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm'],
      'zip': ['zip', 'rar', '7z', 'tar', 'gz']
    };

    if (type === 'all') {
      searchFolders = true;
      searchDocuments = true;
    } else if (type === 'folders') {
      searchFolders = true;
    } else if (typeExtensionMap[type]) {
      searchDocuments = true;
      documentQuery.extension = { $in: typeExtensionMap[type] };
    } else {
      searchDocuments = true;
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Default sorting by most recently modified
    const sort = { updatedAt: -1 };

    // Execute searches based on type filter
    let documents = [];
    let folders = [];
    let totalDocuments = 0;
    let totalFolders = 0;

    if (searchDocuments) {
      [documents, totalDocuments] = await Promise.all([
        DocumentModel.find(documentQuery)
          .sort(sort)
          .skip(skip)
          .limit(parseInt(limit))
          .populate('createdBy', 'name email')
          .lean(),
        DocumentModel.countDocuments(documentQuery)
      ]);
    }

    if (searchFolders) {
      [folders, totalFolders] = await Promise.all([
        FolderModel.find(folderQuery)
          .sort(sort)
          .skip(skip)
          .limit(parseInt(limit))
          .populate('createdBy', 'name email')
          .lean(),
        FolderModel.countDocuments(folderQuery)
      ]);
    }

    // Combine and format results
    const results = [
      ...folders.map(folder => ({
        _id: folder._id,
        name: folder.name,
        type: 'folder',
        path: folder.path,
        color: folder.color,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt,
        createdBy: folder.createdBy,
        breadcrumbs: folder.path.split('/').filter(part => part.length > 0)
      })),
     ...documents.map(doc => ({
  _id: doc._id,
  name: doc.name,
  type: 'document',
  parent_id: doc.parent_id || null, // ✅ Added this
  path: doc.path,
  extension: doc.extension,
  size: doc.size,
  mimeType: doc.mimeType,
  fileUrl: doc.fileUrl,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
  createdBy: doc.createdBy,
  breadcrumbs: doc.path.split('/').filter(part => part.length > 0)
}))

    ];

    // Sort combined results by updated date
    results.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    // Calculate pagination info
    const totalResults = totalDocuments + totalFolders;
    const totalPages = Math.ceil(totalResults / parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        results,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalResults,
          totalDocuments,
          totalFolders,
          limit: parseInt(limit),
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1
        },
        filters: {
          query,
          type,
          modifiedFrom,
          modifiedTo
        }
      }
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      success: false,
      message: 'Error performing search',
      error: error.message
    });
  }
};

/**
 * Quick search - For autocomplete/suggestions
 */
export const quickSearch = async (req, res) => {
  try {
    const { query, limit = 10 } = req.query;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters'
      });
    }

    const searchRegex = new RegExp(query.trim(), 'i');
    const baseQuery = {
      isDeleted: false,
      name: searchRegex
    };

    const [documents, folders] = await Promise.all([
      DocumentModel.find(baseQuery)
        .select('name path type extension updatedAt')
        .limit(parseInt(limit) / 2)
        .sort({ updatedAt: -1 })
        .lean(),
      FolderModel.find(baseQuery)
        .select('name path type color updatedAt')
        .limit(parseInt(limit) / 2)
        .sort({ updatedAt: -1 })
        .lean()
    ]);

    const results = [
      ...folders.map(f => ({ ...f, type: 'folder' })),
      ...documents.map(d => ({ ...d, type: 'document' }))
    ]
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, parseInt(limit));

    res.status(200).json({
      success: true,
      data: results
    });

  } catch (error) {
    console.error('Quick search error:', error);
    res.status(500).json({
      success: false,
      message: 'Error performing quick search',
      error: error.message
    });
  }
};

/**
 * Get available filter types with counts
 */
export const getFilterTypes = async (req, res) => {
  try {
    const { query } = req.query;

    let baseQuery = { isDeleted: false };

    // If search query exists, add name filter
    if (query && query.trim()) {
      const searchRegex = new RegExp(query.trim(), 'i');
      baseQuery.name = searchRegex;
    }

    // Count folders
    const foldersCount = await FolderModel.countDocuments(baseQuery);

    // Count documents by type
    const [pdfCount, docsCount, imagesCount, videosCount, zipCount] = await Promise.all([
      DocumentModel.countDocuments({ 
        ...baseQuery, 
        extension: { $in: ['pdf'] } 
      }),
      DocumentModel.countDocuments({ 
        ...baseQuery, 
        extension: { $in: ['doc', 'docx', 'txt', 'rtf', 'odt'] } 
      }),
      DocumentModel.countDocuments({ 
        ...baseQuery, 
        extension: { $in: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'] } 
      }),
      DocumentModel.countDocuments({ 
        ...baseQuery, 
        extension: { $in: ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm'] } 
      }),
      DocumentModel.countDocuments({ 
        ...baseQuery, 
        extension: { $in: ['zip', 'rar', '7z', 'tar', 'gz'] } 
      })
    ]);

    res.status(200).json({
      success: true,
      data: {
        filterTypes: [
          { type: 'folders', label: 'Folders', count: foldersCount },
          { type: 'pdf', label: 'PDF', count: pdfCount },
          { type: 'docs', label: 'Docs', count: docsCount },
          { type: 'images', label: 'Images', count: imagesCount },
          { type: 'videos', label: 'Videos', count: videosCount },
          { type: 'zip', label: 'Zip Files', count: zipCount }
        ]
      }
    });

  } catch (error) {
    console.error('Get filter types error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching filter types',
      error: error.message
    });
  }
};


/**
 * Get all users with only required fields for frontend display
 * @route GET /api/users
 * @access Private (requires authentication)
 */
export const getAllUsers = async (req, res) => {
  try {
    // Fetch all active users with only the fields needed for display
    const users = await UserModel.find(
      { isActive: true }, // Only get active users
      {
        // Select only required fields
        _id: 1,
        username: 1,
        email: 1,
        profilePic: 1,
        role: 1,
        departments: 1,
      }
    )
      .populate("departments", "name") // If you want to include department names
      .sort({ createdAt: -1 }) // Sort by newest first
      .lean(); // Returns plain JavaScript objects (better performance)

    // Transform data to match frontend requirements
    const formattedUsers = users.map((user) => ({
      id: user._id,
      name: user.username,
      email: user.email,
      profilePic: user.profilePic || generateDefaultAvatar(user.username),
      role: user.role,
      departments: user.departments || [],
    }));

    return res.status(200).json({
      success: true,
      count: formattedUsers.length,
      data: formattedUsers,
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching users",
      error: error.message,
    });
  }
};



/**
 * Helper function to generate default avatar based on username
 * @param {String} username
 * @returns {String} Avatar URL or initial
 */
function generateDefaultAvatar(username) {
  if (!username) return null;
  
  // Return first letter of username for initial-based avatars
  return username.charAt(0).toUpperCase();
  
  // Or use a service like UI Avatars:
  // return `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=random`;
}