import mongoose from "mongoose";

const documentVersionSchema = new mongoose.Schema(
  {
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      required: [true, "Document ID is required"],
      index: true
    },

    versionNumber: {
      type: Number,
      required: [true, "Version number is required"],
      min: [1, "Version number must be at least 1"]
    },
type: {
  type: String,
  required: true,
  index: true
}
,
    name: {
      type: String,
      required: [true, "Document name is required"],
      trim: true,
      maxlength: [255, "Document name cannot exceed 255 characters"]
    },

    originalName: {
      type: String,
      required: [true, "Original filename is required"]
    },

    fileUrl: {
      type: String,
      required: [true, "File URL is required"]
    },

    size: {
      type: Number,
      required: [true, "File size is required"],
      min: [0, "File size cannot be negative"]
    },

    mimeType: {
      type: String,
      required: [true, "MIME type is required"]
    },

    extension: {
      type: String,
      required: [true, "File extension is required"],
      lowercase: true,
      trim: true
    },

    isLatest: {
      type: Boolean,
      default: false,
      index: true
    },

    changeDescription: {
      type: String,
      trim: true,
      maxlength: [500, "Change description cannot exceed 500 characters"]
    },

    pathAtCreation: {
      type: String
    },

    fileHash: {
      type: String,
      trim: true
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Creator information is required"]
    }
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false // ✅ Versions are immutable
    },
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

//
// ✅ Indexes
//
documentVersionSchema.index({ documentId: 1, versionNumber: -1 });
documentVersionSchema.index({ documentId: 1, createdAt: -1 });

// ✅ Partial unique index for isLatest
documentVersionSchema.index(
  { documentId: 1, isLatest: 1 },
  { unique: true, partialFilterExpression: { isLatest: true } }
);

documentVersionSchema.index(
  { documentId: 1, versionNumber: 1 },
  { unique: true }
);

//
// === Virtuals ===
//
documentVersionSchema.virtual("sizeFormatted").get(function () {
  const bytes = this.size;
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
});

documentVersionSchema.virtual("createdAgo").get(function () {
  if (!this.createdAt) return "";
  const diff = Date.now() - this.createdAt;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) return `${years} year${years > 1 ? "s" : ""} ago`;
  if (months > 0) return `${months} month${months > 1 ? "s" : ""} ago`;
  if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  return "Just now";
});

documentVersionSchema.virtual("displayName").get(function () {
  return this.name.endsWith(`.${this.extension}`)
    ? this.name
    : `${this.name}.${this.extension}`;
});

documentVersionSchema.virtual("fileCategory").get(function () {
  const map = {
    image: ["jpg", "jpeg", "png", "gif", "bmp", "svg", "webp"],
    document: ["pdf", "doc", "docx", "txt", "rtf", "odt"],
    spreadsheet: ["xls", "xlsx", "csv", "ods"],
    presentation: ["ppt", "pptx", "odp"],
    video: ["mp4", "avi", "mov", "wmv", "flv", "webm"],
    audio: ["mp3", "wav", "ogg", "flac", "m4a"],
    archive: ["zip", "rar", "7z", "tar", "gz"]
  };

  const ext = this.extension.toLowerCase();
  for (const [category, list] of Object.entries(map)) {
    if (list.includes(ext)) return category;
  }
  return "other";
});

//
// === Instance methods ===
//
documentVersionSchema.methods.getPreviousVersion = async function () {
  if (this.versionNumber === 1) return null;
  return mongoose.model("DocumentVersion").findOne({
    documentId: this.documentId,
    versionNumber: this.versionNumber - 1
  });
};

documentVersionSchema.methods.getNextVersion = async function () {
  return mongoose.model("DocumentVersion").findOne({
    documentId: this.documentId,
    versionNumber: this.versionNumber + 1
  });
};

documentVersionSchema.methods.getSizeDifference = async function () {
  const previousVersion = await this.getPreviousVersion();
  if (!previousVersion)
    return { bytes: 0, formatted: "0 Bytes", percentage: 0 };

  const difference = this.size - previousVersion.size;
  const percentage =
    previousVersion.size > 0
      ? Math.round((difference / previousVersion.size) * 100)
      : 0;

  const formatSize = (bytes) => {
    const absBytes = Math.abs(bytes);
    if (absBytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(absBytes) / Math.log(k));
    return Math.round((absBytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  return {
    bytes: difference,
    formatted: (difference >= 0 ? "+" : "-") + formatSize(difference),
    percentage
  };
};

documentVersionSchema.methods.markAsLatest = async function (session = null) {
  await mongoose.model("DocumentVersion").updateMany(
    { documentId: this.documentId, _id: { $ne: this._id } },
    { isLatest: false },
    { session }
  );
  this.isLatest = true;
  await this.save({ session });
  return this;
};

// 📌 DOCUMENT VERSION MODEL — CREATE NEW VERSION
documentVersionSchema.statics.createNewVersion = async function (
  documentId,
  fileData,
  changeDescription,
  userId
) {
  // Mark previous versions as not latest
  await this.updateMany(
    { documentId },
    { $set: { isLatest: false } }
  );

  console.log("🔥 createNewVersion received fileData:", fileData);

  // Compute next version number
  const lastVersion = await this.findOne({ documentId }).sort({ versionNumber: -1 });
  const nextVersionNumber = lastVersion ? lastVersion.versionNumber + 1 : 1;

  // Create the new version
  const newVersion = await this.create({
    documentId,
    versionNumber: nextVersionNumber,
    name: fileData.name,             // ✔ Frozen display name
    originalName: fileData.originalName, // ✔ Uploaded file name
    mimeType: fileData.mimeType,
    extension: fileData.extension,
    size: fileData.size,
    fileUrl: fileData.fileUrl,
    type: fileData.type,
    isLatest: true,
    createdBy: userId,
    changeDescription
  });

  return newVersion;
};


// ✅ FIXED: Only update LATEST version name (for rename operation)
documentVersionSchema.statics.updateLatestVersionName = async function (
  documentId,
  newName,
  session = null
) {
  const DocumentVersion = this;
  
  // Find the latest version
  const latestVersion = await DocumentVersion.findOne({ 
    documentId, 
    isLatest: true 
  }).session(session);
  
  if (!latestVersion) {
    throw new Error('No latest version found');
  }
  
  // Update only the latest version's name
  const ext = latestVersion.extension || 'bin';
  const newOriginalName = `${newName}.${ext}`;
  
  latestVersion.name = newName;
  latestVersion.originalName = newOriginalName;
  
  // Update pathAtCreation to reflect new name
  if (latestVersion.pathAtCreation) {
    const pathParts = latestVersion.pathAtCreation.split('/');
    pathParts[pathParts.length - 1] = newOriginalName;
    latestVersion.pathAtCreation = pathParts.join('/');
  }
  
  await latestVersion.save({ session });
  
  return latestVersion;
};

const DocumentVersionModel =
  mongoose.models.DocumentVersion ||
  mongoose.model("DocumentVersion", documentVersionSchema);

export default DocumentVersionModel;