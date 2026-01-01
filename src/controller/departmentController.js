import createHttpError from 'http-errors';
import DepartmentModel from '../models/departmentModel.js';
import mongoose from 'mongoose';
import { 
  sanitizeInputWithXSS, 
  sanitizeAndValidateId,
  validateRequest 
} from '../utils/helper.js';
import {
  createDepartmentSchema,
  getAllDepartmentsSchema,
  getDepartmentByIdSchema,
  updateDepartmentSchema,
  deleteDepartmentSchema,
  getDepartmentByNameSchema,
  getDepartmentHierarchySchema
} from '../validation/departmentValidation.js';
import { attachDepartmentActionsBulk } from '../utils/helper/departmentHelper.js';
export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  DEPARTMENT_OWNER: "DEPARTMENT_OWNER",
};
/**
 * Create a new department
 * Route: POST /api/departments
 * Access: Private - Super Admin, Admin only (via route middleware)
 */
export const createDepartment = async (req, res, next) => {
  try {
    const parsedData = createDepartmentSchema.safeParse(req.body);
    validateRequest(parsedData);

    const { name, description } = parsedData.data;
    const createdBy = req.user.id;

    const sanitizedName = sanitizeInputWithXSS(name);
    const sanitizedDescription = description ? sanitizeInputWithXSS(description) : '';

    // Check duplicate (only ORG departments)
    const existingDepartment = await DepartmentModel.findOne({
      name: { $regex: new RegExp(`^${sanitizedName}$`, 'i') },
      ownerType: 'ORG'
    });

    if (existingDepartment) {
      throw createHttpError(409, 'Department with this name already exists');
    }

    // Create ORG department
    const department = await DepartmentModel.create({
      name: sanitizedName,
      description: sanitizedDescription,
      ownerType: 'ORG',
      ownerId: null,
      createdBy
    });

    res.status(201).json({
      success: true,
      message: 'Department created successfully',
      data: department
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all departments with pagination and filtering
 * Route: GET /api/departments
 * Access: Private - All authenticated users (filtered by access)
 * 
 * NOTE: This returns ONLY ORG departments (not MyDrive)
 * MyDrive should be accessed via separate endpoint
 */
export const getAllDepartments = async (req, res, next) => {
  try {
    const parsedData = getAllDepartmentsSchema.safeParse(req.query);
    validateRequest(parsedData);

    const { 
      page = '1', 
      limit = '10', 
      search = '', 
      sortBy = 'createdAt', 
      order = 'desc', 
      activeOnly 
    } = parsedData.data;

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const skip = (pageNum - 1) * limitNum;
    const sortOrder = order === 'asc' ? 1 : -1;

    // Build query based on user role - ONLY ORG departments
    let query = { ownerType: 'ORG' }; // 🔥 KEY FIX: Only return ORG departments
    const { role, departments } = req.user;
    
    if (role === ROLES.SUPER_ADMIN) {
      // Super Admin sees all ORG departments
      // query already has ownerType: 'ORG'
    } else {
      // Others see only their assigned ORG departments
      query._id = { $in: departments };
    }
    
    if (activeOnly === 'true') {
      query.isActive = true;
    }

    if (search) {
      const sanitizedSearch = sanitizeInputWithXSS(search);
      query.$or = [
        { name: { $regex: sanitizedSearch, $options: 'i' } },
        { description: { $regex: sanitizedSearch, $options: 'i' } }
      ];
    }

    // Get data with .lean() for plain objects
    const [totalCount, departmentsData] = await Promise.all([
      DepartmentModel.countDocuments(query),
      DepartmentModel.find(query)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limitNum)
        .populate('createdBy', 'username email')
        .populate('updatedBy', 'username email')
        .populate('ownerId', 'username email')
        .lean() // ✅ Convert to plain objects
    ]);

    // 🔐 Attach actions based on user role
    const departmentsWithActions = attachDepartmentActionsBulk(departmentsData, req.user);

    res.status(200).json({
      success: true,
      count: totalCount,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(totalCount / limitNum),
      data: departmentsWithActions
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get department by ID
 * Route: GET /api/departments/:id
 * Access: Private - All authenticated users (with access check)
 */
export const getDepartmentById = async (req, res, next) => {
  try {
    const parsedData = getDepartmentByIdSchema.safeParse(req.params);
    validateRequest(parsedData);

    const { id } = parsedData.data;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw createHttpError(400, 'Invalid department ID format');
    }

    const departmentId = new mongoose.Types.ObjectId(id);

    const department = await DepartmentModel.findById(departmentId)
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email')
      .populate('ownerId', 'username email');

    if (!department) {
      throw createHttpError(404, 'Department not found');
    }

    // Check access
    const { role, departments, myDriveDepartmentId } = req.user;
    
    let hasAccess = false;
    
    // 🔥 MyDrive Check FIRST - Even Super Admin cannot access other's MyDrive
    if (department.ownerType === 'USER') {
      // MyDrive: ONLY the owner can access
      const myDriveId = myDriveDepartmentId?._id || myDriveDepartmentId;
      hasAccess = myDriveId && 
                  myDriveId.toString() === departmentId.toString();
    } else if (role === ROLES.SUPER_ADMIN) {
      // Super Admin can access all ORG departments
      hasAccess = true;
    } else {
      // For ORG departments, check if in assigned list
      hasAccess = departments.some(dept => {
        const deptId = dept._id || dept;
        return deptId.toString() === departmentId.toString();
      });
    }
    
    if (!hasAccess) {
      throw createHttpError(
        403, 
        'Access denied. You do not have access to this department'
      );
    }

    res.status(200).json({
      success: true,
      data: department
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update department
 * Route: PATCH /api/departments/:id
 * Access: Private - Super Admin, Admin, Dept Owner (via route middleware)
 */
export const updateDepartment = async (req, res, next) => {
  try {
    const paramsData = getDepartmentByIdSchema.safeParse(req.params);
    validateRequest(paramsData);

    const bodyData = updateDepartmentSchema.safeParse(req.body);
    validateRequest(bodyData);

    const { id } = paramsData.data;
    const { name, description, isActive } = bodyData.data;
    const updatedBy = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw createHttpError(400, 'Invalid department ID format');
    }

    const departmentId = new mongoose.Types.ObjectId(id);

    const department = await DepartmentModel.findById(departmentId);
    
    if (!department) {
      throw createHttpError(404, 'Department not found');
    }

    // Cannot update MyDrive departments
    if (department.ownerType === 'USER') {
      throw createHttpError(403, 'Cannot update MyDrive departments');
    }

    // Verify user has access to this department
    const { role, departments } = req.user;
    
    if (role !== ROLES.SUPER_ADMIN) {
      // 🔥 FIX: Handle both populated and unpopulated departments
      const hasAccess = departments.some(dept => {
        // If dept is an object (populated)
        if (dept._id) {
          return dept._id.toString() === departmentId.toString();
        }
        // If dept is just an ObjectId
        return dept.toString() === departmentId.toString();
      });
      
      if (!hasAccess) {
        // 🔥 DEBUG: Log to see what's happening
        console.log('User departments:', departments.map(d => d._id || d));
        console.log('Trying to access department:', departmentId.toString());
        throw createHttpError(403, 'Access denied. You cannot update this department');
      }
    }

    // Check duplicate name if updating
    if (name && name !== department.name) {
      const sanitizedName = sanitizeInputWithXSS(name);
      const duplicate = await DepartmentModel.findOne({
        name: { $regex: new RegExp(`^${sanitizedName}$`, 'i') },
        ownerType: 'ORG',
        _id: { $ne: departmentId }
      });

      if (duplicate) {
        throw createHttpError(409, 'Department with this name already exists');
      }

      department.name = sanitizedName;
      if (department.buildPath) {
        department.buildPath();
      }
    }

    if (description !== undefined) {
      department.description = sanitizeInputWithXSS(description);
    }
    
    // 🔥 FIX: Only SUPER_ADMIN can change isActive status
    if (isActive !== undefined) {
      if (role === ROLES.SUPER_ADMIN) {
        department.isActive = isActive;
      } else {
        throw createHttpError(403, 'Only Super Admin can change department status');
      }
    }
    
    department.updatedBy = updatedBy;

    await department.save();

    res.status(200).json({
      success: true,
      message: 'Department updated successfully',
      data: department
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete department permanently
 * Route: DELETE /api/departments/:id
 * Access: Private - Super Admin only (via route middleware)
 */
export const deleteDepartment = async (req, res, next) => {
  try {
    const parsedData = deleteDepartmentSchema.safeParse(req.params);
    validateRequest(parsedData);

    const { id } = parsedData.data;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw createHttpError(400, 'Invalid department ID format');
    }

    const departmentId = new mongoose.Types.ObjectId(id);

    const department = await DepartmentModel.findById(departmentId);

    if (!department) {
      throw createHttpError(404, 'Department not found');
    }

    // Cannot delete MyDrive departments
    if (department.ownerType === 'USER') {
      throw createHttpError(403, 'Cannot delete MyDrive departments');
    }

    await DepartmentModel.findByIdAndDelete(departmentId);

    res.status(200).json({
      success: true,
      message: 'Department deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Deactivate department
 * Route: PATCH /api/departments/:id/deactivate
 * Access: Private - Super Admin, Admin (via route middleware)
 */
export const deactivateDepartment = async (req, res, next) => {
  try {
    const parsedData = getDepartmentByIdSchema.safeParse(req.params);
    validateRequest(parsedData);

    const { id } = parsedData.data;
    const updatedBy = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw createHttpError(400, 'Invalid department ID format');
    }

    const departmentId = new mongoose.Types.ObjectId(id);

    const department = await DepartmentModel.findById(departmentId);

    if (!department) {
      throw createHttpError(404, 'Department not found');
    }

    // Cannot deactivate MyDrive
    if (department.ownerType === 'USER') {
      throw createHttpError(403, 'Cannot deactivate MyDrive departments');
    }

    // Verify access for non-Super Admins
    const { role, departments } = req.user;
    
    if (role !== ROLES.SUPER_ADMIN) {
      const hasAccess = departments.some(
        deptId => deptId.toString() === departmentId.toString()
      );
      
      if (!hasAccess) {
        throw createHttpError(403, 'Access denied');
      }
    }

    department.isActive = false;
    department.updatedBy = updatedBy;
    await department.save();

    res.status(200).json({
      success: true,
      message: 'Department deactivated successfully',
      data: department
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Activate department
 * Route: PATCH /api/departments/:id/activate
 * Access: Private - Super Admin, Admin (via route middleware)
 */
export const activateDepartment = async (req, res, next) => {
  try {
    const parsedData = getDepartmentByIdSchema.safeParse(req.params);
    validateRequest(parsedData);

    const { id } = parsedData.data;
    const updatedBy = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw createHttpError(400, 'Invalid department ID format');
    }

    const departmentId = new mongoose.Types.ObjectId(id);

    const department = await DepartmentModel.findById(departmentId);

    if (!department) {
      throw createHttpError(404, 'Department not found');
    }

    // Verify access for non-Super Admins
    const { role, departments } = req.user;
    
    if (role !== ROLES.SUPER_ADMIN) {
      const hasAccess = departments.some(
        deptId => deptId.toString() === departmentId.toString()
      );
      
      if (!hasAccess) {
        throw createHttpError(403, 'Access denied');
      }
    }

    department.isActive = true;
    department.updatedBy = updatedBy;
    await department.save();

    res.status(200).json({
      success: true,
      message: 'Department activated successfully',
      data: department
    });
  } catch (error) {
    next(error);
  }
};