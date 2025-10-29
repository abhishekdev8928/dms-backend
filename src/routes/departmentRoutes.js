



// routes/departments.js
/*


GET    /api/departments             // Get all departments
GET    /api/departments/:id         // Get department by ID
POST   /api/departments             // Create new department (Superadmin)
PUT    /api/departments/:id         // Update department (Superadmin)
DELETE /api/departments/:id         // Delete department (Superadmin)
PATCH  /api/departments/:id/toggle  // Toggle active status
GET    /api/departments/:id/stats   // Get department statistics

*/




import express from "express";
import {
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} from "../controller/departmentController.js";

const router = express.Router();

// Get all departments
router.get("/departments", getDepartments);

// Create a new department
router.post("/departments", createDepartment);

// Update an existing department
router.patch("/departments/:id", updateDepartment);

// Delete a department
router.delete("/departments/:id", deleteDepartment);

export default router;

