import createHttpError from "http-errors";
import FolderModel from "../models/folderModel.js";

export const getSubcategories = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const categoryId = req.query.category; // Filter by parent category
    const departmentId = req.query.department;
    const sortBy = req.query.sortBy || "createdAt";
    const order = req.query.order === "asc" ? 1 : -1;

    const skip = (page - 1) * limit;

    // Build query for subcategories (level 1, has parent)
    const query = {
      level: 1,
      parentFolder: { $ne: null },
      isActive: true,
      ...(categoryId && { parentFolder: categoryId }),
      ...(departmentId && { department: departmentId }),
      ...(search && {
        name: { $regex: search, $options: "i" },
      }),
    };

    const totalCount = await FolderModel.countDocuments(query);

    const subcategories = await FolderModel.find(query)
      .sort({ [sortBy]: order })
      .skip(skip)
      .limit(limit)
      .populate("department", "name code")
      .populate("parentFolder", "name")
      .populate("createdBy", "username email")
      .lean();

    res.status(200).json({
      success: true,
      count: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
      data: subcategories,
    });
  } catch (err) {
    next(createHttpError.InternalServerError(err.message));
  }
};

// Get subcategories by category ID
export const getSubcategoriesByCategory = async (req, res, next) => {
  try {
    const { categoryId } = req.params;

    // Verify category exists
    const category = await FolderModel.findOne({
      _id: categoryId,
      level: 0,
      isActive: true,
    });

    if (!category) {
      return next(createHttpError.NotFound("Category not found"));
    }

    const subcategories = await FolderModel.find({
      parentFolder: categoryId,
      level: 1,
      isActive: true,
    })
      .sort({ createdAt: -1 })
      .populate("createdBy", "username email")
      .lean();

    res.status(200).json({
      success: true,
      count: subcategories.length,
      data: subcategories,
    });
  } catch (err) {
    next(createHttpError.InternalServerError(err.message));
  }
};

// Get single subcategory by ID
export const getSubcategoryById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const subcategory = await FolderModel.findOne({
      _id: id,
      level: 1,
      parentFolder: { $ne: null },
      isActive: true,
    })
      .populate("department", "name code")
      .populate("parentFolder", "name")
      .populate("createdBy", "username email");

    if (!subcategory) {
      return next(createHttpError.NotFound("Subcategory not found"));
    }

    res.status(200).json({
      success: true,
      data: subcategory,
    });
  } catch (err) {
    next(createHttpError.InternalServerError(err.message));
  }
};
export const createSubcategory = async (req, res, next) => {
  try {
    const { name, category, folderAccess } = req.body;

    const userId = req.user.id;

    // Validation
    if (!name || !category) {
      return next(createHttpError.BadRequest("Name and category are required"));
    }

    // Verify parent category exists
    const parentCategory = await FolderModel.findOne({
      _id: category,
      level: 0,
      parentFolder: null,
      isActive: true,
    });

    if (!parentCategory) {
      return next(createHttpError.NotFound("Parent category not found"));
    }

    // Check if subcategory name already exists in the same category
    const existingSubcategory = await FolderModel.findOne({
      name: name.trim(),
      parentFolder: category,
      level: 1,
      isActive: true,
    });

    if (existingSubcategory) {
      return next(
        createHttpError.Conflict(
          "Subcategory with this name already exists in this category"
        )
      );
    }

    // Create path: /CategoryName/SubcategoryName
    const path = `${parentCategory.path}/${name.trim()}`;

    const subcategory = await FolderModel.create({
      name: name.trim(),
      department: parentCategory.department,
      parentFolder: category,
      path,
      level: 1,
      createdBy: userId,
      folderAccess: folderAccess || parentCategory.folderAccess,
      isActive: true,
    });

    const populatedSubcategory = await FolderModel.findById(subcategory._id)
      .populate("department", "name code")
      .populate("parentFolder", "name")
      .populate("createdBy", "username email");

    res.status(201).json({
      success: true,
      message: "Subcategory created successfully",
      data: populatedSubcategory,
    });
  } catch (err) {
    next(createHttpError.InternalServerError(err.message));
  }
};

// Update subcategory
export const updateSubcategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, folderAccess } = req.body;

    const subcategory = await FolderModel.findOne({
      _id: id,
      level: 1,
      parentFolder: { $ne: null },
      isActive: true,
    }).populate("parentFolder");

    if (!subcategory) {
      return next(createHttpError.NotFound("Subcategory not found"));
    }

    // If name is being updated, check for duplicates
    if (name && name.trim() !== subcategory.name) {
      const existingSubcategory = await FolderModel.findOne({
        name: name.trim(),
        parentFolder: subcategory.parentFolder._id,
        level: 1,
        isActive: true,
        _id: { $ne: id },
      });

      if (existingSubcategory) {
        return next(
          createHttpError.Conflict("Subcategory with this name already exists")
        );
      }

      // Update path
      const newPath = `${subcategory.parentFolder.path}/${name.trim()}`;
      subcategory.name = name.trim();
      subcategory.path = newPath;
    }

    if (folderAccess) {
      subcategory.folderAccess = folderAccess;
    }

    await subcategory.save();

    const updatedSubcategory = await FolderModel.findById(id)
      .populate("department", "name code")
      .populate("parentFolder", "name")
      .populate("createdBy", "username email");

    res.status(200).json({
      success: true,
      message: "Subcategory updated successfully",
      data: updatedSubcategory,
    });
  } catch (err) {
    next(createHttpError.InternalServerError(err.message));
  }
};

// Delete subcategory (soft delete)
export const deleteSubcategory = async (req, res, next) => {
  try {
    const { id } = req.params;

    const subcategory = await FolderModel.findOne({
      _id: id,
      level: 1,
      parentFolder: { $ne: null },
      isActive: true,
    });

    if (!subcategory) {
      return next(createHttpError.NotFound("Subcategory not found"));
    }

    // Soft delete
    subcategory.isActive = false;
    await subcategory.save();

    res.status(200).json({
      success: true,
      message: "Subcategory deleted successfully",
    });
  } catch (err) {
    next(createHttpError.InternalServerError(err.message));
  }
};
