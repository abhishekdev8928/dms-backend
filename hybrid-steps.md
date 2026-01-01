# 🏢 DMS Hybrid System — **Clarified & Simplified Design**

> **This version removes confusion between permissions and roles and reflects the final, correct mental model we discussed.**

---

## 🎯 System Overview

We are building a **Hybrid Document Management System (DMS)** with **clear separation** between:

1. **Personal Drive (My Drive)** – Permission-based, user-owned
2. **Organization Drive** – Role-based (RBAC), department-controlled
3. **Shared with Me** – Read-only entry point for shared personal folders

### ✅ Non-Negotiable Design Rules

* Personal folders use **permissions** (OWNER / CO_OWNER / EDITOR / VIEWER)
* Organization folders use **roles** (Folder Manager / Folder User)
* ❌ Permissions are **never used** in Organization Drive
* ❌ Roles are **never used** in Personal Drive
* Super Admin **cannot access personal folders**

> **Golden Rule:**
> **Personal Drive = Permissions**
> **Organization Drive = Roles**

---

## 🧩 Core Concepts (Clean Mental Model)

### Concept 1: Folder Types (Strict)

Every folder is **exactly one type**:

### 🔐 PERSONAL Folder

* Lives in **My Drive**
* Creator is **OWNER**
* Uses permissions: OWNER / CO_OWNER / EDITOR / VIEWER
* Can be shared
* Never visible to admins unless shared

👉 *Example:* Resume, side projects, private docs

---

### 🏢 ORGANIZATION Folder

* Lives in **Organization Drive**
* Always linked to a **department**
* Uses **RBAC only**
* Cannot be shared
* Managed via roles, not permissions

👉 *Example:* Marketing → Campaign 2025

---

## 🧠 Critical Clarification: Permissions vs Roles

### ❌ What We Do NOT Do

* No OWNER / EDITOR / VIEWER in Organization Drive
* No sharing of Organization folders
* No permission checks for Org folders

### ✅ What We DO

* **Folder Manager = full control inside folder**
* **Folder User = view + upload only**

---

## 🧑‍💼 Folder Manager — Final Rules (VERY IMPORTANT)

### How does someone become Folder Manager?

There are **only TWO valid ways**:

### ✅ Way 1: Creator Auto-Assignment

> **Whoever creates an ORGANIZATION folder automatically becomes its Folder Manager**

```
Marketing
 └── Campaign 2025  ← created by Rahul
```

➡ Rahul is **Folder Manager by default**

No manual assignment required.

---

### ✅ Way 2: Assigned by Top-Level Role

The following roles can assign Folder Managers:

* SUPER_ADMIN
* ADMIN (within assigned departments)
* DEPT_HEAD (within own department)

```
Admin → assigns Rahul as Folder Manager → Campaign 2025
```

---

### ❌ Who CANNOT assign Folder Managers

* Folder Manager ❌
* Folder User ❌

---

## 🌳 Folder Inheritance (Organization Drive)

> **Access always flows downward**

```
Campaign 2025  (Folder Manager)
 ├── Designs
 │    └── Logos
 └── Budget
```

Folder Manager of `Campaign 2025`:

* Automatically manages **all subfolders**
* No extra entries needed

---

## 👥 RBAC Roles — Simplified & Correct

### 🔴 SUPER_ADMIN

* Full access to **all organization folders**
* Assigns Admins & Dept Heads
* ❌ No personal folder access

---

### 🟠 ADMIN

* Manages **multiple departments**
* Creates org folders
* Assigns Folder Managers & Users

---

### 🟡 DEPT_HEAD

* Manages **one department**
* Same powers as Admin but limited scope

---

### 🟢 FOLDER_MANAGER

* Full control **inside assigned folder**
* Create/delete subfolders
* Upload/delete files
* Inherits access to all children

> Folder Manager **acts like Owner**, but only for Organization folders

---

### 🔵 FOLDER_USER

* View + Upload only
* Cannot delete or create folders
* Inherits access to subfolders

---

## 🔐 Access Control Logic (Final)

### PERSONAL Folder Access

1. If creator → OWNER
2. Else → check FolderAccess (SHARED)
3. If no record → DENY

---

### ORGANIZATION Folder Access

1. If SUPER_ADMIN → ALLOW
2. If ADMIN / DEPT_HEAD → check department
3. If FOLDER_MANAGER / FOLDER_USER → check assignment + inheritance
4. ❌ No permission checks

---

## 💾 Database Design — Cleaned Up

### folders

* id
* name
* type: PERSONAL | ORGANIZATION
* departmentId (org only)
* parentId
* createdBy

---

### folderAccess (Unified but Context-Aware)

| Folder Type  | Stored Value                       |
| ------------ | ---------------------------------- |
| Personal     | OWNER / CO_OWNER / EDITOR / VIEWER |
| Organization | FOLDER_MANAGER / FOLDER_USER       |

* One record per user per folder
* Inheritance resolved at runtime

---

### folderShare (Personal Only)

* Used only for PERSONAL folders
* Drives FolderAccess creation

---

## 🧠 Final One-Line Truth

> **Folder Manager is the “Owner equivalent” for Organization Drive, assigned either automatically on creation or explicitly by Admin / Dept Head — permissions do not exist there.**

---

✅ This version removes ambiguity
✅ Matches enterprise RBAC patterns
✅ Easy to explain to boss & dev team

---

**You can now safely delete or ignore OWNER / EDITOR logic from Organization Drive code.**
