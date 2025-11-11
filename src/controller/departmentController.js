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

/**
 * Create a new department
 * Route: POST /api/departments
 * Access: Private
 * Body:
 *   - name: string (required) - Department name (max 255 chars)
 *   - description: string (optional) - Department description
 * Response: { success: true, message, data: department }
 */
export const createDepartment = async (req, res, next) => {
  try {
    // Validate with Zod
    const parsedData = createDepartmentSchema.safeParse(req.body);
    validateRequest(parsedData);

    const { name, description } = parsedData.data;
    const createdBy = req.user.id;

    // Sanitize inputs
    const sanitizedName = sanitizeInputWithXSS(name);
    const sanitizedDescription = description ? sanitizeInputWithXSS(description) : '';

    // Check duplicate
    const existingDepartment = await DepartmentModel.findOne({
      name: { $regex: new RegExp(`^${sanitizedName}$`, 'i') }
    });

    if (existingDepartment) {
      throw createHttpError(409, 'Department with this name already exists');
    }

    // Create department
    const department = await DepartmentModel.create({
      name: sanitizedName,
      description: sanitizedDescription,
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
 * Access: Private
 * Query:
 *   - page: number (optional, default: 1) - Page number
 *   - limit: number (optional, default: 10, max: 100) - Items per page
 *   - search: string (optional) - Search in name and description
 *   - sortBy: string (optional, default: 'createdAt') - Field to sort by
 *   - order: 'asc' | 'desc' (optional, default: 'desc') - Sort order
 *   - activeOnly: 'true' | 'false' (optional) - Filter active departments only
 * Response: { success: true, count, page, limit, totalPages, data: [departments] }
 */
export const getAllDepartments = async (req, res, next) => {
  try {
    // Validate query params
    const parsedData = getAllDepartmentsSchema.safeParse(req.query);
    validateRequest(parsedData);

    const { page = '1', limit = '10', search = '', sortBy = 'createdAt', order = 'desc', activeOnly } = parsedData.data;

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const skip = (pageNum - 1) * limitNum;
    const sortOrder = order === 'asc' ? 1 : -1;

    // Build query
    let query = {};
    
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

    // Get data
    const [totalCount, departments] = await Promise.all([
      DepartmentModel.countDocuments(query),
      DepartmentModel.find(query)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limitNum)
        .populate('createdBy', 'username email name')
        .populate('updatedBy', 'username email name')
    ]);

    res.status(200).json({
      success: true,
      count: totalCount,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(totalCount / limitNum),
      data: departments
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get department by ID
 * Route: GET /api/departments/:id
 * Access: Private
 * Params:
 *   - id: ObjectId (required) - Department ID
 * Response: { success: true, data: department }
 */
export const getDepartmentById = async (req, res, next) => {
  try {
    // Validate params
    const parsedData = getDepartmentByIdSchema.safeParse(req.params);
    validateRequest(parsedData);

    const { id } = parsedData.data;
    const sanitizedId = sanitizeAndValidateId(id, 'Department ID');

    const department = await DepartmentModel.findById(sanitizedId)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!department) {
      throw createHttpError(404, 'Department not found');
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
 * Route: PUT /api/departments/:id
 * Access: Private
 * Params:
 *   - id: ObjectId (required) - Department ID
 * Body:
 *   - name: string (optional) - New department name
 *   - description: string (optional) - New description
 *   - isActive: boolean (optional) - Active status
 * Response: { success: true, message, data: department }
 */
export const updateDepartment = async (req, res, next) => {
  try {
    // Validate params
    const paramsData = getDepartmentByIdSchema.safeParse(req.params);
    validateRequest(paramsData);

    // Validate body
    const bodyData = updateDepartmentSchema.safeParse(req.body);
    validateRequest(bodyData);

    const { id } = paramsData.data;
    const { name, description, isActive } = bodyData.data;
    const updatedBy = req.user.id;

    const sanitizedId = sanitizeAndValidateId(id, 'Department ID');

    const department = await DepartmentModel.findById(sanitizedId);
    
    if (!department) {
      throw createHttpError(404, 'Department not found');
    }

    // Check duplicate name if updating
    if (name && name !== department.name) {
      const sanitizedName = sanitizeInputWithXSS(name);
      const duplicate = await DepartmentModel.findOne({
        name: { $regex: new RegExp(`^${sanitizedName}$`, 'i') },
        _id: { $ne: sanitizedId }
      });

      if (duplicate) {
        throw createHttpError(409, 'Department with this name already exists');
      }

      department.name = sanitizedName;
      department.buildPath();
    }

    if (description !== undefined) {
      department.description = sanitizeInputWithXSS(description);
    }
    if (isActive !== undefined) department.isActive = isActive;
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
 * Access: Private (Admin only)
 * Params:
 *   - id: ObjectId (required) - Department ID
 * Response: { success: true, message }
 */
export const deleteDepartment = async (req, res, next) => {
  try {
    const parsedData = deleteDepartmentSchema.safeParse(req.params);
    validateRequest(parsedData);

    const { id } = parsedData.data;
    const sanitizedId = sanitizeAndValidateId(id, 'Department ID');

    const department = await DepartmentModel.findByIdAndDelete(sanitizedId);

    if (!department) {
      throw createHttpError(404, 'Department not found');
    }

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
 * Access: Private
 * Params:
 *   - id: ObjectId (required) - Department ID
 * Response: { success: true, message, data: department }
 */
export const deactivateDepartment = async (req, res, next) => {
  try {
    const parsedData = getDepartmentByIdSchema.safeParse(req.params);
    validateRequest(parsedData);

    const { id } = parsedData.data;
    const sanitizedId = sanitizeAndValidateId(id, 'Department ID');
    const updatedBy = req.user.id;

    const department = await DepartmentModel.findById(sanitizedId);

    if (!department) {
      throw createHttpError(404, 'Department not found');
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
 * Access: Private
 * Params:
 *   - id: ObjectId (required) - Department ID
 * Response: { success: true, message, data: department }
 */
export const activateDepartment = async (req, res, next) => {
  try {
    const parsedData = getDepartmentByIdSchema.safeParse(req.params);
    validateRequest(parsedData);

    const { id } = parsedData.data;
    const sanitizedId = sanitizeAndValidateId(id, 'Department ID');
    const updatedBy = req.user.id;

    const department = await DepartmentModel.findById(sanitizedId);

    if (!department) {
      throw createHttpError(404, 'Department not found');
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

/**
 * Update department statistics
 * Route: PATCH /api/departments/:id/stats
 * Access: Private
 * Params:
 *   - id: ObjectId (required) - Department ID
 * Response: { success: true, message, data: stats }
 * Note: Recalculates folder count, document count, and total size
 */
export const updateDepartmentStats = async (req, res, next) => {
  try {
    const parsedData = getDepartmentByIdSchema.safeParse(req.params);
    validateRequest(parsedData);

    const { id } = parsedData.data;
    const sanitizedId = sanitizeAndValidateId(id, 'Department ID');

    const department = await DepartmentModel.findById(sanitizedId);

    if (!department) {
      throw createHttpError(404, 'Department not found');
    }

    const stats = await department.updateStats();

    res.status(200).json({
      success: true,
      message: 'Department statistics updated successfully',
      data: stats
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get department by name
 * Route: GET /api/departments/name/:name
 * Access: Private
 * Params:
 *   - name: string (required) - Department name
 * Response: { success: true, data: department }
 */
export const getDepartmentByName = async (req, res, next) => {
  try {
    const parsedData = getDepartmentByNameSchema.safeParse(req.params);
    validateRequest(parsedData);

    const { name } = parsedData.data;
    const sanitizedName = sanitizeInputWithXSS(name);

    const department = await DepartmentModel.getByName(sanitizedName);

    if (!department) {
      throw createHttpError(404, 'Department not found');
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
 * Get department hierarchy (all items within department)
 * Route: GET /api/departments/:id/hierarchy
 * Access: Private
 * Params:
 *   - id: ObjectId (required) - Department ID
 * Query:
 *   - depth: number (optional) - Maximum depth level to fetch
 * Response: { success: true, data: { department, children: [items] } }
 */
export const getDepartmentHierarchy = async (req, res, next) => {
  try {
    const paramsData = getDepartmentByIdSchema.safeParse(req.params);
    validateRequest(paramsData);

    const queryData = getDepartmentHierarchySchema.safeParse(req.query);
    validateRequest(queryData);

    const { id } = paramsData.data;
    const { depth } = queryData.data;
    
    const sanitizedId = sanitizeAndValidateId(id, 'Department ID');

    const department = await DepartmentModel.findById(sanitizedId);

    if (!department) {
      throw createHttpError(404, 'Department not found');
    }

    const Item = mongoose.model('Item');
    let query = {
      path: new RegExp(`^${department.path}/`),
      isDeleted: false
    };

    // Apply depth filter
    if (depth) {
      const maxDepth = parseInt(depth);
      const pathDepth = department.path.split('/').length;
      query.$where = function() {
        return this.path.split('/').length <= pathDepth + maxDepth;
      };
    }

    const children = await Item.find(query).sort({ path: 1 });

    res.status(200).json({
      success: true,
      data: {
        department,
        children
      }
    });
  } catch (error) {
    next(error);
  }
};