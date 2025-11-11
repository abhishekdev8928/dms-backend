import DocumentModel from "../models/documentModel.js";
import FolderModel from "../models/folderModel.js";
import FolderPermissionModel from "../models/folderPermissionModel.js";

/**
 * Check if user has required access to a document
 * @param {string} requiredAccess - 'view', 'upload', 'edit', 'delete', 'download'
 */
export const checkDocumentPermission = (requiredAccess) => {
  return async (req, res, next) => {
    try {
      const { id } = req.params;
      const userId = req.user._id;
      const userRole = req.user.role;

      // SuperAdmin has all access
      if (userRole === "superadmin") {
        return next();
      }

      // Get document with folder
      const document = await DocumentModel.findById(id)
        .populate("folder")
        .populate("department");

      if (!document || !document.isActive) {
        return res.status(404).json({
          success: false,
          message: "Document not found",
        });
      }

      // Check if user is the uploader (owner has all rights)
      if (document.uploadedBy.toString() === userId.toString()) {
        return next();
      }

      // Check document-level permissions
      const docPermission = document.permissions?.find(
        (p) => p.user && p.user.toString() === userId.toString()
      );

      if (docPermission && docPermission.access.includes(requiredAccess)) {
        return next();
      }

      // Check folder-level permissions
      const folderPermission = await FolderPermissionModel.findOne({
        folder: document.folder._id,
        user: userId,
      });

      if (
        folderPermission &&
        folderPermission.access.includes(requiredAccess)
      ) {
        return next();
      }

      // Check folder access level
      const folder = document.folder;

      // If folder is 'department' access, check if user belongs to same department
      if (folder.folderAccess === "department") {
        if (
          req.user.department &&
          req.user.department.toString() === document.department.toString()
        ) {
          // Department members can view and download by default
          if (["view", "download"].includes(requiredAccess)) {
            return next();
          }
        }
      }

      // If folder is 'organization' access, all authenticated users can view/download
      if (folder.folderAccess === "organization") {
        if (["view", "download"].includes(requiredAccess)) {
          return next();
        }
      }

      return res.status(403).json({
        success: false,
        message: `You do not have permission to ${requiredAccess} this document`,
      });
    } catch (error) {
      console.error("Document permission check error:", error);
      return res.status(500).json({
        success: false,
        message: "Permission check failed",
        error: error.message,
      });
    }
  };
};

/**
 * Check if user can upload to a folder
 */
export const checkFolderUploadPermission = async (req, res, next) => {
  try {
    const { folderId } = req.body;
    const userId = req.user._id;
    const userRole = req.user.role;

    // SuperAdmin has all access
    if (userRole === "superadmin") {
      return next();
    }

    if (!folderId) {
      return res.status(400).json({
        success: false,
        message: "Folder ID is required",
      });
    }

    const folder = await FolderModel.findById(folderId);

    if (!folder || !folder.isActive) {
      return res.status(404).json({
        success: false,
        message: "Folder not found",
      });
    }

    // Check if user is folder creator
    if (folder.createdBy.toString() === userId.toString()) {
      return next();
    }

    // Check folder permissions
    const folderPermission = await FolderPermissionModel.findOne({
      folder: folderId,
      user: userId,
    });

    if (folderPermission && folderPermission.access.includes("upload")) {
      return next();
    }

    // Check folder access level for department
    if (folder.folderAccess === "department") {
      if (
        req.user.department &&
        req.user.department.toString() === folder.department.toString()
      ) {
        // Department members with admin role can upload
        if (["admin"].includes(userRole)) {
          return next();
        }
      }
    }

    return res.status(403).json({
      success: false,
      message: "You do not have permission to upload to this folder",
    });
  } catch (error) {
    console.error("Folder upload permission check error:", error);
    return res.status(500).json({
      success: false,
      message: "Permission check failed",
      error: error.message,
    });
  }
};

/**
 * Check if user can manage document permissions (admin only)
 */
export const checkManagePermission = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;

    // SuperAdmin and Admin can manage permissions
    if (["superadmin", "admin"].includes(userRole)) {
      return next();
    }

    const document = await DocumentModel.findById(id);

    if (!document || !document.isActive) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Only document owner can manage permissions
    if (document.uploadedBy.toString() === userId.toString()) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: "Only document owner or admins can manage permissions",
    });
  } catch (error) {
    console.error("Manage permission check error:", error);
    return res.status(500).json({
      success: false,
      message: "Permission check failed",
      error: error.message,
    });
  }
};

/**
 * Filter documents based on user permissions (for GET all documents)
 */
export const buildDocumentAccessQuery = (user) => {
  const userId = user._id;
  const userRole = user.role;

  // SuperAdmin sees everything
  if (userRole === "superadmin") {
    return { isActive: true };
  }

  // Build query for accessible documents
  return {
    isActive: true,
    $or: [
      // Documents uploaded by user
      { uploadedBy: userId },

      // Documents with explicit user permissions
      { "permissions.user": userId },

      // Documents in department-access folders (same department)
      {
        $and: [
          { department: user.department },
          // This will be joined with folder to check folderAccess
        ],
      },

      // Documents in organization-access folders
      // This will be joined with folder to check folderAccess
    ],
  };
};

/**
 * Validate document data before creation/update
 */
export const validateDocumentData = (req, res, next) => {
  const { fileType, fileSize, title } = req.body;

  // ✅ Supported formats (extension based)
  const SUPPORTED_FORMATS = {
    document: ["pdf", "docx"],
    spreadsheet: ["xlsx"],
    image: ["jpg", "jpeg", "png"],
    archive: ["zip"],
    video: ["mp4"],
  };

  // ✅ Flatten allowed types list
  const allowedTypes = Object.values(SUPPORTED_FORMATS).flat();

  // ✅ Normalize and validate file type (extension only)
  if (fileType) {
    const normalizedType = fileType.toLowerCase().replace("application/", "").replace("image/", "").replace("video/", "");
    if (!allowedTypes.includes(normalizedType)) {
      return res.status(400).json({
        success: false,
        message: `File type '${fileType}' is not supported. Allowed types: ${allowedTypes.join(", ").toUpperCase()}`
      });
    }
  }

  // ✅ File size validation using ENV variable
  const maxSize = Number(process.env.MAX_FILE_SIZE || 100 * 1024 * 1024); // Default 100MB
  if (fileSize && fileSize > maxSize) {
    return res.status(400).json({
      success: false,
      message: `File size exceeds maximum limit of ${(maxSize / (1024 * 1024)).toFixed(0)}MB`
    });
  }

  // ✅ Title validation
  if (title && title.length > 255) {
    return res.status(400).json({
      success: false,
      message: "Title must not exceed 255 characters"
    });
  }

  return next();
};


/**
 * Validate role-based permissions
 */
export const validatePermissionData = (req, res, next) => {
  const { permissions } = req.body;

  if (!permissions || !Array.isArray(permissions)) {
    return res.status(400).json({
      success: false,
      message: "Permissions must be an array",
    });
  }

  const validRoles = ["superadmin", "admin", "team_member", "member_bank"];
  const validAccess = ["view", "edit", "delete", "download"];

  for (const perm of permissions) {
    if (!perm.user) {
      return res.status(400).json({
        success: false,
        message: "Each permission must have a user",
      });
    }

    if (perm.role && !validRoles.includes(perm.role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role: ${perm.role}. Valid roles: ${validRoles.join(
          ", "
        )}`,
      });
    }

    if (perm.access && Array.isArray(perm.access)) {
      for (const access of perm.access) {
        if (!validAccess.includes(access)) {
          return res.status(400).json({
            success: false,
            message: `Invalid access type: ${access}. Valid types: ${validAccess.join(
              ", "
            )}`,
          });
        }
      }
    }
  }

  next();
};
