# 🏢 DMS Hybrid System - Complete Design Documentation

## Document Management System with Personal Drive + Organization Drive + Sharing

---

## 📋 Table of Contents

1. [System Overview](#system-overview)
2. [Core Concepts](#core-concepts)
3. [Architecture Design](#architecture-design)
4. [Database Models](#database-models)
5. [Access Control Logic](#access-control-logic)
6. [Folder Sharing System](#folder-sharing-system)
7. [RBAC for Organization Drive](#rbac-organization)
8. [Real-World Examples](#real-examples)

## 🎯 System Overview {#system-overview}

### What We're Building

A Hybrid Document Management System with three main components:

1. **My Drive (Personal)** - Private workspace for each user
2. **Organization Drive** - Company-wide shared folders with RBAC (5 roles)
3. **Shared with Me** - View folders others have shared with you

### Key Design Decisions

- ✅ Personal folders CAN be shared with other users
- ✅ NO promotion from personal to organization folders
- ✅ Super Admin CANNOT see personal folders (privacy first)
- ✅ Two distinct folder types - PERSONAL and ORGANIZATION

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      DMS HYBRID SYSTEM                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────────┐                 ┌──────────────────┐   │
│  │  PERSONAL DRIVE    │                 │ ORGANIZATION     │   │
│  │  (My Drive)        │                 │ DRIVE            │   │
│  ├────────────────────┤                 ├──────────────────┤   │
│  │                    │                 │                  │   │
│  │ • Private by       │                 │ • Shared by      │   │
│  │   default          │                 │   default        │   │
│  │                    │                 │                  │   │
│  │ • Owner = Creator  │                 │ • Access via     │   │
│  │                    │                 │   RBAC           │   │
│  │ • Can share with   │◄────────┐       │                  │   │
│  │   specific users   │         │       │ • 5 Role system  │   │
│  │                    │         │       │                  │   │
│  │ • Super Admin      │         │       │ • Department     │   │
│  │   NO access        │         │       │   based          │   │
│  │                    │         │       │                  │   │
│  └────────────────────┘         │       └──────────────────┘   │
│                                 │                              │
│                    ┌────────────▼──────────┐                   │
│                    │  SHARING SYSTEM       │                   │
│                    ├───────────────────────┤                   │
│                    │                       │                   │
│                    │ • Share personal      │                   │
│                    │   folders             │                   │
│                    │                       │                   │
│                    │ • Grant permissions:  │                   │
│                    │   - VIEWER            │                   │
│                    │   - EDITOR            │                   │
│                    │   - CO_OWNER          │                   │
│                    │                       │                   │
│                    │ • Revoke access       │                   │
│                    │                       │                   │
│                    └───────────────────────┘                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🧩 Core Concepts {#core-concepts}

### Concept 1: Two Types of Folders

Every folder in your system is ONE of these two types:

#### PERSONAL Folder
- Created in "My Drive"
- Completely private by default
- You are the owner
- Only you can see it initially
- You can share it with specific people
- Cannot be converted to organization folder

**Think of it like:** Your personal diary - only you can read it unless you show it to someone

#### ORGANIZATION Folder
- Created in "Organization Drive"
- Belongs to a department
- Access controlled by user roles (RBAC)
- Visible to people based on their job role
- Cannot be shared like personal folders

**Think of it like:** Company filing cabinet - access depends on your job position

---

### Concept 2: Access Control Layers

We use a two-layer access control system:

#### Layer 1: Folder Storage
- Stores the folder metadata (name, type, owner, department)
- Defines what type of folder it is
- Links to parent folder (for hierarchy)

#### Layer 2: Access Control
- Defines WHO can access WHAT folder
- Stores permission level (Owner/Co-Owner/Editor/Viewer)
- Tracks HOW access was granted (Created/Assigned/Shared)
- Handles expiry and revocation

**Why two layers?**
- **Flexibility:** Easy to add/remove access without touching folder data
- **Audit:** Complete history of who accessed what and when
- **Performance:** Efficient queries for "what folders can user X see?"
- **Sharing:** Simple mechanism to grant/revoke access

---

### Concept 3: Access Sources

Every folder access comes from one of three sources:

1. **CREATED:** User created the folder (becomes OWNER)
2. **ASSIGNED_RBAC:** Admin/Dept Head assigned folder access in organization
3. **SHARED:** Another user shared their personal folder with you

**Access Source Flow:**

```
Personal Folder:
  Create → CREATED (Owner) → Share → SHARED (Others)

Organization Folder:
  Create → CREATED (Creator gets owner) → Admin Assigns → ASSIGNED_RBAC
```

---

### Concept 4: Permission Levels

Four levels of access for any folder:

```
┌──────────────────────────────────────────────────┐
│ OWNER                                            │
│ ├─ View files & folders                          │
│ ├─ Upload/Edit/Delete files                      │
│ ├─ Create/Delete subfolders                      │
│ ├─ Share folder with others (personal only)      │
│ └─ Manage all permissions                        │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ CO_OWNER                                         │
│ ├─ View files & folders                          │
│ ├─ Upload/Edit/Delete files                      │
│ ├─ Create/Delete subfolders                      │
│ ├─ Share folder with others (personal only)      │
│ └─ Cannot manage owner permissions               │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ EDITOR                                           │
│ ├─ View files & folders                          │
│ ├─ Upload/Edit/Delete files                      │
│ ├─ Create/Delete subfolders                      │
│ └─ Cannot share                                  │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ VIEWER                                           │
│ ├─ View files & folders                          │
│ ├─ Download files                                │
│ └─ Cannot modify anything                        │
└──────────────────────────────────────────────────┘
```

---

## 🏗️ Architecture Design {#architecture-design}

### Why This Architecture?

We're using **Enterprise Grade with Access Control Table** because:

- ✅ **Requirement Met:** Personal folder sharing with granular permissions
- ✅ **Scalability:** Easy to add new permission levels
- ✅ **Flexibility:** Grant/revoke access without touching folder structure
- ✅ **Audit:** Complete trail of who accessed what
- ✅ **Performance:** Efficient queries with proper indexing

### Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    LAYER 1: STORAGE                     │
│                                                         │
│  Folder Model (type: PERSONAL/ORGANIZATION)            │
│  File Model                                            │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                 LAYER 2: ACCESS CONTROL                 │
│                                                         │
│  FolderAccess Model (who can access what)              │
│  FolderShare Model (sharing metadata)                  │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                   LAYER 3: BUSINESS LOGIC               │
│                                                         │
│  • RBAC for Organization folders                       │
│  • Ownership check for Personal folders                │
│  • Share permission validation                         │
└─────────────────────────────────────────────────────────┘
```

### System Flow Diagram

```
┌──────────────────────────────────────────────────────┐
│                   USER INTERFACE                     │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐    │
│  │  My Drive  │  │   Org      │  │  Shared    │    │
│  │            │  │   Drive    │  │  with Me   │    │
│  └────────────┘  └────────────┘  └────────────┘    │
└────────────────────┬─────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────┐
│              API LAYER (Express Routes)              │
│  • Authentication Middleware                         │
│  • Authorization Checks                              │
│  • Request Validation                                │
└────────────────────┬─────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────┐
│           BUSINESS LOGIC LAYER (Services)            │
│                                                      │
│  ┌────────────────┐         ┌──────────────────┐   │
│  │ Access Control │         │  Sharing Logic   │   │
│  │    Service     │◄───────►│     Service      │   │
│  └────────────────┘         └──────────────────┘   │
│          ▲                           ▲              │
│          │                           │              │
│  ┌───────┴───────┐         ┌────────┴─────────┐   │
│  │  RBAC Logic   │         │  Folder Service  │   │
│  │   for Org     │         │                  │   │
│  └───────────────┘         └──────────────────┘   │
│                                                      │
└────────────────────┬─────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────┐
│            DATA LAYER (MongoDB Models)               │
│                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │   Folder    │  │ FolderAccess │  │ FolderShare│ │
│  │   Model     │  │    Model     │  │   Model    │ │
│  └─────────────┘  └──────────────┘  └────────────┘ │
│                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │    File     │  │     User     │  │ Department │ │
│  │   Model     │  │    Model     │  │   Model    │ │
│  └─────────────┘  └──────────────┘  └────────────┘ │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### Collections Overview

```
┌──────────────────────────────────────────────────────┐
│                    COLLECTIONS                       │
├──────────────────────────────────────────────────────┤
│                                                      │
│  1. folders                                          │
│     ├── Stores all folders (personal + organization)│
│     ├── Type distinguishes personal vs organization │
│     └── Owner tracks creator                         │
│                                                      │
│  2. folderAccess ⭐ KEY TABLE                        │
│     ├── Who has access to which folder              │
│     ├── What level of access (OWNER/EDITOR/VIEWER)  │
│     └── How they got access (CREATED/ASSIGNED/...)  │
│                                                      │
│  3. folderShares                                     │
│     ├── Tracks sharing invitations                  │
│     ├── Share metadata (message, expiry)            │
│     └── Share history                               │
│                                                      │
│  4. files                                            │
│     ├── Stores all uploaded files                   │
│     ├── Links to parent folder                      │
│     └── Uploaded by which user                      │
│                                                      │
│  5. users (existing)                                 │
│     ├── User information                            │
│     ├── Role assignment                             │
│     └── Department assignment                       │
│                                                      │
│  6. departments (existing)                           │
│     ├── Department information                      │
│     └── Department head                             │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## 💾 Database Models {#database-models}

### Model 1: Folder

**Purpose:** Store all folders (both personal and organization)

**Schema Overview:**
- Folder metadata (name, description)
- Folder type (PERSONAL/ORGANIZATION)
- Ownership information
- Hierarchy (parent-child relationships)
- Department association (for org folders)
- Soft delete support
- Timestamps

**Important Business Rules:**
- Organization folders MUST have a department
- Personal folders MUST NOT have a department
- Parent folder must be same type as child folder
- Soft delete preserves data for audit/recovery

---

### Model 2: FolderAccess ⭐ MOST IMPORTANT

**Purpose:** Control who can access which folder with what permissions

**Schema Overview:**
- Folder and user references
- Permission level (OWNER/CO_OWNER/EDITOR/VIEWER)
- Access source tracking (CREATED/ASSIGNED_RBAC/SHARED)
- Grant metadata (who granted, when)
- Expiry support
- Active status flag
- Timestamps

**Important Business Rules:**
- One user can have only ONE active access type per folder
- Unique compound index on: folderId + userId
- When access expires, isActive becomes false automatically
- Access can be revoked by setting isActive to false

**Permission Matrix:**

```
┌─────────────┬──────┬────────┬────────┬───────┬─────────┐
│ Access Type │ VIEW │ UPLOAD │ DELETE │ SHARE │ MANAGE  │
├─────────────┼──────┼────────┼────────┼───────┼─────────┤
│ OWNER       │  ✅  │   ✅   │   ✅   │  ✅   │   ✅    │
│ CO_OWNER    │  ✅  │   ✅   │   ✅   │  ✅   │   ❌    │
│ EDITOR      │  ✅  │   ✅   │   ✅   │  ❌   │   ❌    │
│ VIEWER      │  ✅  │   ❌   │   ❌   │  ❌   │   ❌    │
└─────────────┴──────┴────────┴────────┴───────┴─────────┘
```

---

### Model 3: FolderShare

**Purpose:** Track personal folder sharing with metadata

**Schema Overview:**
- Folder reference
- Sharer and recipient references
- Permission level granted
- Share message/notes
- Active status tracking
- Revocation metadata
- Timestamps

**Important Business Rules:**
- Can only share PERSONAL folders
- Cannot share with yourself
- Permission level cannot be OWNER (only original owner keeps OWNER)
- When share is revoked, corresponding FolderAccess is also deactivated
- Share message is optional but recommended for clarity

---

### Model 4: File

**Purpose:** Store uploaded files metadata

**Schema Overview:**
- File identification (name, original name)
- Parent folder reference
- Upload metadata (who uploaded, when)
- Storage location (S3 URL or local path)
- File properties (size, MIME type, extension)
- Soft delete support
- Timestamps

**Important Business Rules:**
- Files inherit access permissions from parent folder
- Soft delete preserves file metadata
- File size tracked in bytes for quota management
- Original filename preserved for download purposes

---

### Model 5: User (Reference - Already Exists)

**Purpose:** Store user information and role assignments

**Relevant Fields for DMS:**
- User identification (name, email)
- Role assignment (SUPER_ADMIN/ADMIN/DEPT_HEAD/FOLDER_MANAGER/FOLDER_USER)
- Department associations
- Account status

**Important Business Rules:**
- DEPT_HEAD: Assigned to ONE department
- ADMIN: Can be assigned to MULTIPLE departments
- Role determines access to organization folders
- isActive flag controls account access

---

### Model 6: Department (Reference - Already Exists)

**Purpose:** Store department information

**Schema Overview:**
- Department identification (name, code)
- Description
- Department head reference
- Active status

**Important Business Rules:**
- Each department has one head (DEPT_HEAD role)
- Department code must be unique
- Used for organization folder categorization
- isActive controls department visibility

---

## 🔐 Access Control Logic {#access-control-logic}

### Decision Flow for Access Check

```
┌─────────────────────────────────────────────────────┐
│  User wants to perform ACTION on FOLDER             │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
          ┌──────────────────┐
          │ What folder type?│
          └────────┬─────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
   PERSONAL              ORGANIZATION
        │                     │
        ▼                     ▼
┌───────────────┐    ┌────────────────┐
│ Is user owner?│    │  Apply RBAC    │
└───────┬───────┘    │  (Role Based)  │
        │            └────────┬───────┘
       YES                    │
        │                     │
        ▼                     ▼
   ┌─────────┐          ┌──────────┐
   │  ALLOW  │          │  Check   │
   │  (OWNER)│          │   Role   │
   └─────────┘          └────┬─────┘
        ▲                    │
        │              ┌─────┴─────┐
        │              │           │
        │         SUPER_ADMIN   OTHERS
        │              │           │
        │              ▼           ▼
        │         ┌────────┐  ┌──────────────┐
        │         │ ALLOW  │  │ Check Dept + │
        │         └────────┘  │ Assignment   │
        │                     └──────┬───────┘
        │                            │
┌───────┴─────────┐                  │
│ Check FolderAccess│                │
│ table for share  │                 │
└───────┬─────────┘                  │
        │                            │
   ┌────┴────┐                  ┌────┴────┐
  YES       NO                 YES       NO
   │         │                  │         │
   ▼         ▼                  ▼         ▼
┌──────┐ ┌──────┐          ┌──────┐ ┌──────┐
│ALLOW │ │DENY  │          │ALLOW │ │DENY  │
└──────┘ └──────┘          └──────┘ └──────┘
```

### Access Control Logic Overview

#### For PERSONAL Folders:

**Step 1:** Check if user is the owner
- If YES → Full access (OWNER permissions)
- If NO → Go to Step 2

**Step 2:** Check FolderAccess table
- Look for active access record for this user
- Check if access has expired (compare expiresAt with current date)
- If found and valid → Grant access based on permission level
- If not found → DENY access

**Important:** Super Admin CANNOT access personal folders (privacy first)

#### For ORGANIZATION Folders:

**Step 1:** Check user role

**If SUPER_ADMIN:**
- Full access to all organization folders
- Can VIEW, UPLOAD, DELETE, CREATE_FOLDER, MANAGE_USERS
- No department restrictions

**If ADMIN:**
- Check if user is assigned to this folder's department
- If YES → Can VIEW, UPLOAD, DELETE, CREATE_FOLDER, ASSIGN_FOLDER_MANAGER
- If NO → DENY

**If DEPT_HEAD:**
- Check if this is their assigned department
- If YES → Can VIEW, UPLOAD, DELETE, CREATE_FOLDER, ASSIGN_FOLDER_MANAGER
- If NO → DENY

**If FOLDER_MANAGER:**
- Check FolderAccess table for direct assignment
- Also check parent folders (inheritance)
- If found → Can VIEW, UPLOAD, DELETE, CREATE_SUBFOLDER
- If not found → DENY

**If FOLDER_USER:**
- Check FolderAccess table for direct assignment
- Also check parent folders (inheritance)
- If found → Can VIEW, UPLOAD
- If not found → DENY

---

## 🤝 Folder Sharing System {#folder-sharing-system}

### How Personal Folder Sharing Works

```
┌─────────────────────────────────────────────────┐
│            FOLDER SHARING WORKFLOW              │
├─────────────────────────────────────────────────┤
│                                                 │
│  1. User A (Owner) shares "My Docs" with User B│
│     ↓                                           │
│  2. System verifies:                            │
│     • Folder is PERSONAL type                   │
│     • User A has permission to share (OWNER/CO_OWNER)│
│     • User B is not User A (can't share with self)│
│     ↓                                           │
│  3. Create FolderShare record                   │
│     • Store share metadata                      │
│     • Store share message                       │
│     ↓                                           │
│  4. Create FolderAccess record for User B       │
│     • Grant permission level                    │
│     • Set accessSource = SHARED                 │
│     ↓                                           │
│  5. User B can now access "My Docs"            │
│     • Folder appears in "Shared with Me"       │
│     • Access level based on permission given    │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Share Permission Levels

```
┌─────────────┬──────┬────────┬────────┬───────┬─────────┐
│ Permission  │ VIEW │ UPLOAD │ DELETE │ SHARE │ MANAGE  │
├─────────────┼──────┼────────┼────────┼───────┼─────────┤
│ VIEWER      │  ✅  │   ❌   │   ❌   │  ❌   │   ❌    │
│ EDITOR      │  ✅  │   ✅   │   ✅   │  ❌   │   ❌    │
│ CO_OWNER    │  ✅  │   ✅   │   ✅   │  ✅   │   ❌    │
│ OWNER       │  ✅  │   ✅   │   ✅   │  ✅   │   ✅    │
└─────────────┴──────┴────────┴────────┴───────┴─────────┘
```

### Sharing Rules

**✅ CAN Share:**
- OWNER can share with anyone
- CO_OWNER can share with anyone
- Can share with multiple users
- Can set different permission levels for different users
- Can update existing share permissions

**❌ CANNOT Share:**
- EDITOR cannot share
- VIEWER cannot share
- FOLDER_MANAGER cannot share (they manage assigned folders only)
- Cannot share organization folders (only personal folders)
- Cannot share with yourself

### Sharing Workflow Steps

**Step 1: Initiate Share**
- User clicks "Share" on a personal folder
- System shows share dialog with user search

**Step 2: Select User and Permission**
- Search and select user to share with
- Choose permission level (VIEWER/EDITOR/CO_OWNER)
- Optional: Add share message

**Step 3: System Validation**
- Verify folder is PERSONAL type
- Verify current user can share (OWNER or CO_OWNER)
- Verify not sharing with self
- Check if already shared (update existing or create new)

**Step 4: Create Records**
- Create/Update FolderShare record
- Create/Update FolderAccess record
- Set accessSource = SHARED

**Step 5: Notification**
- Notify recipient about shared folder
- Include share message if provided

### Revoking Share

**Step 1: Initiate Revoke**
- Owner/CO_OWNER clicks "Revoke" on shared user

**Step 2: System Updates**
- Update FolderShare: Set isActive = false, add revokedAt, revokedBy
- Update FolderAccess: Set isActive = false

**Step 3: Access Removed**
- User can no longer access the folder
- Folder removed from their "Shared with Me" view

---

## 🏢 RBAC for Organization Drive {#rbac-organization}

### Role Hierarchy

```
                  SUPER_ADMIN
                      │
          ┌───────────┴───────────┐
          │                       │
        ADMIN              DEPT_HEAD
          │                       │
          └───────────┬───────────┘
                      │
              FOLDER_MANAGER
                      │
                 FOLDER_USER
```

---

## 👥 The 5 Roles Explained

### 🔴 Role 1: SUPER_ADMIN
**Who**: System owner, CTO, IT Head

**Powers**:
- ✅ Create/delete departments
- ✅ Access ALL organization folders in ALL departments
- ✅ Create/delete folders anywhere in organization drive
- ✅ Upload/delete files anywhere in organization drive
- ✅ Assign Admins to departments
- ✅ Assign Department Heads
- ✅ Assign Folder Managers and Folder Users
- ✅ Manage all users and roles

**Restrictions**:
- ❌ None for organization folders - bypasses all access checks
- ❌ **CANNOT access personal folders** (privacy respected)

**Example Scenario:**
```
Rajesh (Super Admin):
✅ Creates "Marketing" department
✅ Creates "Sales" department
✅ Makes Priya an Admin and assigns to Marketing + Sales
✅ Can access ANY file in ANY organization folder
✅ Can delete any organization folder
❌ Cannot see Sarah's personal "Draft Documents" folder (privacy)
```

---

### 🟠 Role 2: ADMIN
**Who**: Senior manager handling multiple departments

**Powers**:
- ✅ Access assigned departments (can be assigned to MULTIPLE departments)
- ✅ View all folders/files in assigned departments
- ✅ Create/delete root folders in assigned departments
- ✅ Upload/delete files in assigned departments
- ✅ Assign Folder Managers to folders in assigned departments
- ✅ Assign Folder Users to folders in assigned departments

**Restrictions**:
- ❌ Cannot create new departments
- ❌ Cannot access non-assigned departments
- ❌ Cannot assign other Admins (only Super Admin can)
- ❌ Cannot assign Department Heads
- ❌ Cannot access personal folders of any user

**Example Scenario:**
```
Priya (Admin assigned to Marketing + Sales departments):
✅ Can create root folders in Marketing department
✅ Can upload files to any folder in Sales department
✅ Can assign Rahul as Folder Manager to "Campaigns" folder
✅ Can delete files in Marketing or Sales
❌ Cannot access HR department (not assigned)
❌ Cannot create new departments
❌ Cannot make another user an Admin
❌ Cannot see anyone's personal folders
```

**Department Assignment:**
- Admin can be assigned to 1, 2, 3+ departments
- Super Admin controls these assignments
- Each assignment grants full access to that department's org folders

**Access Validation:**
```javascript
// For Admin accessing organization folder
if (user.role === 'ADMIN') {
  const folder = getFolder(folderId);
  if (user.assignedDepartments.includes(folder.departmentId)) {
    return ALLOW; // Admin has access to this department
  }
  return DENY; // Admin not assigned to this department
}
```

---

### 🟡 Role 3: DEPT_HEAD (Department Head)
**Who**: Head/Manager of ONE specific department

**Powers**:
- ✅ Full access to their assigned department
- ✅ View all folders/files in their department
- ✅ Create/delete root folders in their department
- ✅ Upload/delete files in their department
- ✅ Assign Folder Managers to folders in their department
- ✅ Assign Folder Users to folders in their department

**Restrictions**:
- ❌ Can only manage ONE department
- ❌ Cannot access other departments
- ❌ Cannot create new departments
- ❌ Cannot assign Admins or other Department Heads
- ❌ Cannot access personal folders

**Example Scenario:**
```
Sneha (Department Head of Marketing):
✅ Can create any root folder in Marketing department
✅ Can delete any file in Marketing department
✅ Can assign Rahul as Folder Manager to "Campaigns" folder
✅ Can upload files anywhere in Marketing
❌ Cannot see Sales department folders
❌ Cannot access HR department folders
❌ Cannot make anyone an Admin
❌ Cannot see personal folders
```

**Department Assignment:**
- Dept Head is assigned to exactly ONE department
- Cannot be changed without Super Admin
- Full control over their department (similar to Admin but single dept)

**Access Validation:**
```javascript
// For Dept Head accessing organization folder
if (user.role === 'DEPT_HEAD') {
  const folder = getFolder(folderId);
  if (user.assignedDepartment === folder.departmentId) {
    return ALLOW; // Dept Head manages this department
  }
  return DENY; // Not their department
}
```

---

### 🟢 Role 4: FOLDER_MANAGER
**Who**: Owner/Manager of specific folder(s) within a department

**Powers**:
- ✅ Full access to assigned folders
- ✅ View all files in assigned folders
- ✅ Upload/delete files in assigned folders
- ✅ Create subfolders inside assigned folders
- ✅ Delete subfolders inside assigned folders
- ✅ **Automatic access to ALL subfolders** (inheritance)

**Restrictions**:
- ❌ Cannot access folders they don't manage
- ❌ Cannot create root-level folders in department
- ❌ Cannot assign other Folder Managers or Folder Users
- ❌ Cannot access department level
- ❌ Cannot access personal folders

**Example Scenario:**
```
Rahul (Folder Manager assigned to "Campaign 2025" folder):
✅ Can upload files to "Campaign 2025"
✅ Can create "Design Assets" subfolder inside "Campaign 2025"
✅ Can delete any file in "Campaign 2025"
✅ Can delete "Design Assets" subfolder
✅ Automatically has access to all subfolders under "Campaign 2025"
❌ Cannot access "Social Media" folder (not assigned)
❌ Cannot create new root folder in Marketing department
❌ Cannot assign other users to folders
```

**Important - Automatic Subfolder Inheritance:**
```
Folder Manager assigned to: "Campaign 2025"
  │
  ├── Design Assets (✅ automatic access)
  │     ├── Logos (✅ automatic access)
  │     └── Banners (✅ automatic access)
  │
  └── Budget Files (✅ automatic access)

Folder Manager gets access to entire folder tree below assignment point!
```

**Access Validation:**
```javascript
// For Folder Manager accessing folder
if (user.role === 'FOLDER_MANAGER') {
  // Check direct assignment
  const hasDirectAccess = await FolderAccess.findOne({
    userId: user.id,
    folderId: folderId,
    accessSource: 'ASSIGNED_RBAC',
    isActive: true
  });
  
  if (hasDirectAccess) return ALLOW;
  
  // Check parent folder access (inheritance)
  const folder = await getFolder(folderId);
  if (folder.parentId) {
    return checkFolderManagerAccess(user, folder.parentId); // Recursive
  }
  
  return DENY;
}
```

---

### 🔵 Role 5: FOLDER_USER
**Who**: Team member who needs basic read and upload access

**Powers**:
- ✅ View folders they have access to
- ✅ View files in accessible folders
- ✅ Upload new files (basic contribution)
- ✅ **Automatic access to ALL subfolders** (inheritance)

**Restrictions**:
- ❌ Cannot delete any files or folders
- ❌ Cannot create new folders or subfolders
- ❌ Cannot manage or assign other users
- ❌ Cannot access folders not assigned to them
- ❌ Very limited access - read and upload only

**Example Scenario:**
```
Anjali (Folder User assigned to "Campaign 2025" folder):
✅ Can view files in "Campaign 2025"
✅ Can upload her work files to "Campaign 2025"
✅ Can view all subfolders under "Campaign 2025"
✅ Can upload to subfolders
❌ Cannot delete anything
❌ Cannot create subfolders
❌ Cannot give access to others
❌ Cannot access "Social Media" folder (not assigned)
```

**Automatic Subfolder Inheritance:**
```
Folder User assigned to: "Campaign 2025"
  │
  ├── Design Assets (✅ can view + upload)
  │     ├── Logos (✅ can view + upload)
  │     └── Banners (✅ can view + upload)
  │
  └── Budget Files (✅ can view + upload)

Folder User can contribute to entire folder tree!
```

**Access Validation:**
```javascript
// For Folder User accessing folder
if (user.role === 'FOLDER_USER') {
  // Check direct assignment or parent inheritance
  const hasAccess = await checkFolderAccess(user.id, folderId);
  
  if (hasAccess) {
    // Only allow VIEW and UPLOAD actions
    if (action === 'VIEW' || action === 'UPLOAD') {
      return ALLOW;
    }
    return DENY; // Cannot DELETE or CREATE_FOLDER
  }
  
  return DENY;
}
```

---

## 🎯 Role Permissions Matrix

| Role | Scope | View | Upload | Delete | Create Folder | Manage Users | Access Personal |
|------|-------|------|--------|--------|---------------|--------------|-----------------|
| **SUPER_ADMIN** | All Org Folders | ✅ | ✅ | ✅ | ✅ Root Level | ✅ All Roles | ❌ |
| **ADMIN** | Assigned Depts | ✅ | ✅ | ✅ | ✅ Root Level | ✅ FM/FU Only | ❌ |
| **DEPT_HEAD** | Own Dept | ✅ | ✅ | ✅ | ✅ Root Level | ✅ FM/FU Only | ❌ |
| **FOLDER_MANAGER** | Assigned Folders | ✅ | ✅ | ✅ | ✅ Subfolders | ❌ | ❌ |
| **FOLDER_USER** | Assigned Folders | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
