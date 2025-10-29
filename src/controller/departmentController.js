import createHttpError from "http-errors";
import DepartmentModel from "../models/departmentModel.js";
import { departmentSchema } from "../validation/departmentValidation.js";
import mongoose from "mongoose";


// Backend Controller
export const getDepartments = async (req, res, next) => {
  try {
    // Extract query parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const sortBy = req.query.sortBy || 'createdAt';
    const order = req.query.order === 'asc' ? 1 : -1;

    // Calculate skip for pagination
    const skip = (page - 1) * limit;

    // Build search query
    const searchQuery = search
      ? {
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { code: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
          ],
        }
      : {};

    // Get total count for pagination
    const totalCount = await DepartmentModel.countDocuments(searchQuery);

    // Fetch departments with pagination and search
    const departments = await DepartmentModel.find(searchQuery)
      .sort({ [sortBy]: order })
      .skip(skip)
      .limit(limit)
      .populate('head', 'username email'); // Populate head if it's a reference

    res.status(200).json({
      success: true,
      count: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
      data: departments,
    });
  } catch (err) {
    next(createHttpError.InternalServerError(err.message));
  }
};

export const createDepartment = async (req, res, next) => {
  try {
    const { name, code, description } = req.body;

    // Validation
    if (!name || !code) {
      return next(createHttpError.BadRequest('Name and code are required'));
    }

    // Check if code already exists
    const existingDept = await DepartmentModel.findOne({ code: code.toUpperCase() });
    if (existingDept) {
      return next(createHttpError.Conflict('Department code already exists'));
    }

    const department = await DepartmentModel.create({
      name,
      code: code.toUpperCase(),
      description,
    });

    res.status(201).json({
      success: true,
      message: 'Department created successfully',
      data: department,
    });
  } catch (err) {
    next(createHttpError.InternalServerError(err.message));
  }
};

export const updateDepartment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, code, description } = req.body;

    // Check if department exists
    const department = await DepartmentModel.findById(id);
    if (!department) {
      return next(createHttpError.NotFound('Department not found'));
    }

    // If code is being updated, check if it already exists
    if (code && code.toUpperCase() !== department.code) {
      const existingDept = await DepartmentModel.findOne({ 
        code: code.toUpperCase(),
        _id: { $ne: id }
      });
      if (existingDept) {
        return next(createHttpError.Conflict('Department code already exists'));
      }
    }

    // Update department
    const updatedDepartment = await DepartmentModel.findByIdAndUpdate(
      id,
      {
        ...(name && { name }),
        ...(code && { code: code.toUpperCase() }),
        ...(description !== undefined && { description }),
      },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Department updated successfully',
      data: updatedDepartment,
    });
  } catch (err) {
    next(createHttpError.InternalServerError(err.message));
  }
};

export const deleteDepartment = async (req, res, next) => {
  try {
    const { id } = req.params;

    const department = await DepartmentModel.findById(id);
    if (!department) {
      return next(createHttpError.NotFound('Department not found'));
    }

    // Optional: Check if department has associated records
    // const hasUsers = await UserModel.countDocuments({ department: id });
    // if (hasUsers > 0) {
    //   return next(createHttpError.BadRequest('Cannot delete department with associated users'));
    // }

    await DepartmentModel.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Department deleted successfully',
    });
  } catch (err) {
    next(createHttpError.InternalServerError(err.message));
  }
};

export const getDepartmentById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const department = await DepartmentModel.findById(id).populate('head', 'username email');
    
    if (!department) {
      return next(createHttpError.NotFound('Department not found'));
    }

    res.status(200).json({
      success: true,
      data: department,
    });
  } catch (err) {
    next(createHttpError.InternalServerError(err.message));
  }
};

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import s3Client from "../config/s3Client.js";
import { config } from "../config/config.js";



export const generatePresignedUrls = async (req, res, next) => {
  try {
    const bucketName = process.env.BUCKET_NAME || config.aws.bucketName;
    const { files, folderId } = req.body;

    if (!Array.isArray(files) || files.length === 0) {
      throw new createHttpError.BadRequest("Files array is required.");
    }

    const timestamp = Date.now();

    const urls = await Promise.all(
      files.map(async (file, index) => {
        const { filename, mimeType } = file;
        if (!filename || !mimeType)
          throw new Error("Each file must have filename and mimeType.");

        const key = folderId
          ? `${folderId}/${timestamp}-${index}-${filename}`
          : `${timestamp}-${index}-${filename}`;

        const command = new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          ContentType: mimeType,
        });

        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

        return { filename, key, url: signedUrl, mimeType };
      })
    );

    return res.status(200).json({
      success: true,
      data: urls,
    });
  } catch (error) {
    console.error("Error generating presigned URLs:", error);
    next(
      new createHttpError.InternalServerError(
        error.message || "Failed to generate presigned URLs"
      )
    );
  }
};
