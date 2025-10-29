import mongoose from "mongoose";

const departmentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
    // Remove unique: true from here
  },
  code: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
    // Remove unique: true from here
  },
  description: {
    type: String,
    trim: true
  },
  head: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// ✅ Define all indexes here using schema.index()
departmentSchema.index({ name: 1 }, { unique: true });
departmentSchema.index({ code: 1 }, { unique: true });
departmentSchema.index({ isActive: 1 });

// Default export
const DepartmentModel = mongoose.model('Department', departmentSchema);
export default DepartmentModel;