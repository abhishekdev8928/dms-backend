import mongoose from 'mongoose';
import createHttpError from 'http-errors';
import UserModel from '../models/userModel.js';
import DepartmentModel from '../models/departmentModel.js';
import { superAdminCreateUserSchema } from '../validation/authValidation.js';
import { sanitizeInputWithXSS, validateRequest } from '../utils/helper.js';
import { sendWelcomeEmail } from '../utils/sendEmail.js';

/**
 * @desc    Assign/Update departments for a user
 * @route   PATCH /api/admin/users/:id
 * @access  SUPER_ADMIN only
 */
export const updateUserDepartments = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { departments } = req.body;

    // Validate user ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw createHttpError(400, 'Invalid user ID');
    }

    // Find user
    const user = await UserModel.findById(id);
    if (!user) {
      throw createHttpError(404, 'User not found');
    }

    if (!user.isActive) {
      throw createHttpError(400, 'Cannot update departments for inactive user');
    }

    // Validate departments array
    if (!departments || !Array.isArray(departments)) {
      throw createHttpError(400, 'Departments must be an array');
    }

    // Validate all department IDs
    const invalidIds = departments.filter(
      deptId => !mongoose.Types.ObjectId.isValid(deptId)
    );

    if (invalidIds.length > 0) {
      throw createHttpError(400, `Invalid department IDs: ${invalidIds.join(', ')}`);
    }

    // Check if all departments exist and are ORG type
    const existingDepartments = await DepartmentModel.find({
      _id: { $in: departments },
      isActive: true
    });

    if (existingDepartments.length !== departments.length) {
      throw createHttpError(404, 'One or more departments not found');
    }

    // Check if any department is USER type (MyDrive)
    const userTypeDepts = existingDepartments.filter(
      dept => dept.ownerType === 'USER'
    );

    if (userTypeDepts.length > 0) {
      throw createHttpError(400, 'Cannot assign MyDrive departments to users');
    }

    // Update user's departments
    user.departments = departments;
    await user.save();

    // Populate departments for response
    await user.populate('departments');

    res.status(200).json({
      success: true,
      message: 'User departments updated successfully',
      data: {
        userId: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        departments: user.departments
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create a new user by super admin
 * @route   POST /admin/users
 * @access  Super Admin only
 */
export const createUserBySuperAdmin = async (req, res, next) => {
  let user;
  try {
    const parsedData = superAdminCreateUserSchema.safeParse(req.body);
    validateRequest(parsedData);

    const { username, email, role, departments } = parsedData.data;

    // 🔥 Destructure once
    const { _id: currentUserId } = req.user;

    // Sanitize inputs
    const sanitizedEmail = sanitizeInputWithXSS(email);
    const sanitizedUsername = sanitizeInputWithXSS(username);

    // Check if user already exists
    const existingUser = await UserModel.findOne({ email: sanitizedEmail });
    if (existingUser) {
      throw createHttpError(400, "User with this email already exists");
    }

    const existingUsername = await UserModel.findOne({
      username: sanitizedUsername,
    });
    if (existingUsername) {
      throw createHttpError(400, "Username is already taken");
    }

    // Static temporary password
    const temporaryPassword = "Welcome@123";

    // Create user (super admin verified)
    user = await UserModel.create({
      username: sanitizedUsername,
      email: sanitizedEmail,
      password: temporaryPassword,
      role: role || "USER",
      isVerified: true,
      isActive: true,
      createdBy: currentUserId,
      departments: departments || [],
    });

    // 🔥 Create MyDrive department
    const myDrive = await DepartmentModel.create({
      name: `MyDrive_${user._id}`,
      description: `Personal drive for ${user.username}`,
      ownerType: "USER",
      ownerId: user._id,
      createdBy: currentUserId,
      isActive: true,
    });

    // 🔥 Link MyDrive to user
    user.myDriveDepartmentId = myDrive._id;
    await user.save();

    // Send welcome email
    await sendWelcomeEmail(
      user.email,
      user.username,
      temporaryPassword
    );

    return res.status(201).json({
      success: true,
      message:
        "User created successfully with MyDrive. Welcome email sent with temporary password.",
      data: {
        userId: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        myDriveDepartmentId: myDrive._id,
        assignedDepartments: user.departments,
        createdBy: currentUserId,
      },
    });
  } catch (error) {
    // 🔥 Rollback if user was created but later failed
    if (error && user) {
      await UserModel.findByIdAndDelete(user._id);
    }
    next(error);
  }
};
