# Google Drive Activity System - Complete Documentation

## 📋 Overview

This document explains the **ActivityLog model** you already have and how it implements Google Drive-style activity tracking. Your model is well-designed and covers all the features shown in your screenshots.

---

## 🎯 Your Activity Model Features

### Core Schema Structure

```javascript
ActivityLog {
  userId: ObjectId,              // Who did the action
  action: String,                // What they did (enum of 15 actions)
  targetType: String,            // 'file' or 'folder'
  targetId: ObjectId,            // Which file/folder
  metadata: Object,              // Flexible data per action type
  createdAt: Date               // When it happened (immutable)
}
```

---

## ✅ Features Your Model Supports

### 1. **Action Tracking (15 Types)**

Your model tracks these actions matching Google Drive functionality:

#### **Folder Actions**
- `FOLDER_CREATED` - When user creates a new folder
- `FOLDER_RENAMED` - When user renames a folder
- `FOLDER_MOVED` - When user moves folder to different location
- `FOLDER_DELETED` - When user moves folder to bin
- `FOLDER_RESTORED` - When user restores folder from bin

#### **File Actions**
- `FILE_UPLOADED` - Initial file upload
- `FILE_VERSION_UPLOADED` - New version of existing file
- `FILE_RENAMED` - File name changed
- `FILE_MOVED` - File moved to different folder
- `FILE_DELETED` - File moved to bin
- `FILE_RESTORED` - File restored from bin
- `FILE_DOWNLOADED` - File downloaded by user
- `FILE_PREVIEWED` - File opened for preview

#### **Bulk Actions**
- `BULK_RESTORE` - Multiple items restored at once

---

### 2. **Flexible Metadata System**

The `metadata` field adapts based on action type:

#### For RENAME Actions
```javascript
metadata: {
  oldName: "demo",           // Previous name
  newName: "demo one",       // New name
  fileExtension: "xlsx",     // (if file)
  folderName: "testing"      // (if folder)
}
```

#### For MOVE Actions
```javascript
metadata: {
  fileName: "TestDoc.doc",
  fromFolder: "testing",     // Source folder name
  toFolder: "demo",          // Destination folder name
  fromFolderId: ObjectId,    // Source folder ID
  toFolderId: ObjectId       // Destination folder ID
}
```

#### For VERSION Actions
```javascript
metadata: {
  fileName: "file_example.xlsx",
  fileExtension: "xlsx",
  version: 2,                // Version number
  fileType: "spreadsheet"    // Document type
}
```

#### For UPLOAD Actions
```javascript
metadata: {
  fileName: "Screenshot 2025-11...",
  fileExtension: "png",
  fileType: "image"
}
```

#### For BULK Operations
```javascript
metadata: {
  itemCount: 5,              // Number of items
  bulkGroupId: "grp-123...", // Groups related actions
  fileName: "TestDoc.doc"    // Individual item details
}
```

---

### 3. **Time-Based Grouping**

Your model has `getGroupedActivities()` method that organizes activities into:

- **Today** - Activities from current day
- **Yesterday** - Previous day's activities  
- **Last Week** - Activities from past 7 days
- **Older** - Everything beyond 7 days

This matches your UI screenshot exactly:
```
Today
  └─ You moved an item to the bin (17:12 18 Nov)

Last week
  └─ You created an item in (21:58 13 Nov)
  └─ You restored 5 items (10:43 11 Nov)
```

---

### 4. **Human-Readable Messages**

Your model has `getMessage()` method that converts action codes to readable text:

| Action | Generated Message |
|--------|------------------|
| `FILE_UPLOADED` | "You uploaded Screenshot 2025-11..." |
| `FILE_RENAMED` | "You renamed demo → demo one" |
| `FOLDER_CREATED` | "You created folder testing" |
| `BULK_RESTORE` | "You restored 5 items" |
| `FILE_MOVED` | "You moved TestDoc.doc to demo" |
| `FILE_DELETED` | "You moved Screenshot 2025-11... to the bin" |

---

### 5. **Query Methods**

#### Get All User Activities
```javascript
ActivityLog.getUserActivities(userId, limit)
// Returns user's complete activity history
```

#### Get Activities with Filters
```javascript
ActivityLog.getActivities({
  userId: ObjectId,
  targetType: 'file',
  action: 'FILE_UPLOADED'
}, limit)
// Flexible filtering by any field
```

#### Get Entity History
```javascript
ActivityLog.getEntityHistory('file', fileId, limit)
// All activities for specific file/folder
// Useful for "Version History" or "Activity" tab on files
```

#### Get Grouped Activities (For UI)
```javascript
ActivityLog.getGroupedActivities(userId, limit)
// Returns: { today: [], yesterday: [], lastWeek: [], older: [] }
```

---

### 6. **Bulk Operation Support**

Your model supports grouping related actions:

```javascript
ActivityLog.logBulkRestore(userId, [
  { type: 'file', id: fileId1, name: 'doc1.pdf', extension: 'pdf' },
  { type: 'file', id: fileId2, name: 'doc2.xlsx', extension: 'xlsx' },
  { type: 'folder', id: folderId, name: 'testing' }
])
```

Creates multiple logs with same `bulkGroupId` - allows UI to show:
```
✅ You restored 5 items (collapsed view)
  OR
📄 file_example.XLSX...
📄 TestWordDoc.doc  
🖼️ Screenshot 2025-11...
📁 testing
📁 demo one
```

---

### 7. **Performance Optimizations**

#### Compound Indexes
```javascript
{ userId: 1, createdAt: -1 }           // User activity feed
{ targetType: 1, targetId: 1, createdAt: -1 } // Entity history
{ action: 1, createdAt: -1 }           // Filter by action type
{ createdAt: -1 }                      // Global timeline
{ 'metadata.bulkGroupId': 1 }          // Bulk operations
```

These indexes ensure fast queries even with millions of activity logs.

---

### 8. **Immutability Protection**

Your model prevents modifications:
- `timestamps: { updatedAt: false }` - No update tracking needed
- Middleware blocks `findOneAndUpdate`, `updateOne`, `updateMany`
- Activity logs are **append-only** (like audit trail)

This is crucial for compliance and data integrity.

---

### 9. **Rich Display Helpers**

#### Formatted Timestamps
```javascript
log.getFormattedTime()
// Returns: "17:12 · 18 Nov" or "10:41 · 11 Nov"
```

#### File Extension Helper
```javascript
ActivityLog.getFileExtension('document.pdf')
// Returns: 'pdf'
```

---

## 🎨 How It Maps to Your UI

### Screenshot 1: Upload Activity
```
You uploaded 2 items
10:41 11 Nov
  📁 testing
    📄 TestWordDoc....
    📊 file_example_X...
```

**Model Data:**
```javascript
{
  action: 'FILE_UPLOADED',
  targetType: 'file',
  metadata: {
    fileName: 'TestWordDoc',
    fileExtension: 'doc'
  },
  createdAt: '2025-11-11T10:41:00Z'
}
```

### Screenshot 2: Rename Activity
```
You renamed an item
10:42 11 Nov
  📁 demo one
      demo (crossed out)
```

**Model Data:**
```javascript
{
  action: 'FOLDER_RENAMED',
  targetType: 'folder',
  metadata: {
    oldName: 'demo',
    newName: 'demo one'
  },
  createdAt: '2025-11-11T10:42:00Z'
}
```

### Screenshot 2: Bulk Restore
```
You restored 5 items
10:42 11 Nov
  📊 file_example_XLSX...
  📄 TestWordDoc.doc
  🖼️ Screenshot 2025-11...
  📁 testing
```

**Model Data:**
```javascript
// Multiple logs with same bulkGroupId
[
  {
    action: 'BULK_RESTORE',
    targetType: 'file',
    targetId: fileId1,
    metadata: {
      bulkGroupId: 'grp-xyz123',
      itemCount: 5,
      fileName: 'file_example_XLSX',
      fileExtension: 'xlsx'
    }
  },
  // ... 4 more similar entries
]
```

### Screenshot 3: Delete Activity
```
Today
  You moved an item to the bin
  17:12 18 Nov
    🖼️ Screenshot 2025-11...
```

**Model Data:**
```javascript
{
  action: 'FILE_DELETED',
  targetType: 'file',
  metadata: {
    fileName: 'Screenshot 2025-11',
    fileExtension: 'png'
  },
  createdAt: '2025-11-18T17:12:00Z'
}
```

---

## 🔗 Integration with Your Existing Models

### With Department Model
- Activities can be filtered by department using file/folder paths
- `path` field starts with `/{departmentName}/`

### With Document Model
- Every document operation triggers activity log
- `targetId` references `Document._id`
- `metadata.fileName` comes from `Document.name`

### With DocumentVersion Model
- Version uploads create `FILE_VERSION_UPLOADED` activities
- `metadata.version` references `DocumentVersion.versionNumber`

### With Folder Model
- Folder operations create activity logs
- `targetId` references `Folder._id`
- Folder hierarchy visible through `fromFolder`/`toFolder`

---

## 📊 Key Features Summary

| Feature | Implementation | Purpose |
|---------|---------------|---------|
| **Action Types** | 15 enum values | Cover all file/folder operations |
| **Flexible Metadata** | Dynamic object | Store action-specific details |
| **Time Grouping** | `getGroupedActivities()` | Organize by Today/Week/Month |
| **Human Messages** | `getMessage()` | Convert codes to readable text |
| **Bulk Operations** | `bulkGroupId` field | Group related actions |
| **Entity History** | `getEntityHistory()` | Track file/folder changes |
| **Performance** | 5 compound indexes | Fast queries at scale |
| **Immutability** | Middleware protection | Audit trail integrity |
| **User Context** | `userId` reference | Show user avatar/name |
| **Rich Display** | Helper methods | Format timestamps, extensions |

---

## 🎯 What Makes This Model Google Drive-Like

✅ **Chronological Feed** - Sorted by `createdAt` descending  
✅ **Time-Based Sections** - Today, Last Week, This Month  
✅ **Grouped Operations** - Bulk actions collapsed/expanded  
✅ **Rich Metadata** - Shows names, types, versions  
✅ **User Attribution** - "You uploaded" vs "John uploaded"  
✅ **Action Variety** - Upload, rename, move, delete, restore  
✅ **Entity Linking** - Click activity → navigate to file/folder  
✅ **Version Tracking** - See when versions were uploaded  
✅ **Hierarchical Context** - Shows folder paths  

---

## 🚀 Best Practices with Your Model

### 1. **Always Log Asynchronously**
```javascript
// Don't await - let it log in background
ActivityLog.logActivity(data).catch(err => console.error(err));
```

### 2. **Include Rich Metadata**
```javascript
// ✅ Good - includes display info
metadata: { fileName: 'Report.pdf', fileExtension: 'pdf' }

// ❌ Bad - missing display info
metadata: { fileId: '123abc' }
```

### 3. **Use Bulk Methods for Multiple Items**
```javascript
// ✅ Good - groups related actions
ActivityLog.logBulkRestore(userId, items)

// ❌ Bad - creates unrelated logs
items.forEach(item => ActivityLog.logActivity(...))
```

### 4. **Clean Old Logs Periodically**
```javascript
// Archive logs older than 90 days
ActivityLog.deleteMany({
  createdAt: { $lt: new Date(Date.now() - 90*24*60*60*1000) }
})
```

---

## 💡 Your Model Is Production-Ready

Your `ActivityLog` model already has everything needed for Google Drive-style activity tracking:

✅ Comprehensive action types  
✅ Flexible metadata structure  
✅ Time-based grouping  
✅ Bulk operation support  
✅ Performance indexes  
✅ Immutability protection  
✅ Rich query methods  
✅ Display helpers  

**You just need to integrate it into your controllers/services** by calling `ActivityLog.logActivity()` after each file/folder operation.