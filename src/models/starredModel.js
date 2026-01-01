

import mongoose from "mongoose";

const starredSchema = new mongoose.Schema(
  {
    // Who starred it
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // What they starred
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    // Type of item (FOLDER or DOCUMENT)
    itemType: {
      type: String,
      enum: ["FOLDER", "DOCUMENT"],
      required: true,
    },

    // Optional: Store department for faster filtering
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      index: true,
    },

    // Optional: Store parent for faster filtering
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "parentModel",
    },

    parentModel: {
      type: String,
      enum: ["Folder", "Department"],
    },

    // When it was starred
    starredAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
starredSchema.index({ userId: 1, itemId: 1, itemType: 1 }, { unique: true });
starredSchema.index({ userId: 1, starredAt: -1 }); // For sorting by most recently starred
starredSchema.index({ itemId: 1, itemType: 1 }); // For counting stars per item

// Static method: Check if user starred an item
starredSchema.statics.isStarred = async function (userId, itemId, itemType) {
  const starred = await this.findOne({ userId, itemId, itemType });
  return !!starred;
};

// Static method: Get all starred items for a user
starredSchema.statics.getStarredForUser = async function (userId) {
  return await this.find({ userId }).sort({ starredAt: -1 });
};

// Static method: Add to starred
starredSchema.statics.addStarred = async function (userId, itemId, itemType, departmentId = null, parentId = null) {
  return await this.findOneAndUpdate(
    { userId, itemId, itemType },
    { 
      userId, 
      itemId, 
      itemType, 
      departmentId, 
      parentId,
      starredAt: new Date() 
    },
    { upsert: true, new: true }
  );
};

// Static method: Remove from starred
starredSchema.statics.removeStarred = async function (userId, itemId, itemType) {
  return await this.deleteOne({ userId, itemId, itemType });
};

// Static method: Bulk add starred
starredSchema.statics.bulkAddStarred = async function (userId, items) {
  const operations = items.map(item => ({
    updateOne: {
      filter: { userId, itemId: item.itemId, itemType: item.itemType },
      update: { 
        $set: { 
          userId, 
          itemId: item.itemId, 
          itemType: item.itemType,
          departmentId: item.departmentId,
          parentId: item.parentId,
          starredAt: new Date() 
        }
      },
      upsert: true
    }
  }));
  
  return await this.bulkWrite(operations);
};

// Static method: Bulk remove starred
starredSchema.statics.bulkRemoveStarred = async function (userId, items) {
  const itemIds = items.map(item => item.itemId);
  return await this.deleteMany({ 
    userId, 
    itemId: { $in: itemIds } 
  });
};

// Static method: Get star count for an item
starredSchema.statics.getStarCount = async function (itemId, itemType) {
  return await this.countDocuments({ itemId, itemType });
};

// Virtual: Get referenced item (folder or document)
starredSchema.virtual("item", {
  refPath: "itemModel",
  localField: "itemId",
  foreignField: "_id",
  justOne: true,
});

// Add itemModel field for virtual population
starredSchema.virtual("itemModel").get(function () {
  return this.itemType === "FOLDER" ? "Folder" : "Document";
});

const StarredModel = mongoose.model("Starred", starredSchema);

export default StarredModel;