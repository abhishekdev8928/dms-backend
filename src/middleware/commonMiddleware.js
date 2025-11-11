import createError from "http-errors";


/**
 * Middleware to authorize users by role
 * @param {string[]} allowedRoles - Array of roles that can access the route
 */
export const authorizeRole = (allowedRoles = []) => {
  return (req, res, next) => {
    try {
      // Ensure req.user exists (set by auth middleware)
      if (!req.user || !req.user.role) {
        throw createError.Unauthorized("User not authenticated");
      }

      // Check if the user's role is allowed
      if (!allowedRoles.includes(req.user.role)) {
        throw createError.Forbidden("You do not have permission to perform this action");
      }

      // User is allowed, continue
      next();
    } catch (err) {
      next(err);
    }
  };
};