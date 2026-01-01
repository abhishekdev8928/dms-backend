import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    profilePic: {
      type: String,
      default: null,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ["SUPER_ADMIN", "ADMIN", "DEPARTMENT_OWNER", "USER"],
      default: "USER",
      uppercase: true,
    },
    departments: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Department",
      },
    ],
    myDriveDepartmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null, // null for self-registered users
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    mfaEnabled: {
      type: Boolean,
      default: false,
    },
    mfaSecret: {
      type: String,
      select: false,
    },
    lastLogin: {
      type: Date,
    },
    otp: {
      type: String,
      select: false,
    },
    otpExpires: {
      type: Date,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    refreshTokens: [
      {
        token: { type: String },
        expiresAt: { type: Date },
      },
    ],
    passwordResetToken: String,
    passwordResetExpires: Date,
  },
  {
    timestamps: true,
  }
);

// 🔥 FIXED: Indexes
userSchema.index({ createdBy: 1 });
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ departments: 1 });
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ myDriveDepartmentId: 1 });

// 🔥 NEW: Virtual to check if user is Super Admin
userSchema.virtual('isSuperAdmin').get(function() {
  return this.role === 'SUPER_ADMIN';
});

// 🔥 NEW: Virtual to check if user is Admin
userSchema.virtual('isAdmin').get(function() {
  return this.role === 'ADMIN';
});

// 🔥 NEW: Virtual to check if user is Department Owner
userSchema.virtual('isDepartmentOwner').get(function() {
  return this.role === 'DEPARTMENT_OWNER';
});

// 🔥 NEW: Virtual to check if user is normal user
userSchema.virtual('isNormalUser').get(function() {
  return this.role === 'USER';
});

// 🔥 NEW: Check if user has any of the given roles
userSchema.methods.hasAnyRole = function(roles) {
  return roles.includes(this.role);
};

// 🔥 NEW: Check if user can access a specific department
userSchema.methods.canAccessDepartment = function(departmentId) {
  // Super Admin can access all departments
  if (this.role === 'SUPER_ADMIN') {
    return true;
  }
  
  // Check if user's MyDrive
  if (this.myDriveDepartmentId && this.myDriveDepartmentId.equals(departmentId)) {
    return true;
  }
  
  // Check if department is in user's assigned departments
  return this.departments.some(dept => 
    dept.toString() === departmentId.toString()
  );
};

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const UserModel = mongoose.models.User || mongoose.model("User", userSchema);

export default UserModel;