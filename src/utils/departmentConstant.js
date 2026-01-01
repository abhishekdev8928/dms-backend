/**
 * Department Constants - Simple CRUD Permissions
 */

// ==================== ROLES ====================
export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  DEPARTMENT_OWNER: 'DEPARTMENT_OWNER',
  USER: 'USER'
};

// ==================== ROLE PERMISSIONS (CRUD) ====================
export const DEPARTMENT_PERMISSIONS = {
  [ROLES.SUPER_ADMIN]: {
    create: true,
    read: true,
    update: true,
    delete: true
  },
  
  [ROLES.ADMIN]: {
    create: true,
    read: true,
    update: true,
    delete: false
  },
  
  [ROLES.DEPARTMENT_OWNER]: {
    create: false,
    read: true,
    update: true,
    delete: false
  },
  
  [ROLES.USER]: {
    create: false,
    read: true,
    update: false,
    delete: false
  }
};