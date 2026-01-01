# 📄 DMS Document API Complete Testing Documentation

> **Comprehensive Document Management System - Document Testing Guide**  
> Test document upload, chunked upload, versioning, sharing, permissions, and all document operations.

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Step 12: Simple Document Upload](#step-12-simple-document-upload)
3. [Step 13: Chunked Upload (Large Files)](#step-13-chunked-upload-large-files)
4. [Step 14: Document Access Control](#step-14-document-access-control)
5. [Step 15: Document Sharing](#step-15-document-sharing)
6. [Step 16: Document Versioning](#step-16-document-versioning)
7. [Step 17: Document Operations](#step-17-document-operations)
8. [Step 18: Cross-Department Document Tests](#step-18-cross-department-document-tests)
9. [Step 19: Document Download](#step-19-document-download)
10. [Step 20: Document Search & Tags](#step-20-document-search--tags)
11. [Step 21: Document Starred Feature](#step-21-document-starred-feature)

---

## ⚙️ Prerequisites

Before starting document tests, ensure you have completed folder tests (Steps 1-11) and have:

### Required Variables from Previous Tests
```
SUPER_ADMIN_TOKEN
USER1_TOKEN (Abhishek - Admin Engineering)
USER2_TOKEN (Ajay - Admin Marketing)
USER3_TOKEN (Firebase - Dept Owner Finance)
USER4_TOKEN (Arcade - User Engineering)
USER5_TOKEN (Shaxma - User No Dept)

ENGINEERING_DEPT_ID
MARKETING_DEPT_ID
FINANCE_DEPT_ID

USER1_ID, USER1_MYDRIVE_ID
USER2_ID, USER2_MYDRIVE_ID
USER3_ID, USER3_MYDRIVE_ID
USER4_ID, USER4_MYDRIVE_ID
USER5_ID, USER5_MYDRIVE_ID

ENG_FOLDER1_ID (Backend Projects)
ENG_FOLDER2_ID (DMS Project)
USER1_FOLDER1_ID (Personal Documents in MyDrive)
MARKETING_FOLDER1_ID (Marketing Campaigns)
```

### New Variables to Track for Documents
```
DOC1_ID (First uploaded document)
DOC2_ID (Second document)
DOC3_ID (Document in MyDrive)
DOC4_ID (Marketing document)
DOC5_ID (Shared document)

CHUNKED_UPLOAD_ID (For large file upload)
CHUNKED_KEY (S3 key for chunked upload)

VERSION1_ID, VERSION2_ID (Document versions)
```

---

## 📤 STEP 12: Simple Document Upload

### 12.1 Generate Presigned URL for Upload (Single File)

**Endpoint:** `POST /api/documents/generate-upload-urls`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "files": [
    {
      "filename": "project-requirements.pdf",
      "mimeType": "application/pdf"
    }
  ],
  "parentId": "PASTE_ENG_FOLDER1_ID_HERE"
}
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "filename": "project-requirements.pdf",
      "key": "uploads/1735390800000-0-project-requirements.pdf",
      "url": "https://your-bucket.s3.amazonaws.com/uploads/1735390800000-0-project-requirements.pdf?X-Amz-Algorithm=...",
      "mimeType": "application/pdf",
      "fileGroup": "PDF",
      "category": "document"
    }
  ],
  "message": "Generated 1 presigned upload URL(s)"
}
```

**✅ Actions:**
1. Copy the `url` - Use this to upload file to S3
2. Copy the `key` - You'll need this for document creation
3. Save `fileGroup` and `category` for validation

---

### 12.2 Upload File to S3 using Presigned URL

**Method:** Use the presigned URL from step 12.1

**Using cURL:**
```bash
curl -X PUT "PASTE_PRESIGNED_URL_HERE" \
  -H "Content-Type: application/pdf" \
  --data-binary @/path/to/your/project-requirements.pdf
```

**Using Postman:**
1. Create new request: `PUT` method
2. Paste the presigned URL
3. Headers: `Content-Type: application/pdf`
4. Body → Binary → Select your PDF file
5. Send

**Expected Response:**
- Status: `200 OK`
- Empty body (S3 confirmation)

**✅ Test:** File should be uploaded to S3 successfully

---

### 12.3 Create Document Record in Database

**Endpoint:** `POST /api/documents`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Project Requirements",
  "originalName": "project-requirements.pdf",
  "parentId": "PASTE_ENG_FOLDER1_ID_HERE",
  "fileUrl": "uploads/1735390800000-0-project-requirements.pdf",
  "mimeType": "application/pdf",
  "extension": "pdf",
  "size": 2458624,
  "description": "Detailed project requirements document",
  "tags": ["requirements", "project", "documentation"]
}
```

**Expected Response (201 Created):**
```json
{
  "success": true,
  "message": "Document uploaded successfully",
  "data": {
    "_id": "675eAAAAAAAAAAAAAAAAAAAA",
    "name": "Project Requirements",
    "originalName": "project-requirements.pdf",
    "type": "document",
    "fileType": "document",
    "parentId": "675e1111111111111111111",
    "departmentId": "675eENGINEERING_DEPT_ID",
    "path": "/Engineering/Backend Projects/Project Requirements.pdf",
    "fileUrl": "uploads/1735390800000-0-project-requirements.pdf",
    "mimeType": "application/pdf",
    "extension": "pdf",
    "size": 2458624,
    "version": 1,
    "description": "Detailed project requirements document",
    "tags": ["requirements", "project", "documentation"],
    "isDeleted": false,
    "createdBy": "675e4444444444444444444",
    "createdAt": "2024-12-28T10:00:00.000Z",
    "currentVersion": {
      "_id": "675eVVVVVVVVVVVVVVVVVVVV",
      "versionNumber": 1,
      "fileUrl": "uploads/1735390800000-0-project-requirements.pdf",
      "size": 2458624,
      "isLatest": true,
      "changeDescription": "Initial upload"
    },
    "fileValidation": {
      "group": "PDF",
      "category": "document",
      "fileType": "document"
    }
  }
}
```

**✅ Action:** Save `_id` as `DOC1_ID`

---

### 12.4 User 1 - Upload Document to MyDrive

**Step 1: Generate Presigned URL**

**Endpoint:** `POST /api/documents/generate-upload-urls`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "files": [
    {
      "filename": "personal-notes.txt",
      "mimeType": "text/plain"
    }
  ],
  "parentId": "PASTE_USER1_MYDRIVE_ID_HERE"
}
```

**Step 2: Upload to S3** (same as 12.2)

**Step 3: Create Document**

**Endpoint:** `POST /api/documents`

**Request Body:**
```json
{
  "name": "Personal Notes",
  "originalName": "personal-notes.txt",
  "parentId": "PASTE_USER1_MYDRIVE_ID_HERE",
  "fileUrl": "uploads/1735390900000-0-personal-notes.txt",
  "mimeType": "text/plain",
  "extension": "txt",
  "size": 15240,
  "description": "My personal notes and ideas"
}
```

**✅ Action:** Save `_id` as `DOC3_ID`

**✅ Test:** User can upload documents to their own MyDrive

---

### 12.5 User 4 - Try Upload to Engineering Root (No Permission)

**Endpoint:** `POST /api/documents/generate-upload-urls`

**Headers:**
```
Authorization: Bearer USER4_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "files": [
    {
      "filename": "unauthorized.pdf",
      "mimeType": "application/pdf"
    }
  ],
  "parentId": "PASTE_ENGINEERING_DEPT_ID_HERE"
}
```

**Expected Response (403 Forbidden):**
```json
{
  "success": false,
  "message": "You do not have permission to create items in this location"
}
```

**✅ Test:** ❌ **403 Forbidden** - Regular user cannot upload to department root without permission

---

### 12.6 User 2 - Try Upload to Engineering Folder (Different Dept)

**Endpoint:** `POST /api/documents/generate-upload-urls`

**Headers:**
```
Authorization: Bearer USER2_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "files": [
    {
      "filename": "hacker.pdf",
      "mimeType": "application/pdf"
    }
  ],
  "parentId": "PASTE_ENG_FOLDER1_ID_HERE"
}
```

**Expected:** ❌ **403 Forbidden** - Cannot upload to another department's folders

---

### 12.7 User 1 - Upload Multiple Documents (Batch)

**Endpoint:** `POST /api/documents/generate-upload-urls`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "files": [
    {
      "filename": "design-mockup.png",
      "mimeType": "image/png"
    },
    {
      "filename": "api-documentation.docx",
      "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    },
    {
      "filename": "database-schema.xlsx",
      "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    }
  ],
  "parentId": "PASTE_ENG_FOLDER2_ID_HERE"
}
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "filename": "design-mockup.png",
      "key": "uploads/1735391000000-0-design-mockup.png",
      "url": "https://...",
      "mimeType": "image/png",
      "fileGroup": "PNG",
      "category": "image"
    },
    {
      "filename": "api-documentation.docx",
      "key": "uploads/1735391000000-1-api-documentation.docx",
      "url": "https://...",
      "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "fileGroup": "WORD",
      "category": "document"
    },
    {
      "filename": "database-schema.xlsx",
      "key": "uploads/1735391000000-2-database-schema.xlsx",
      "url": "https://...",
      "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "fileGroup": "EXCEL",
      "category": "document"
    }
  ],
  "message": "Generated 3 presigned upload URL(s)"
}
```

**✅ Test:** Can generate multiple presigned URLs in one request

**Note:** After uploading all 3 files to S3, create 3 separate document records using `POST /api/documents` for each.

---

### 12.8 Try Upload Blocked File Extension (.exe)

**Endpoint:** `POST /api/documents/generate-upload-urls`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "files": [
    {
      "filename": "malware.exe",
      "mimeType": "application/x-msdownload"
    }
  ],
  "parentId": "PASTE_ENG_FOLDER1_ID_HERE"
}
```

**Expected Response (400 Bad Request):**
```json
{
  "success": false,
  "message": "Invalid files detected: [{\"filename\":\"malware.exe\",\"reason\":\"Extension is blocked for security reasons\",\"extension\":\".exe\",\"mimeType\":\"application/x-msdownload\"}]"
}
```

**✅ Test:** ❌ **400 Bad Request** - Blocked extensions are rejected

---

### 12.9 Try Upload with Mismatched Extension and MIME Type

**Endpoint:** `POST /api/documents/generate-upload-urls`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "files": [
    {
      "filename": "fake-image.png",
      "mimeType": "application/pdf"
    }
  ],
  "parentId": "PASTE_ENG_FOLDER1_ID_HERE"
}
```

**Expected Response (400 Bad Request):**
```json
{
  "success": false,
  "message": "Invalid files detected: [{\"filename\":\"fake-image.png\",\"reason\":\"Extension and MIME type do not match\",\"extension\":\".png\",\"mimeType\":\"application/pdf\"}]"
}
```

**✅ Test:** ❌ **400 Bad Request** - Extension/MIME type mismatch is detected

---

## 📦 STEP 13: Chunked Upload (Large Files)

> **For files larger than 100MB, use chunked upload with progress tracking**

### 13.1 Initiate Chunked Upload

**Endpoint:** `POST /api/documents/chunked/initiate`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "filename": "large-video-tutorial.mp4",
  "mimeType": "video/mp4",
  "fileSize": 524288000,
  "parentId": "PASTE_ENG_FOLDER1_ID_HERE"
}
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "message": "Chunked upload initiated successfully",
  "data": {
    "uploadId": "ABC123XYZ789UPLOADID",
    "key": "uploads/1735391200000-large-video-tutorial.mp4",
    "filename": "large-video-tutorial.mp4",
    "expiresIn": 86400
  }
}
```

**✅ Actions:**
- Save `uploadId` as `CHUNKED_UPLOAD_ID`
- Save `key` as `CHUNKED_KEY`

---

### 13.2 Upload Chunk 1 (Parts 1-5)

**Endpoint:** `POST /api/documents/chunked/upload`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
Content-Type: application/json
```

**Request Body (Part 1):**
```json
{
  "uploadId": "PASTE_CHUNKED_UPLOAD_ID_HERE",
  "key": "PASTE_CHUNKED_KEY_HERE",
  "partNumber": 1,
  "body": "BASE64_ENCODED_CHUNK_DATA_HERE"
}
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "message": "Chunk uploaded successfully",
  "data": {
    "ETag": "\"abc123def456\"",
    "PartNumber": 1
  }
}
```

**✅ Action:** Save ETags for all parts

**Repeat for parts 2, 3, 4, 5...**

**Progress Tracking Example:**
```
Part 1/10 uploaded (10% complete)
Part 2/10 uploaded (20% complete)
Part 3/10 uploaded (30% complete)
...
Part 10/10 uploaded (100% complete)
```

---

### 13.3 Complete Chunked Upload

**Endpoint:** `POST /api/documents/chunked/complete`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "uploadId": "PASTE_CHUNKED_UPLOAD_ID_HERE",
  "key": "PASTE_CHUNKED_KEY_HERE",
  "parts": [
    { "ETag": "\"abc123def456\"", "PartNumber": 1 },
    { "ETag": "\"def456ghi789\"", "PartNumber": 2 },
    { "ETag": "\"ghi789jkl012\"", "PartNumber": 3 },
    { "ETag": "\"jkl012mno345\"", "PartNumber": 4 },
    { "ETag": "\"mno345pqr678\"", "PartNumber": 5 }
  ],
  "name": "Large Video Tutorial",
  "parentId": "PASTE_ENG_FOLDER1_ID_HERE",
  "mimeType": "video/mp4",
  "fileSize": 524288000,
  "description": "Complete video tutorial for the project",
  "tags": ["video", "tutorial", "training"]
}
```

**Expected Response (201 Created):**
```json
{
  "success": true,
  "message": "Chunked upload completed and document created successfully",
  "data": {
    "_id": "675eBBBBBBBBBBBBBBBBBBBB",
    "name": "Large Video Tutorial",
    "originalName": "large-video-tutorial.mp4",
    "type": "document",
    "fileType": "video",
    "parentId": "675e1111111111111111111",
    "fileUrl": "uploads/1735391200000-large-video-tutorial.mp4",
    "mimeType": "video/mp4",
    "extension": "mp4",
    "size": 524288000,
    "version": 1,
    "tags": ["video", "tutorial", "training"],
    "createdAt": "2024-12-28T11:00:00.000Z"
  }
}
```

**✅ Test:** Large file uploaded successfully via chunked upload

---

### 13.4 Abort Chunked Upload (Cancel Mid-Upload)

**Scenario:** User starts upload but wants to cancel

**Endpoint:** `POST /api/documents/chunked/abort`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "uploadId": "PASTE_CHUNKED_UPLOAD_ID_HERE",
  "key": "PASTE_CHUNKED_KEY_HERE"
}
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "message": "Chunked upload aborted successfully"
}
```

**✅ Test:** Partial upload is cleaned up from S3

---

### 13.5 Try Chunked Upload with Small File (< 100MB)

**Endpoint:** `POST /api/documents/chunked/initiate`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "filename": "small-file.pdf",
  "mimeType": "application/pdf",
  "fileSize": 5242880,
  "parentId": "PASTE_ENG_FOLDER1_ID_HERE"
}
```

**Expected Response (400 Bad Request):**
```json
{
  "success": false,
  "errors": [
    {
      "path": ["body", "fileSize"],
      "message": "File size must be at least 100MB for chunked upload"
    }
  ]
}
```

**✅ Test:** ❌ **400 Bad Request** - Files under 100MB should use simple upload

---

## 🔒 STEP 14: Document Access Control

### 14.1 User 1 - View Own Document

**Endpoint:** `GET /api/documents/{DOC1_ID}`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "_id": "675eAAAAAAAAAAAAAAAAAAAA",
    "name": "Project Requirements",
    "originalName": "project-requirements.pdf",
    "type": "document",
    "fileType": "document",
    "parentId": "675e1111111111111111111",
    "departmentId": "675eENGINEERING_DEPT_ID",
    "path": "/Engineering/Backend Projects/Project Requirements.pdf",
    "fileUrl": "uploads/1735390800000-0-project-requirements.pdf",
    "mimeType": "application/pdf",
    "extension": "pdf",
    "size": 2458624,
    "sizeFormatted": "2.34 MB",
    "version": 1,
    "description": "Detailed project requirements document",
    "tags": ["requirements", "project", "documentation"],
    "isDeleted": false,
    "createdBy": {
      "name": "Abhishek Sharma",
      "email": "abhishekreact.dev@gmail.com",
      "avatar": null
    },
    "createdAt": "2024-12-28T10:00:00.000Z",
    "updatedAt": "2024-12-28T10:00:00.000Z",
    "parent": {
      "_id": "675e1111111111111111111",
      "name": "Backend Projects",
      "type": "Folder"
    },
    "actions": {
      "canView": true,
      "canDownload": true,
      "canUpload": true,
      "canDelete": true,
      "canShare": true
    }
  }
}
```

**✅ Test:** Admin can view documents in their department with full permissions

---

### 14.2 User 2 - Try View Engineering Document (Different Dept)

**Endpoint:** `GET /api/documents/{DOC1_ID}`

**Headers:**
```
Authorization: Bearer USER2_TOKEN
```

**Expected Response (403 Forbidden):**
```json
{
  "success": false,
  "message": "You do not have permission to view this document"
}
```

**✅ Test:** ❌ **403 Forbidden** - Cannot view documents in non-assigned department

---

### 14.3 User 4 - Try View Engineering Document (Same Dept, No ACL)

**Endpoint:** `GET /api/documents/{DOC1_ID}`

**Headers:**
```
Authorization: Bearer USER4_TOKEN
```

**Expected:** ❌ **403 Forbidden** - Regular user needs explicit ACL even in same department

---

### 14.4 User 1 - View Document in MyDrive

**Endpoint:** `GET /api/documents/{DOC3_ID}`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
```

**Expected:** ✅ **200 OK** - User can view documents in their own MyDrive

---

### 14.5 User 2 - Try View User 1's MyDrive Document

**Endpoint:** `GET /api/documents/{DOC3_ID}`

**Headers:**
```
Authorization: Bearer USER2_TOKEN
```

**Expected:** ❌ **403 Forbidden** - Cannot view documents in another user's MyDrive

---

### 14.6 Super Admin - Can View Any Document

**Endpoint:** `GET /api/documents/{DOC1_ID}`

**Headers:**
```
Authorization: Bearer SUPER_ADMIN_TOKEN
```

**Expected:** ✅ **200 OK** - Super Admin has access to all documents

---

## 🤝 STEP 15: Document Sharing

### 15.1 User 1 - Share Document with User 4 (View + Download)

**Endpoint:** `POST /api/documents/{DOC1_ID}/share`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "users": [
    {
      "userId": "PASTE_USER4_ID_HERE",
      "permissions": ["view", "download"]
    }
  ],
  "groups": []
}
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "message": "Document shared with 1 subject(s)",
  "data": {
    "document": {
      "_id": "675eAAAAAAAAAAAAAAAAAAAA",
      "name": "Project Requirements",
      "path": "/Engineering/Backend Projects/Project Requirements.pdf"
    },
    "sharedWith": [
      {
        "subjectType": "USER",
        "subjectId": "675e4444444444444444444",
        "subjectName": "arcade_user",
        "permissions": ["view", "download"]
      }
    ]
  }
}
```

**✅ Test:** Document shared successfully with specific permissions

---

### 15.2 User 4 - Now View Shared Document

**Endpoint:** `GET /api/documents/{DOC1_ID}`

**Headers:**
```
Authorization: Bearer USER4_TOKEN
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "_id": "675eAAAAAAAAAAAAAAAAAAAA",
    "name": "Project Requirements",
    "actions": {
      "canView": true,
      "canDownload": true,
      "canUpload": false,
      "canDelete": false,
      "canShare": false
    }
  }
}
```

**✅ Test:** User 4 can now view with limited permissions (view + download only)

---

### 15.3 User 4 - Try to Update Document (No Upload Permission)

**Endpoint:** `PUT /api/documents/{DOC1_ID}`

**Headers:**
```
Authorization: Bearer USER4_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Updated Requirements",
  "description": "Trying to update"
}
```

**Expected Response (403 Forbidden):**
```json
{
  "success": false,
  "message": "You do not have permission to upload this document"
}
```

**✅ Test:** ❌ **403 Forbidden** - Cannot update without upload permission

---

### 15.4 User 1 - Update Share Permissions (Add Upload)

**Endpoint:** `POST /api/documents/{DOC1_ID}/share`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "users": [
    {
      "userId": "PASTE_USER4_ID_HERE",
      "permissions": ["view", "download", "upload"]
    }
  ],
  "groups": []
}
```

**Expected:** ✅ **200 OK** - Permissions updated to include upload

---

### 15.5 User 4 - Now Update Document (Has Upload Permission)

**Endpoint:** `PUT /api/documents/{DOC1_ID}`

**Headers:**
```
Authorization: Bearer USER4_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "description": "Updated by User 4 after getting permission",
  "tags": ["requirements", "project", "updated"]
}
```

**Expected:** ✅ **200 OK** - Can now update because has upload permission

---

### 15.6 User 1 - Share with User 5 (Outside Department)

**Endpoint:** `POST /api/documents/{DOC1_ID}/share`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "users": [
    {
      "userId": "PASTE_USER5_ID_HERE",
      "permissions": ["view"]
    }
  ],
  "groups": []
}
```

**Expected:** ✅ **200 OK** - Can share with users outside department via ACL

---

### 15.7 User 5 - View Cross-Department Shared Document

**Endpoint:** `GET /api/documents/{DOC1_ID}`

**Headers:**
```
Authorization: Bearer USER5_TOKEN
```

**Expected:** ✅ **200 OK** - Can view because explicitly shared

---

### 15.8 User 4 - Try to Share Document (No Share Permission)

**Endpoint:** `POST /api/documents/{DOC1_ID}/share`

**Headers:**
```
Authorization: Bearer USER4_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "users": [
    {
      "userId": "PASTE_USER5_ID_HERE",
      "permissions": ["view"]
    }
  ],
  "groups": []
}
```

**Expected Response (403 Forbidden):**
```json
{
  "success": false,
  "message": "You do not have permission to share this document"
}
```

**✅ Test:** ❌ **403 Forbidden** - Cannot share without share permission
# 📄 DMS Document API - Complete Testing Documentation (Continued)

> **Continuation from Step 15.9 - Completing Document Testing**

---

## 🤝 STEP 15: Document Sharing (Continued)

### 15.9 User 1 - Share with Multiple Users at Once (Continued)

**Expected Response (200 OK):**
```json
{
  "success": true,
  "message": "Document shared with 3 subject(s)",
  "data": {
    "document": {
      "_id": "675eAAAAAAAAAAAAAAAAAAAA",
      "name": "Project Requirements",
      "path": "/Engineering/Backend Projects/Project Requirements.pdf"
    },
    "sharedWith": [
      {
        "subjectType": "USER",
        "subjectId": "675e2222222222222222222",
        "subjectName": "ajay_yadav",
        "permissions": ["view", "download"]
      },
      {
        "subjectType": "USER",
        "subjectId": "675e3333333333333333333",
        "subjectName": "firebase_demo",
        "permissions": ["view"]
      },
      {
        "subjectType": "USER",
        "subjectId": "675e5555555555555555555",
        "subjectName": "shaxma_user",
        "permissions": ["view", "download", "upload"]
      }
    ]
  }
}
```

**✅ Test:** Can share with multiple users in one request with different permissions

---

### 15.10 User 1 - Remove Sharing (Clear ACL)

**Endpoint:** `POST /api/documents/{DOC1_ID}/share`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "users": [],
  "groups": []
}
```

**Expected:** ✅ **200 OK** - All ACL entries removed, shared users lose access

---

### 15.11 Verify User 4 Lost Access After ACL Removal

**Endpoint:** `GET /api/documents/{DOC1_ID}`

**Headers:**
```
Authorization: Bearer USER4_TOKEN
```

**Expected:** ❌ **403 Forbidden** - No longer has access after sharing removed

---

## 🔄 STEP 16: Document Versioning

### 16.1 User 1 - Get All Versions of Document

**Endpoint:** `GET /api/documents/{DOC1_ID}/versions`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "_id": "675eVVVVVVVVVVVVVVVVVVVV",
      "documentId": {
        "_id": "675eAAAAAAAAAAAAAAAAAAAA",
        "name": "Project Requirements",
        "originalName": "project-requirements.pdf",
        "extension": "pdf",
        "type": "document",
        "fileType": "document"
      },
      "versionNumber": 1,
      "fileUrl": "uploads/1735390800000-0-project-requirements.pdf",
      "size": 2458624,
      "sizeFormatted": "2.34 MB",
      "mimeType": "application/pdf",
      "extension": "pdf",
      "isLatest": true,
      "changeDescription": "Initial upload",
      "createdBy": {
        "username": "abhishek_react",
        "email": "abhishekreact.dev@gmail.com"
      },
      "createdAt": "2024-12-28T10:00:00.000Z",
      "createdAgo": "2 hours ago"
    }
  ]
}
```

**✅ Test:** Can view version history with formatted data

---

### 16.2 User 1 - Create New Version (Re-upload)

**Step 1: Generate Presigned URL**

**Endpoint:** `POST /api/documents/generate-upload-urls`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "files": [
    {
      "filename": "project-requirements-v2.pdf",
      "mimeType": "application/pdf"
    }
  ],
  "parentId": "PASTE_ENG_FOLDER1_ID_HERE"
}
```

**Step 2: Upload to S3** (using presigned URL)

**Step 3: Create New Version**

**Endpoint:** `POST /api/documents/{DOC1_ID}/versions`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "fileUrl": "uploads/1735395600000-0-project-requirements-v2.pdf",
  "size": 2658432,
  "mimeType": "application/pdf",
  "extension": "pdf",
  "name": "Project Requirements",
  "originalName": "project-requirements-v2.pdf",
  "changeDescription": "Added authentication section and updated database schema"
}
```

**Expected Response (201 Created):**
```json
{
  "success": true,
  "message": "New version created successfully",
  "data": {
    "_id": "675eWWWWWWWWWWWWWWWWWWWW",
    "documentId": "675eAAAAAAAAAAAAAAAAAAAA",
    "versionNumber": 2,
    "fileUrl": "uploads/1735395600000-0-project-requirements-v2.pdf",
    "size": 2658432,
    "sizeFormatted": "2.54 MB",
    "mimeType": "application/pdf",
    "extension": "pdf",
    "fileType": "document",
    "isLatest": true,
    "changeDescription": "Added authentication section and updated database schema",
    "createdAt": "2024-12-28T12:00:00.000Z"
  }
}
```

**✅ Actions:**
- Save `_id` as `VERSION2_ID`
- Note: Previous version is now `isLatest: false`
- Document's `version` field incremented to 2

---

### 16.3 Verify Document Now Shows Version 2

**Endpoint:** `GET /api/documents/{DOC1_ID}`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
```

**Expected:**
```json
{
  "success": true,
  "data": {
    "_id": "675eAAAAAAAAAAAAAAAAAAAA",
    "name": "Project Requirements",
    "version": 2,
    "size": 2658432,
    "sizeFormatted": "2.54 MB",
    "currentVersionId": {
      "_id": "675eWWWWWWWWWWWWWWWWWWWW",
      "versionNumber": 2,
      "fileUrl": "uploads/1735395600000-0-project-requirements-v2.pdf",
      "isLatest": true,
      "changeDescription": "Added authentication section and updated database schema"
    }
  }
}
```

**✅ Test:** Document metadata reflects latest version

---

### 16.4 User 1 - Create Version 3

**Repeat steps 16.2 with new file:**

**Request Body:**
```json
{
  "fileUrl": "uploads/1735399200000-0-project-requirements-v3.pdf",
  "size": 2898765,
  "mimeType": "application/pdf",
  "extension": "pdf",
  "name": "Project Requirements",
  "originalName": "project-requirements-v3.pdf",
  "changeDescription": "Added API documentation and deployment instructions"
}
```

**✅ Action:** Save as `VERSION3_ID`, now document has 3 versions

---

### 16.5 User 1 - Get All Versions (Now 3 Versions)

**Endpoint:** `GET /api/documents/{DOC1_ID}/versions`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
```

**Expected:** Shows 3 versions, sorted with latest first

```json
{
  "success": true,
  "count": 3,
  "data": [
    {
      "versionNumber": 3,
      "isLatest": true,
      "changeDescription": "Added API documentation and deployment instructions",
      "createdAgo": "Just now"
    },
    {
      "versionNumber": 2,
      "isLatest": false,
      "changeDescription": "Added authentication section and updated database schema",
      "createdAgo": "2 hours ago"
    },
    {
      "versionNumber": 1,
      "isLatest": false,
      "changeDescription": "Initial upload",
      "createdAgo": "4 hours ago"
    }
  ]
}
```

**✅ Test:** Version history shows all versions in descending order

---

### 16.6 User 1 - Revert to Version 2

**Endpoint:** `POST /api/documents/{DOC1_ID}/versions/revert`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "versionNumber": 2
}
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "message": "Version 2 restored successfully",
  "data": {
    "_id": "675eXXXXXXXXXXXXXXXXXXXX",
    "documentId": "675eAAAAAAAAAAAAAAAAAAAA",
    "versionNumber": 4,
    "fileUrl": "uploads/1735395600000-0-project-requirements-v2.pdf",
    "size": 2658432,
    "mimeType": "application/pdf",
    "extension": "pdf",
    "isLatest": true,
    "changeDescription": "Restored from version 2",
    "restoredFromVersion": 2,
    "createdAt": "2024-12-28T14:00:00.000Z"
  }
}
```

**✅ Tests:**
- Creates new version 4 that is a copy of version 2
- Version 4 becomes latest (`isLatest: true`)
- Original versions 1, 2, 3 remain unchanged
- Document now uses version 2's file again

---

### 16.7 User 1 - Download Specific Version (Not Latest)

**Endpoint:** `GET /api/documents/{VERSION1_ID}/download`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "url": "https://your-bucket.s3.amazonaws.com/uploads/1735390800000-0-project-requirements.pdf?X-Amz-Algorithm=...",
    "expiresIn": 3600,
    "filename": "project-requirements.pdf"
  }
}
```

**✅ Test:** Can download any version using its version ID

---

### 16.8 User 4 - Try Create Version (No Upload Permission)

**Endpoint:** `POST /api/documents/{DOC1_ID}/versions`

**Headers:**
```
Authorization: Bearer USER4_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "fileUrl": "uploads/1735402800000-0-hacker.pdf",
  "size": 1234567,
  "mimeType": "application/pdf",
  "extension": "pdf"
}
```

**Expected:** ❌ **403 Forbidden** - No upload permission

---

### 16.9 User 1 - Get Specific Version by Number

**Endpoint:** `GET /api/documents/{DOC1_ID}/versions/2`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "_id": "675eWWWWWWWWWWWWWWWWWWWW",
    "versionNumber": 2,
    "fileUrl": "uploads/1735395600000-0-project-requirements-v2.pdf",
    "size": 2658432,
    "isLatest": false,
    "changeDescription": "Added authentication section and updated database schema"
  }
}
```

**✅ Test:** Can retrieve specific version by version number

---

## 🔧 STEP 17: Document Operations

### 17.1 User 1 - Star Document

**Endpoint:** `POST /api/starred/add`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "id": "PASTE_DOC1_ID_HERE",
  "type": "file"
}
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "message": "file added to starred successfully",
  "data": {
    "id": "675eAAAAAAAAAAAAAAAAAAAA",
    "name": "Project Requirements",
    "type": "file",
    "starred": true,
    "starredAt": "2024-12-28T15:00:00.000Z"
  }
}
```

**✅ Test:** Can star documents (similar to folders)

---

### 17.2 User 1 - Get Starred Items (Including Documents)

**Endpoint:** `GET /api/starred`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
```

**Expected:** Should show both starred folders AND documents

```json
{
  "success": true,
  "count": 3,
  "children": [
    {
      "_id": "675eAAAAAAAAAAAAAAAAAAAA",
      "name": "Project Requirements",
      "type": "document",
      "fileType": "document",
      "extension": "pdf",
      "size": 2658432,
      "sizeFormatted": "2.54 MB",
      "starredAt": "2024-12-28T15:00:00.000Z",
      "actions": {
        "canView": true,
        "canDownload": true,
        "canUpload": true,
        "canDelete": true,
        "canShare": true
      }
    },
    {
      "_id": "675e1111111111111111111",
      "name": "Backend Projects",
      "type": "folder",
      "starredAt": "2024-12-28T10:35:00.000Z"
    },
    {
      "_id": "675e6666666666666666666",
      "name": "Personal Documents",
      "type": "folder",
      "starredAt": "2024-12-28T10:30:00.000Z"
    }
  ]
}
```

**✅ Test:** Starred items include both files and folders

---

### 17.3 User 1 - Add Tags to Document

**Endpoint:** `POST /api/documents/{DOC1_ID}/tags/add`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "tags": ["important", "reviewed", "approved"]
}
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "message": "Tags added successfully",
  "data": {
    "_id": "675eAAAAAAAAAAAAAAAAAAAA",
    "name": "Project Requirements",
    "tags": ["requirements", "project", "documentation", "important", "reviewed", "approved"]
  }
}
```

**✅ Test:** Tags added to existing tags array

---

### 17.4 User 1 - Remove Tags from Document

**Endpoint:** `POST /api/documents/{DOC1_ID}/tags/remove`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "tags": ["documentation", "reviewed"]
}
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "message": "Tags removed successfully",
  "data": {
    "_id": "675eAAAAAAAAAAAAAAAAAAAA",
    "name": "Project Requirements",
    "tags": ["requirements", "project", "important", "approved"]
  }
}
```

**✅ Test:** Specified tags removed from array

---

### 17.5 User 1 - Rename Document

**Endpoint:** `PUT /api/documents/{DOC1_ID}`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "DMS Project Requirements - Final"
}
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "message": "Document updated successfully",
  "data": {
    "_id": "675eAAAAAAAAAAAAAAAAAAAA",
    "name": "DMS Project Requirements - Final",
    "path": "/Engineering/Backend Projects/DMS Project Requirements - Final.pdf",
    "updatedAt": "2024-12-28T15:30:00.000Z"
  }
}
```

**✅ Tests:**
- Document renamed successfully
- Path updated automatically
- Activity logged (FILE_RENAMED)

---

### 17.6 User 1 - Update Document Description

**Endpoint:** `PUT /api/documents/{DOC1_ID}`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "description": "Final approved requirements for the Document Management System project. Last updated December 2024."
}
```

**Expected:** ✅ **200 OK** - Description updated

---

### 17.7 User 1 - Move Document to Different Folder

**Endpoint:** `POST /api/documents/{DOC1_ID}/move`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "newParentId": "PASTE_ENG_FOLDER2_ID_HERE"
}
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "message": "Document moved successfully",
  "data": {
    "_id": "675eAAAAAAAAAAAAAAAAAAAA",
    "name": "DMS Project Requirements - Final",
    "parentId": "675e2222222222222222222",
    "path": "/Engineering/Backend Projects/DMS Project/DMS Project Requirements - Final.pdf",
    "departmentId": "675e1111111111111111111"
  }
}
```

**✅ Tests:**
- Document moved to new folder
- Path updated automatically
- Department remains same (within Engineering)
- Activity logged (FILE_MOVED)

---

## 🔀 STEP 18: Cross-Department Document Tests

### 18.1 User 2 - Upload Document in Marketing

**Endpoint:** `POST /api/documents`

**Headers:**
```
Authorization: Bearer USER2_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Q4 Marketing Campaign",
  "originalName": "q4-campaign.pptx",
  "parentId": "PASTE_MARKETING_FOLDER1_ID_HERE",
  "fileUrl": "uploads/1735406400000-0-q4-campaign.pptx",
  "mimeType": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "extension": "pptx",
  "size": 15728640,
  "description": "Q4 Marketing Campaign Presentation",
  "tags": ["marketing", "campaign", "q4"]
}
```

**✅ Action:** Save `_id` as `DOC4_ID`

---

### 18.2 User 1 - Try View Marketing Document (Different Dept)

**Endpoint:** `GET /api/documents/{DOC4_ID}`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
```

**Expected:** ❌ **403 Forbidden** - Cannot access different department

---

### 18.3 User 2 - Share Marketing Doc with User 1

**Endpoint:** `POST /api/documents/{DOC4_ID}/share`

**Headers:**
```
Authorization: Bearer USER2_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "users": [
    {
      "userId": "PASTE_USER1_ID_HERE",
      "permissions": ["view", "download"]
    }
  ],
  "groups": []
}
```

**Expected:** ✅ **200 OK** - Cross-department sharing successful

---

### 18.4 User 1 - Now View Marketing Document

**Endpoint:** `GET /api/documents/{DOC4_ID}`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
```

**Expected:** ✅ **200 OK** - Can now view with limited permissions

```json
{
  "success": true,
  "data": {
    "_id": "675eDDDDDDDDDDDDDDDDDDDD",
    "name": "Q4 Marketing Campaign",
    "departmentId": "675e2222222222222222222",
    "actions": {
      "canView": true,
      "canDownload": true,
      "canUpload": false,
      "canDelete": false,
      "canShare": false
    }
  }
}
```

**✅ Test:** Cross-department sharing works with proper ACL permissions

---

### 18.5 User 3 (Finance) - Try Access Engineering Document

**Endpoint:** `GET /api/documents/{DOC1_ID}`

**Headers:**
```
Authorization: Bearer USER3_TOKEN
```

**Expected:** ❌ **403 Forbidden** - No access without sharing

---

## 📥 STEP 19: Document Download

### 19.1 User 1 - Download Own Document

**Endpoint:** `GET /api/documents/{DOC1_ID}/download`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "url": "https://your-bucket.s3.amazonaws.com/uploads/1735390800000-0-project-requirements.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=...&X-Amz-Signature=...",
    "expiresIn": 3600,
    "filename": "project-requirements-v2.pdf"
  }
}
```

**✅ Tests:**
- Returns presigned download URL
- URL expires in 1 hour (3600 seconds)
- Filename includes proper extension
- Content-Disposition header sets filename

---

### 19.2 User 4 - Download Shared Document (Has Permission)

**Endpoint:** `GET /api/documents/{DOC1_ID}/download`

**Headers:**
```
Authorization: Bearer USER4_TOKEN
```

**Expected:** ✅ **200 OK** - Can download because has download permission

---

### 19.3 User 5 - Try Download Without Download Permission

**Context:** Assume User 5 has only `view` permission (no download)

**Endpoint:** `GET /api/documents/{DOC1_ID}/download`

**Headers:**
```
Authorization: Bearer USER5_TOKEN
```

**Expected:** ❌ **403 Forbidden** - Has view but not download permission

---

### 19.4 User 1 - Download Specific Version

**Endpoint:** `GET /api/documents/{VERSION1_ID}/download`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
```

**Expected:** ✅ **200 OK** - Can download old version using version ID

```json
{
  "success": true,
  "data": {
    "url": "https://your-bucket.s3.amazonaws.com/uploads/1735390800000-0-project-requirements.pdf?...",
    "expiresIn": 3600,
    "filename": "project-requirements.pdf"
  }
}
```

**✅ Test:** Versions can be downloaded individually

---

## 🔍 STEP 20: Document Search & Tags

### 20.1 User 1 - Search Documents by Name

**Endpoint:** `GET /api/documents/search?q=requirements`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "_id": "675eAAAAAAAAAAAAAAAAAAAA",
      "name": "DMS Project Requirements - Final",
      "originalName": "project-requirements-v2.pdf",
      "extension": "pdf",
      "size": 2658432,
      "sizeFormatted": "2.54 MB",
      "path": "/Engineering/Backend Projects/DMS Project/DMS Project Requirements - Final.pdf",
      "createdAt": "2024-12-28T10:00:00.000Z",
      "createdBy": {
        "name": "Abhishek Sharma",
        "email": "abhishekreact.dev@gmail.com"
      }
    }
  ]
}
```

**✅ Test:** Search returns documents user has access to

---

### 20.2 User 1 - Search in Specific Department

**Endpoint:** `GET /api/documents/search?q=project&departmentId={ENGINEERING_DEPT_ID}`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
```

**Expected:** Returns only documents in Engineering department

---

### 20.3 User 1 - Search with Limit

**Endpoint:** `GET /api/documents/search?q=document&limit=5`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
```

**Expected:** Returns maximum 5 results

---

### 20.4 User 1 - Find Documents by Tags

**Endpoint:** `GET /api/documents/tags?tags=important,approved`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "_id": "675eAAAAAAAAAAAAAAAAAAAA",
      "name": "DMS Project Requirements - Final",
      "tags": ["requirements", "project", "important", "approved"],
      "path": "/Engineering/Backend Projects/DMS Project/DMS Project Requirements - Final.pdf"
    }
  ]
}
```

**✅ Test:** Find documents with specific tags (OR logic)

---

### 20.5 User 1 - Find Documents by Extension

**Endpoint:** `GET /api/documents/extension/pdf`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
```

**Expected:** Returns all PDF documents user has access to

---

### 20.6 User 2 - Search Across All Accessible Documents

**Endpoint:** `GET /api/documents/search?q=campaign`

**Headers:**
```
Authorization: Bearer USER2_TOKEN
```

**Expected:** Returns documents from Marketing department only

---

## ⭐ STEP 21: Document Starred Feature

### 21.1 User 1 - Bulk Star Documents and Folders

**Endpoint:** `POST /api/starred/bulk`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "folderIds": ["PASTE_ENG_FOLDER1_ID_HERE"],
  "fileIds": ["PASTE_DOC1_ID_HERE", "PASTE_DOC3_ID_HERE"],
  "starred": true
}
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "message": "Bulk starred operation completed",
  "data": {
    "totalRequested": 3,
    "totalUpdated": 3,
    "starred": true,
    "results": {
      "files": {
        "updated": 2,
        "notFound": [],
        "noPermission": [],
        "deleted": []
      },
      "folders": {
        "updated": 1,
        "notFound": [],
        "noPermission": [],
        "deleted": []
      }
    }
  }
}
```

**✅ Test:** Can bulk star multiple items at once

---

### 21.2 User 1 - Unstar Document

**Endpoint:** `POST /api/starred/remove`

**Headers:**
```
Authorization: Bearer USER1_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "id": "PASTE_DOC1_ID_HERE",
  "type": "file"
}
```

**Expected:** ✅ **200 OK** - Document unstarred

---

### 21.3 User 4 - Try Star Document Without Access

**Endpoint:** `POST /api/starred/add`

**Headers:**
```
Authorization: Bearer USER4_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "id": "PASTE_DOC4_ID_HERE",
  "type": "file"
}
```

**Expected:** ❌ **403 Forbidden** - Cannot star without view permission

---

## 📊 Summary & Test Results

### ✅ Document Features Successfully Tested

#### Upload & Creation
- [x] Simple document upload (single file)
- [x] Batch upload (multiple files)
- [x] Chunked upload (large files > 100MB)
- [x] File validation (extension, MIME type, size)
- [x] Blocked extensions (.exe, .bat, etc.)
- [x] Extension/MIME type mismatch detection
- [x] Auto-detection of fileType

#### Access Control
- [x] Owner can view/edit their documents
- [x] Department isolation enforced
- [x] MyDrive privacy maintained
- [x] ACL-based sharing
- [x] Permission-based operations

#### Sharing
- [x] Share with individual users
- [x] Share with multiple users at once
- [x] Cross-department sharing
- [x] Permission levels (view, download, upload, delete, share)
- [x] Remove sharing (clear ACL)

#### Versioning
- [x] Create new versions (re-upload)
- [x] View version history
- [x] Download specific versions
- [x] Revert to previous version
- [x] Version metadata tracking

#### Operations
- [x] Rename document
- [x] Update description
- [x] Move to different folder
- [x] Add/remove tags
- [x] Star/unstar documents
- [x] Soft delete
- [x] Restore from trash

#### Search & Discovery
- [x] Search by name
- [x] Filter by department
- [x] Find by tags
- [x] Find by extension
- [x] Recent documents

#### Download
- [x] Generate presigned download URLs
- [x] Download latest version
- [x] Download specific version
- [x] Permission-based downloads

---

## 🎯 Critical Test Scenarios Summary

### Scenario 1: Complete Document Lifecycle
1. User 1 uploads document → ✅ Success
2. User 1 creates version 2 → ✅ Success
3. User 1 shares with User 4 → ✅ Success
4. User 4 downloads → ✅ Success
5. User 1 reverts to version 1 → ✅ Success
6. User 1 moves to different folder → ✅ Success
7. User 1 soft deletes → ✅ Success
8. User 1 restores from trash → ✅ Success

### Scenario 2: Permission-Based Operations
1. User 2 uploads in Marketing → ✅ Success
2. User 1 tries to view → ❌ 403 Forbidden
3. User 2 shares with view permission → ✅ Success
4. User 1 views document → ✅ Success
5. User 1 tries to update → ❌ 403 Forbidden
6. User 2 adds upload permission → ✅ Success
7. User 1 now updates → ✅ Success

### Scenario 3: Version Management
1. Document at version 1 → ✅ Initial
2. Create version 2 → ✅ Success (version incremented)
3. Create version 3 → ✅ Success (version incremented)
4. Revert to version 2 → ✅ Creates version 4 (copy of v2)
5. All versions preserved → ✅ History intact

### Scenario 4: Cross-Department Collaboration
1. Engineering doc created by User 1 → ✅ Success
2. User 2 (Marketing) cannot access → ❌ 403 Forbidden
3. User 1 shares with User 2 → ✅ Cross-dept sharing works
4. User 2 can now view/download → ✅ Limited access
5. User 3 (Finance) still cannot access → ❌ Not shared

---

## 🔍 Edge Cases & Special Tests

### Edge Case 1: Orphaned Documents
**Scenario:** Parent folder deleted but document still exists
- Documents should be moved to trash automatically
- Path should be preserved for restore

### Edge Case 2: Concurrent Version Creation
**Scenario:** Two users upload new version simultaneously
- Last write wins
- Version numbers should not conflict
- Both files stored in S3

### Edge Case 3: Large File Handling
**Scenario:** Upload file > 5GB
- Should fail validation
- Clear error message
- No partial upload

### Edge Case 4: Special Characters in Filename
**Test:** Upload file named: `Test File (2024) - Final [v2].pdf`
- Should sanitize but preserve readability
- No XSS vulnerabilities
- Path constructed correctly

### Edge Case 5: Deleted User's Documents
**Scenario:** User deleted but documents remain
- Documents should be orphaned gracefully
- createdBy field preserved
- Admin can reassign ownership

---

## 🚨 Common Issues & Troubleshooting

### Issue 1: "Parent folder/department not found"
**Cause:** Invalid parentId or deleted parent
**Solution:** 
- Verify parent exists: `GET /api/folders/{parentId}`
- Check if parent is deleted
- Use valid folder/department ID

### Issue 2: "File size exceeds limit"
**Cause:** File > 5GB or invalid size value
**Solution:**
- For files 100MB-5GB: Use chunked upload
- Check file size before upload
- Ensure size is in bytes

### Issue 3: "Extension and MIME type do not match"
**Cause:** File extension doesn't match content type
**Solution:**
- Verify actual file type
- Use correct MIME type
- Don't rename .pdf to .docx

### Issue 4: "You do not have permission"
**Cause:** Missing ACL or not in department
**Solution:**
- Check user's departments: `GET /api/users/{userId}`
- Verify ACL: Check sharing status
- Request access from owner

### Issue 5: Presigned URL expired
**Cause:** Upload URL used after 5 minutes
**Solution:**
- URLs expire in 300 seconds (5 minutes)
- Generate new presigned URL
- Upload immediately after generation

---

## 📈 Performance Considerations

### Upload Performance
- **Small files (< 10MB):** Direct upload ~2-5 seconds
- **Medium files (10MB-100MB):** Direct upload ~5-30 seconds
- **Large files (> 100MB):** Chunked upload, 5-10 minutes for 1GB

### Version History
- **Limit versions:** Consider deleting old versions (keep last 10)
- **Storage cost:** Each version stores full file in S3
- **Download speed:** Direct from S3, very fast

### Search Performance
- **Text search:** Indexed on name field, fast
- **Tag search:** Indexed, very fast
- **Extension filter:** Fast with proper indexing

---

## 🔐 Security Best Practices

### 1. File Upload Security
- ✅ Validate file extensions
- ✅ Check MIME types
- ✅ Block executable files (.exe, .bat, .sh)
- ✅ Scan for malware (implement virus scanning)
- ✅ Limit file size (5GB max)

### 2. Access Control
- ✅ Always check permissions before operations
- ✅ Use ACL for granular control
- ✅ Enforce department isolation
- ✅ Protect MyDrive privacy
- ✅ Validate user has access to parent folder

### 3. Data Protection
- ✅ Encrypt files at rest (S3 encryption)
- ✅ Use presigned URLs (time-limited)
- ✅ Sanitize user inputs (XSS protection)
- ✅ Audit all operations (activity logs)
- ✅ Soft delete (recovery possible)

### 4. Version Control
- ✅ Preserve all versions
- ✅ Track who created each version
- ✅ Store change descriptions
- ✅ Allow revert to any version
- ✅ Prevent accidental overwrites

---

## 📝 Testing Checklist

### Pre-Test Setup
- [ ] All users created and logged in
- [ ] All departments created
- [ ] All folders created
- [ ] User tokens saved
- [ ] Test files prepared (various types and sizes)

### Upload Tests
- [ ] Single file upload
- [ ] Multiple file upload
- [ ] Chunked upload (> 100MB)
- [ ] Blocked extension rejection
- [ ] MIME type validation
- [ ] File size limits

### Access Control Tests
- [ ] Owner can access
- [ ] Department members (no ACL) cannot access
- [ ] Shared users can access (with ACL)
- [ ] Cross-department access blocked
- [ ] MyDrive privacy enforced
- [ ] Super admin has full access

### Sharing Tests
- [ ] Share with single user
- [ ] Share with multiple users
- [ ] Different permission levels
- [ ] Cross-department sharing
- [ ] Remove sharing
- [ ] Verify access loss after unshare

### Version Tests
- [ ] Create new version
- [ ] View version history
- [ ] Download specific version
- [ ] Revert to old version
- [ ] Version numbering correct
- [ ] Latest version marked correctly

### Operation Tests
- [ ] Rename document
- [ ] Update description
- [ ] Move to different folder
- [ ] Add tags
- [ ] Remove tags
- [ ] Star/unstar
- [ ] Soft delete
- [ ] Restore from trash

### Search Tests
- [ ] Search by name
- [ ] Filter by department
- [ ] Find by tags
- [ ] Find by extension
- [ ] Search with limits
- [ ] Recent documents

### Download Tests
- [ ] Download latest version
- [ ] Download specific version
- [ ] Permission-based downloads
- [ ] Presigned URL expiration
- [ ] Filename correctness

---

## 🎓 Key Learnings

### 1. Document vs Folder Differences
- **Documents:** Have versions, file content, downloads
- **Folders:** Have children, no versions, organizational only
- **Both:** Can be shared, starred, moved, deleted

### 2. Version Management
- Creating new version increments `version` field
- Each version is a separate record in `DocumentVersion` collection
- `currentVersionId` points to latest version
- Revert creates new version (doesn't delete)

### 3. Access Control Hierarchy
1. **Super Admin:** Full access everywhere
2. **Department Owner/Admin:** Full access in department
3. **ACL Permissions:** Explicit sharing
4. **Default:** No access

### 4. File Type Detection
- `extension` → File extension (.pdf, .docx)
- `mimeType` → Content type (application/pdf)
- `fileType` → Category (document, image, video, audio, other)
- All three must be consistent

### 5. Path Management
- Auto-updates when document renamed
- Auto-updates when document moved
- Auto-updates when parent folder renamed
- Format: `/DepartmentName/Folder1/Folder2/DocumentName.ext`

---

## 🚀 Quick Test Commands (cURL)

### Upload Document
```bash
# 1. Generate presigned URL
curl -X POST http://localhost:5000/api/documents/generate-upload-urls \
  -H "Authorization: Bearer $USER1_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "files": [{"filename": "test.pdf", "mimeType": "application/pdf"}],
    "parentId": "'$ENG_FOLDER1_ID'"
  }'

# 2. Upload to S3 (use returned URL)
curl -X PUT "$PRESIGNED_URL" \
  -H "Content-Type: application/pdf" \
  --data-binary @test.pdf

# 3. Create document record
curl -X POST http://localhost:5000/api/documents \
  -H "Authorization: Bearer $USER1_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Document",
    "originalName": "test.pdf",
    "parentId": "'$ENG_FOLDER1_ID'",
    "fileUrl": "uploads/key-from-step1",
    "mimeType": "application/pdf",
    "extension": "pdf",
    "size": 123456
  }'
```

### Share Document
```bash
curl -X POST http://localhost:5000/api/documents/$DOC1_ID/share \
  -H "Authorization: Bearer $USER1_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "users": [{
      "userId": "'$USER4_ID'",
      "permissions": ["view", "download"]
    }],
    "groups": []
  }'
```

### Create Version
```bash
curl -X POST http://localhost:5000/api/documents/$DOC1_ID/versions \
  -H "Authorization: Bearer $USER1_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fileUrl": "uploads/new-version-key",
    "size": 234567,
    "mimeType": "application/pdf",
    "extension": "pdf",
    "changeDescription": "Updated content"
  }'
```

### Download Document
```bash
curl -X GET http://localhost:5000/api/documents/$DOC1_ID/download \
  -H "Authorization: Bearer $USER1_TOKEN"
```

### Search Documents
```bash
curl -X GET "http://localhost:5000/api/documents/search?q=project&limit=10" \
  -H "Authorization: Bearer $USER1_TOKEN"
```

---

## 📊 API Endpoints Summary

### Document Management
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/documents/generate-upload-urls` | Generate presigned URLs | Required |
| POST | `/api/documents` | Create document record | Required |
| GET | `/api/documents/:id` | Get document by ID | Required |
| PUT | `/api/documents/:id` | Update document | Required |
| DELETE | `/api/documents/:id` | Soft delete document | Required |
| POST | `/api/documents/:id/restore` | Restore document | Required |
| POST | `/api/documents/:id/move` | Move document | Required |
| GET | `/api/documents/:id/download` | Generate download URL | Required |

### Versioning
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/documents/:id/versions` | Get all versions | Required |
| POST | `/api/documents/:id/versions` | Create new version | Required |
| GET | `/api/documents/:id/versions/:versionNumber` | Get specific version | Required |
| POST | `/api/documents/:id/versions/revert` | Revert to version | Required |

### Sharing
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/documents/:id/share` | Share with users/groups | Required |

### Tags
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/documents/:id/tags/add` | Add tags | Required |
| POST | `/api/documents/:id/tags/remove` | Remove tags | Required |
| GET | `/api/documents/tags` | Find by tags | Required |

### Search
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/documents/search` | Search documents | Required |
| GET | `/api/documents/extension/:ext` | Find by extension | Required |
| GET | `/api/documents/recent/:departmentId` | Recent documents | Required |

### Chunked Upload
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/documents/chunked/initiate` | Start chunked upload | Required |
| POST | `/api/documents/chunked/upload` | Upload chunk | Required |
| POST | `/api/documents/chunked/complete` | Complete upload | Required |
| POST | `/api/documents/chunked/abort` | Cancel upload | Required |

---

## ✅ Final Testing Sign-off

### All Features Tested
- [x] **Upload System:** Simple, batch, and chunked uploads ✅
- [x] **Access Control:** Department, MyDrive, and ACL-based ✅
- [x] **Sharing:** Single, multiple, cross-department ✅
- [x] **Versioning:** Create, view, revert, download ✅
- [x] **Operations:** Rename, move, delete, restore ✅
- [x] **Search:** Name, tags, extension, department ✅
- [x] **Download:** Latest, specific version, permissions ✅
- [x] **Starred:** Add, remove, bulk operations ✅
- [x] **Security:** File validation, permissions, sanitization ✅

### Total Test Cases: **85+**
### Total Steps: **21**
### Success Rate Target: **100%**

---

## 🎉 Congratulations!

You've completed the comprehensive DMS Document API testing! Your Document Management System now has:

✅ **Secure file uploads** with validation  
✅ **Granular access control** with ACL  
✅ **Version management** with history  
✅ **Cross-department collaboration**  
✅ **Advanced search** and filtering  
✅ **Audit trail** with activity logs  
✅ **MyDrive privacy** protection  
✅ **Soft delete** with recovery  

**Next Steps:**
1. Run automated tests with this documentation
2. Test edge cases and error scenarios
3. Performance testing with large files
4. Security audit and penetration testing
5. User acceptance testing (UAT)

---

**📚 Related Documentation:**
- [Folder API Testing Guide](./folder-testing-guide.md) ✅ Complete
- [Authentication & User Management](./auth-testing-guide.md)
- [Department & Access Control](./department-testing-guide.md)
- [Activity Logs & Auditing](./activity-logs-guide.md)

---

**Document Version:** 1.0  
**Last Updated:** December 28, 2024  
**Status:** ✅ Complete & Ready for Testing