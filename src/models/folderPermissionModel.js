import mongoose from "mongoose";

const folderPermissionSchema = new mongoose.Schema({
  folder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Folder',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  role: {
    type: String,
    enum: ['superadmin', 'admin', 'team_member', 'member_bank'],
    required: true
  },
  access: [{
    type: String,
    enum: ['view', 'upload', 'edit', 'delete', 'download']
  }]
}, { timestamps: true });

// Indexes
folderPermissionSchema.index({ folder: 1, user: 1 }, { unique: true });
folderPermissionSchema.index({ user: 1 });
folderPermissionSchema.index({ role: 1 });

// Default export
const FolderPermissionModel = mongoose.model('FolderPermission', folderPermissionSchema);
export default FolderPermissionModel;

