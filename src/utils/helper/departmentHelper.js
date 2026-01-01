import { DEPARTMENT_PERMISSIONS } from "../departmentConstant.js";

/**
 * Add actions to department based on user role
 * @param {Object} department - Department object
 * @param {Object} user - User object with role
 * @returns {Object} Department with actions attached
 */
export const attachDepartmentActions = (department, user) => {
  const permissions = DEPARTMENT_PERMISSIONS[user.role] || DEPARTMENT_PERMISSIONS[ROLES.USER];
  
  return {
    ...department,
    actions: permissions
  };
};

/**
 * Add actions to multiple departments (bulk)
 * @param {Array} departments - Array of department objects
 * @param {Object} user - User object with role
 * @returns {Array} Departments with actions attached
 */
export const attachDepartmentActionsBulk = (departments, user) => {
  const permissions = DEPARTMENT_PERMISSIONS[user.role] ;
  
  return departments.map(department => ({
    ...department,
    actions: permissions
  }));
};