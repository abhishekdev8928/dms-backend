import express from "express";
import cors from "cors";

const app = express();
import authRoutes from "../src/routes/userRoutes.js"
import departmentRoutes from "../src/routes/departmentRoutes.js"
import globalErrorHandler from "./middleware/globalErrorHandler.js";
import categoriesRoutes from "./routes/categoryRoutes.js";
import subcategoriesRoutes from "./routes/subcategoryRoutes.js";
import documentRoutes from "./routes/documentRoutes.js";


import auditLogsModel from "./models/auditLogsModel.js";
import DocumentModel from "./models/documentModel.js";
import FolderModel from "./models/folderModel.js";



app.use(cors({
  origin:"*"
}));

app.use(express.json());


app.use("/api/auth",authRoutes);
app.use("/api",departmentRoutes);
app.use("/api/categories",categoriesRoutes)
app.use("/api/subcategories" , subcategoriesRoutes)

app.use("/api/documents",documentRoutes)



const buildFolderTree = (folders, parentId) => {
  return folders
    .filter((f) => String(f.parentFolder) === String(parentId))
    .map((folder) => ({
      _id: folder._id,
      name: folder.name,
      path: folder.path,
      level: folder.level,
      children: buildFolderTree(folders, folder._id),
    }));
};

export const getDepartmentTree = async (req, res) => {
  try {
    // 1️⃣ Fetch all departments
    const departments = await DepartmentModel.find({ isActive: true })
      .select("_id name code")
      .lean();

    // 2️⃣ Fetch all folders (flat list)
    const folders = await FolderModel.find({ isActive: true })
      .select("_id name parentFolder department path level")
      .lean();

    // 3️⃣ Fetch all active documents
    const documents = await DocumentModel.find({ isActive: true })
      .select("_id title folder department fileType fileSize createdAt")
      .lean();

    // 4️⃣ Construct hierarchical tree per department
    const departmentTree = departments.map((dep) => {
      // All folders belonging to this department
      const depFolders = folders.filter(
        (f) => String(f.department) === String(dep._id)
      );

      // Build recursive folder tree
      const tree = buildFolderTree(depFolders, null).map((folder) => ({
        ...folder,
        documents: documents.filter(
          (d) => String(d.folder) === String(folder._id)
        ),
      }));

      return {
        _id: dep._id,
        name: dep.name,
        code: dep.code,
        folders: tree,
      };
    });

    // ✅ Send response
    res.status(200).json({
      success: true,
      data: departmentTree,
    });
  } catch (error) {
    console.error("❌ Error building department tree:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch department tree",
      error: error.message,
    });
  }
};


app.get("/tree/generate",getDepartmentTree)



app.use(globalErrorHandler);

// ===== TEST ROUTES =====
app.get("/", (req, res) => {
  res.json({ message: "Server running" });
});


export default app;

