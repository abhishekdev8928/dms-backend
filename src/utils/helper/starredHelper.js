

/**
 * Filter starred folders by user permissions
 * Returns only folders the user has 'view' access to
 * @param {Array} folders - Array of folder documents
 * @param {Object} user - User document
 * @returns {Promise<Array>} Filtered folders with actions
 */
export async function filterAccessibleStarredFolders(folders, user) {
  if (!folders || folders.length === 0) return [];

  const userGroupIds = user.groups || [];
  const accessibleFolders = [];

  for (const folder of folders) {
    // Skip deleted folders
    if (folder.isDeleted) continue;

    // Get department
    const department = await getDepartment(folder);
    if (!department) continue;

    // Check if user has implicit access (fast path)
    if (hasImplicitAccess(user, department)) {
      accessibleFolders.push(folder);
      continue;
    }

    // Check if user has at least 'view' permission
    const hasView = await hasPermission(
      user,
      folder,
      "FOLDER",
      "view",
      userGroupIds
    );

    if (hasView) {
      accessibleFolders.push(folder);
    }
  }

  // Attach actions to all accessible folders
  return await attachActionsBulk(accessibleFolders, user);
}

/**
 * Filter starred documents by user permissions
 * Returns only documents the user has 'view' access to
 * @param {Array} documents - Array of document documents
 * @param {Object} user - User document
 * @returns {Promise<Array>} Filtered documents with actions
 */
export async function filterAccessibleStarredDocuments(documents, user) {
  if (!documents || documents.length === 0) return [];

  const userGroupIds = user.groups || [];
  const accessibleDocuments = [];

  for (const document of documents) {
    // Skip deleted documents
    if (document.isDeleted) continue;

    // Get department
    const department = await getDepartment(document);
    if (!department) continue;

    // Check if user has implicit access (fast path)
    if (hasImplicitAccess(user, department)) {
      accessibleDocuments.push(document);
      continue;
    }

    // Check if user has at least 'view' permission
    const hasView = await hasPermission(
      user,
      document,
      "DOCUMENT",
      "view",
      userGroupIds
    );

    if (hasView) {
      accessibleDocuments.push(document);
    }
  }

  // Attach actions to all accessible documents
  return await attachActionsBulk(accessibleDocuments, user);
}

/**
 * Filter all starred items (folders + documents) by user permissions
 * @param {Object} starredData - Object with folders and documents arrays
 * @param {Object} user - User document
 * @returns {Promise<Object>} Filtered folders and documents with actions
 */
export async function filterAccessibleStarredItems(starredData, user) {
  const { folders = [], documents = [] } = starredData;

  const [accessibleFolders, accessibleDocuments] = await Promise.all([
    filterAccessibleStarredFolders(folders, user),
    filterAccessibleStarredDocuments(documents, user),
  ]);

  return {
    folders: accessibleFolders,
    documents: accessibleDocuments,
    totalCount: accessibleFolders.length + accessibleDocuments.length,
  };
}