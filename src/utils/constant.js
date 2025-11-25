

export const FILE_FORMAT_GROUPS = {
 
  PDF: {
    extensions: ['.pdf'],
    mimeTypes: ['application/pdf'],
    category: 'document',
    description: 'Portable Document Format'
  },
  
  WORD: {
    extensions: ['.doc', '.docx'],
    mimeTypes: [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ],
    category: 'document',
    description: 'Microsoft Word Documents'
  },
  
  EXCEL: {
    extensions: ['.xls', '.xlsx'],
    mimeTypes: [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ],
    category: 'document',
    description: 'Microsoft Excel Spreadsheets'
  },
  
  POWERPOINT: {
    extensions: ['.ppt', '.pptx'],
    mimeTypes: [
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ],
    category: 'document',
    description: 'Microsoft PowerPoint Presentations'
  },
  
  TEXT: {
    extensions: ['.txt', '.rtf'],
    mimeTypes: ['text/plain', 'application/rtf', 'text/rtf'],
    category: 'document',
    description: 'Plain Text and Rich Text Format'
  },
  
  CSV: {
    extensions: ['.csv'],
    mimeTypes: ['text/csv', 'application/csv'],
    category: 'document',
    description: 'Comma-Separated Values'
  },
  
  OPENOFFICE: {
    extensions: ['.odt', '.ods', '.odp'],
    mimeTypes: [
      'application/vnd.oasis.opendocument.text',
      'application/vnd.oasis.opendocument.spreadsheet',
      'application/vnd.oasis.opendocument.presentation'
    ],
    category: 'document',
    description: 'OpenOffice/LibreOffice Documents'
  },

  // Images
  JPEG: {
    extensions: ['.jpg', '.jpeg'],
    mimeTypes: ['image/jpeg'],
    category: 'image',
    description: 'JPEG Images'
  },
  
  PNG: {
    extensions: ['.png'],
    mimeTypes: ['image/png'],
    category: 'image',
    description: 'Portable Network Graphics'
  },
  
  GIF: {
    extensions: ['.gif'],
    mimeTypes: ['image/gif'],
    category: 'image',
    description: 'Graphics Interchange Format'
  },
  
  BMP: {
    extensions: ['.bmp'],
    mimeTypes: ['image/bmp', 'image/x-windows-bmp'],
    category: 'image',
    description: 'Bitmap Images'
  },
  
  TIFF: {
    extensions: ['.tiff', '.tif'],
    mimeTypes: ['image/tiff'],
    category: 'image',
    description: 'Tagged Image File Format'
  },
  
  WEBP: {
    extensions: ['.webp'],
    mimeTypes: ['image/webp'],
    category: 'image',
    description: 'WebP Images'
  },

  // Archives
  ZIP: {
    extensions: ['.zip'],
    mimeTypes: ['application/zip', 'application/x-zip-compressed'],
    category: 'archive',
    description: 'ZIP Archive'
  },
  
  RAR: {
    extensions: ['.rar'],
    mimeTypes: ['application/vnd.rar', 'application/x-rar-compressed'],
    category: 'archive',
    description: 'RAR Archive'
  },
  
  SEVEN_ZIP: {
    extensions: ['.7z'],
    mimeTypes: ['application/x-7z-compressed'],
    category: 'archive',
    description: '7-Zip Archive'
  },
  
  TAR: {
    extensions: ['.tar', '.tar.gz', '.tgz'],
    mimeTypes: ['application/x-tar', 'application/gzip'],
    category: 'archive',
    description: 'TAR Archive'
  },

  // Video
  VIDEO_COMMON: {
    extensions: ['.mp4', '.mov', '.avi'],
    mimeTypes: [
      'video/mp4',
      'video/quicktime',
      'video/x-msvideo'
    ],
    category: 'video',
    description: 'Common Video Formats'
  },

  // Design/Engineering
  AUTOCAD: {
    extensions: ['.dwg', '.dxf'],
    mimeTypes: [
      'application/acad',
      'image/vnd.dwg',
      'image/vnd.dxf'
    ],
    category: 'design',
    description: 'AutoCAD Files'
  },
  
  SVG: {
    extensions: ['.svg'],
    mimeTypes: ['image/svg+xml'],
    category: 'design',
    description: 'Scalable Vector Graphics'
  },

  // Configuration/Data
  JSON: {
    extensions: ['.json'],
    mimeTypes: ['application/json'],
    category: 'data',
    description: 'JSON Data'
  },
  
  XML: {
    extensions: ['.xml'],
    mimeTypes: ['application/xml', 'text/xml'],
    category: 'data',
    description: 'XML Data'
  }
};





export const ALLOWED_EXTENSIONS = Object.values(FILE_FORMAT_GROUPS)
  .flatMap(group => group.extensions)
  .map(ext => ext.toLowerCase());

export const ALLOWED_MIME_TYPES = Object.values(FILE_FORMAT_GROUPS)
  .flatMap(group => group.mimeTypes)
  .map(mime => mime.toLowerCase());



export const BLOCKED_EXTENSIONS = [
  // Executables
  '.exe', '.msi', '.com', '.scr',
  
  // Shell Scripts
  '.bat', '.cmd', '.sh', '.bash',
  
  // Scripting Languages
  '.js', '.ts', '.jsx', '.tsx',
  '.py', '.rb', '.php', '.pl', '.cgi',
  '.ps1', '.psm1',
  
  // System Files
  '.dll', '.sys', '.vbs', '.wsf',
  
  // Java
  '.jar', '.class',
  
  // Installers & Disk Images
  '.apk', '.deb', '.rpm',
  '.iso', '.img', '.dmg',
  
  // Shortcuts & Links
  '.lnk', '.url', '.desktop',
  
  // Other Dangerous
  '.torrent', '.gadget', '.inf'
];

export const BLOCKED_MIME_TYPES = [
  // Executables
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-executable',
  
  // Scripts
  'application/javascript',
  'application/x-javascript',
  'text/javascript',
  'application/x-sh',
  'application/x-shellscript',
  'text/x-python',
  'application/x-php',
  
  // Archives (potentially dangerous)
  'application/x-iso9660-image',
  
  // Java
  'application/java-archive',
  'application/x-java-archive'
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Find the format group for a given file extension
 * @param {string} extension - File extension (with or without dot)
 * @returns {Object|null} - Format group object or null
 */
export function findGroupByExtension(extension) {
  const normalizedExt = extension.toLowerCase().startsWith('.')
    ? extension.toLowerCase()
    : `.${extension.toLowerCase()}`;

  for (const [groupName, group] of Object.entries(FILE_FORMAT_GROUPS)) {
    if (group.extensions.includes(normalizedExt)) {
      return { groupName, ...group };
    }
  }
  
  return null;
}

/**
 * Find the format group for a given MIME type
 * @param {string} mimeType - MIME type
 * @returns {Object|null} - Format group object or null
 */
export function findGroupByMimeType(mimeType) {
  const normalizedMime = mimeType.toLowerCase();

  for (const [groupName, group] of Object.entries(FILE_FORMAT_GROUPS)) {
    if (group.mimeTypes.includes(normalizedMime)) {
      return { groupName, ...group };
    }
  }
  
  return null;
}

/**
 * Check if two extensions belong to the same format group (for reupload validation)
 * @param {string} ext1 - First extension
 * @param {string} ext2 - Second extension
 * @returns {boolean} - True if both belong to same group
 */
export function areExtensionsEquivalent(ext1, ext2) {
  const group1 = findGroupByExtension(ext1);
  const group2 = findGroupByExtension(ext2);
  
  if (!group1 || !group2) return false;
  
  return group1.groupName === group2.groupName;
}

/**
 * Validate if a file extension is allowed
 * @param {string} extension - File extension
 * @returns {boolean} - True if allowed
 */
export function isExtensionAllowed(extension) {
  const normalizedExt = extension.toLowerCase().startsWith('.')
    ? extension.toLowerCase()
    : `.${extension.toLowerCase()}`;
    
  return ALLOWED_EXTENSIONS.includes(normalizedExt);
}

/**
 * Validate if a file extension is blocked
 * @param {string} extension - File extension
 * @returns {boolean} - True if blocked
 */
export function isExtensionBlocked(extension) {
  const normalizedExt = extension.toLowerCase().startsWith('.')
    ? extension.toLowerCase()
    : `.${extension.toLowerCase()}`;
    
  return BLOCKED_EXTENSIONS.includes(normalizedExt);
}

/**
 * Validate if a MIME type is allowed
 * @param {string} mimeType - MIME type
 * @returns {boolean} - True if allowed
 */
export function isMimeTypeAllowed(mimeType) {
  return ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase());
}

/**
 * Validate if a MIME type is blocked
 * @param {string} mimeType - MIME type
 * @returns {boolean} - True if blocked
 */
export function isMimeTypeBlocked(mimeType) {
  return BLOCKED_MIME_TYPES.includes(mimeType.toLowerCase());
}

/**
 * Get all extensions for a specific category
 * @param {string} category - Category name (document, image, archive, etc.)
 * @returns {Array<string>} - Array of extensions
 */
export function getExtensionsByCategory(category) {
  return Object.values(FILE_FORMAT_GROUPS)
    .filter(group => group.category === category)
    .flatMap(group => group.extensions);
}

/**
 * Comprehensive file validation
 * @param {string} extension - File extension
 * @param {string} mimeType - MIME type
 * @returns {Object} - Validation result with details
 */
export function validateFile(extension, mimeType) {
  const normalizedExt = extension.toLowerCase().startsWith('.')
    ? extension.toLowerCase()
    : `.${extension.toLowerCase()}`;
  const normalizedMime = mimeType.toLowerCase();

  // Check if blocked first
  if (isExtensionBlocked(normalizedExt)) {
    return {
      valid: false,
      reason: 'Extension is blocked for security reasons',
      extension: normalizedExt
    };
  }

  if (isMimeTypeBlocked(normalizedMime)) {
    return {
      valid: false,
      reason: 'MIME type is blocked for security reasons',
      mimeType: normalizedMime
    };
  }

  // Check if allowed
  const extGroup = findGroupByExtension(normalizedExt);
  const mimeGroup = findGroupByMimeType(normalizedMime);

  if (!extGroup) {
    return {
      valid: false,
      reason: 'Extension is not in the allowed list',
      extension: normalizedExt
    };
  }

  if (!mimeGroup) {
    return {
      valid: false,
      reason: 'MIME type is not in the allowed list',
      mimeType: normalizedMime
    };
  }

  // Check if extension and MIME type match
  if (extGroup.groupName !== mimeGroup.groupName) {
    return {
      valid: false,
      reason: 'Extension and MIME type do not match',
      extension: normalizedExt,
      mimeType: normalizedMime,
      extensionGroup: extGroup.groupName,
      mimeTypeGroup: mimeGroup.groupName
    };
  }

  return {
    valid: true,
    group: extGroup.groupName,
    category: extGroup.category,
    extension: normalizedExt,
    mimeType: normalizedMime
  };
}

// ============================================================================
// EXPORT ALL
// ============================================================================

export default {
  FILE_FORMAT_GROUPS,
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  BLOCKED_EXTENSIONS,
  BLOCKED_MIME_TYPES,
  findGroupByExtension,
  findGroupByMimeType,
  areExtensionsEquivalent,
  isExtensionAllowed,
  isExtensionBlocked,
  isMimeTypeAllowed,
  isMimeTypeBlocked,
  getExtensionsByCategory,
  validateFile
};