
# DMS Permission System - Implementation Documentation

## 📋 Overview

This document describes the **dual-layer permission system** implemented in the Document Management System (DMS). This system controls user access through two independent but complementary layers: **Role-Based Access Control (RBAC)** and **Visibility-Based Access Control**.

**Last Updated:** November 2024  
**Version:** 1.0

---

## 🎯 What This System Does

The permission system answers two critical questions for every access request:

1. **"Can this user be in this part of the system?"** → Answered by **Roles**
2. **"Can this user access this specific item?"** → Answered by **Visibility**

Both questions must be answered "yes" for access to be granted.

---

## 🏗️ System Architecture

### Two-Layer Security Model

```
┌─────────────────────────────────────────────────┐
│            USER ATTEMPTS ACCESS                 │
└─────────────────┬───────────────────────────────┘
                  │
         ┌────────▼────────┐
         │  LAYER 1: ROLE  │
         │  (System Level) │
         │                 │
         │  "Can you be    │
         │   here?"        │
         └────────┬────────┘
                  │
            ✓ YES / ✗ NO
                  │
         ┌────────▼────────────┐
         │  LAYER 2: VISIBILITY │
         │    (Item Level)      │
         │                      │
         │  "Can you see/use    │
         │   this item?"        │
         └────────┬─────────────┘
                  │
         ✓ YES / ✗ NO
                  │
         ┌────────▼────────┐
         │  ACCESS GRANTED  │
         └──────────────────┘
```

---

## 🔐 Layer 1: Role-Based Access Control

### Purpose
Controls **navigation rights** and **system-level operations**. Think of it as your building access card.

### The 5 System Roles

| Role | Description | What They Can Do | What They Cannot Do |
|------|-------------|------------------|---------------------|
| **Super Admin** | Ultimate system authority | • Access all departments<br>• Manage all users<br>• View audit logs<br>• System configuration | Nothing - full access |
| **Admin** | Department manager | • Manage assigned departments<br>• Add/remove users<br>• Configure department settings | • Access other departments<br>• Change system settings |
| **Department Owner** | Resource owner | • Full control of department folders<br>• Share resources<br>• Manage folder structure | • Access other departments<br>• Manage users |
| **Member Bank User** | Bank-specific access | • Access assigned bank folders<br>• View bank documents | • Access other banks<br>• Access department resources |
| **General User** | Standard user | • Access shared items<br>• Upload to permitted folders | • Create departments<br>• Manage users |

### Key Points
- Users can have **multiple roles** (e.g., Admin for Finance + General User for HR)
- Roles can be **department-specific** or **system-wide**
- Roles are **assigned by Super Admins or Admins**
- ⚠️ **Important:** Having a role does NOT automatically grant access to files/folders

---

## 👁️ Layer 2: Visibility-Based Access Control

### Purpose
Controls **item-level access** and **specific actions** users can perform. Think of it as individual room locks.

### The 3 Visibility Types

#### 1. 🌐 Public
- **Who can access:** Anyone in the system
- **Best for:** Company policies, announcements, shared resources
- **Example:** "Company Handbook 2024.pdf"

#### 2. 🔒 Private
- **Who can access:** Only the creator (unless explicitly shared)
- **Best for:** Personal documents, drafts, sensitive files
- **Example:** "My_Performance_Review_Draft.docx"

#### 3. 🔐 Restricted
- **Who can access:** Only users/roles explicitly granted access
- **Best for:** Team projects, department folders, collaborative work
- **Example:** "Q4_Marketing_Campaign" folder

---

## 🎛️ The 5 Granular Permissions

When an item is **Restricted**, you control access with these 5 permissions:

| Permission | Icon | What It Allows | Real Examples |
|------------|------|----------------|---------------|
| **View** | 👁️ | See and open the item | • Preview document<br>• Browse folder contents<br>• Read file details |
| **Upload** | ⬆️ | Add new content | • Create subfolders<br>• Upload files<br>• Add documents to folder |
| **Download** | ⬇️ | Save to local device | • Download PDF<br>• Export file<br>• Save copy locally |
| **Delete** | 🗑️ | Remove items | • Delete files<br>• Remove subfolders<br>• Clear outdated content |
| **Change Visibility** | 🔗 | Modify sharing | • Add new users<br>• Change permissions<br>• Make public/private |

### Common Permission Combinations

| User Type | Permissions | Use Case |
|-----------|-------------|----------|
| **Viewer** | View + Download | Read-only access (like Google Drive Viewer) |
| **Contributor** | View + Upload + Download | Can add content but not delete |
| **Editor** | All 5 permissions | Full control (like Google Drive Editor) |
| **Reviewer** | View only | Preview without downloading |
| **Custom** | Any combination | Tailored for specific needs |

---

## 🌳 Inheritance System

### What is Inheritance?

**Inheritance** means child items (subfolders and files) automatically get the same permissions as their parent folder.

### Simple Example

```
📁 Marketing Department (Restricted - Alice: Editor permissions)
  ├── 📁 2024 Campaigns (no custom settings)
  │     ├── 📄 Q1_Report.pdf (no custom settings)
  │     └── 📄 Q2_Report.pdf (no custom settings)
  └── 📄 Annual_Budget.xlsx (no custom settings)
```

**Result:** Alice has Editor permissions on EVERYTHING because all items inherit from the parent "Marketing Department" folder.

---

### Breaking Inheritance

Any child can **set its own visibility** to override the parent.

```
📁 Marketing Department (Restricted - Alice: Editor)
  ├── 📁 2024 Campaigns (Private - Only Bob)
  │     └── 📄 Secret_Launch.pdf
  └── 📄 Annual_Budget.xlsx (inherits from parent)
```

**Result:**
- ✅ Alice: Can access "Marketing Department" and "Annual_Budget.xlsx"
- ❌ Alice: **CANNOT** see "2024 Campaigns" or "Secret_Launch.pdf"
- ✅ Bob: Can access "2024 Campaigns" and "Secret_Launch.pdf"

---

### The 5 Inheritance Rules

| # | Rule | What It Means | Example |
|---|------|---------------|---------|
| **1** | **Inherit by Default** | Children automatically get parent's permissions | Folder shared → all files inside are shared |
| **2** | **Explicit Override** | Setting child visibility breaks inheritance | Private file in shared folder stays private |
| **3** | **No Merging** | Child permissions REPLACE parent (not combine) | If child is Public, parent's Restricted doesn't matter |
| **4** | **Private Wins** | Private items stay hidden even in shared folders | Your draft in team folder stays yours |
| **5** | **Role Can't Override** | Even admins can't bypass visibility | Department Owner can't see your private files |

---

## 🔄 How Access Checks Work

### The Complete Flow

Every time a user tries to access something, the system performs these checks:

#### Step 1: Role Check (System Level)
```
Question: "Does the user's role allow them in this area?"

Check:
- Is user a Department Owner of this department?
- Is user an Admin with access?
- Is user a Member Bank User for this bank?

If NO → ❌ DENY ACCESS (stop here)
If YES → ✅ Continue to Step 2
```

#### Step 2: Visibility Check (Item Level)
```
Question: "Does visibility allow this user to see this item?"

Check:
- Is item Public? → Allow everyone
- Is item Private? → Only creator (unless shared)
- Is item Restricted? → Check permission_grants table

If NO permissions found → ❌ DENY ACCESS
If permissions found → ✅ Continue to Step 3
```

#### Step 3: Action Check
```
Question: "Can user perform this specific action?"

Check:
- Trying to view? → Check can_view permission
- Trying to download? → Check can_download permission
- Trying to delete? → Check can_delete permission
- Trying to share? → Check can_change_visibility permission

If specific permission is FALSE → ❌ DENY ACTION
If specific permission is TRUE → ✅ GRANT ACCESS
```

---

## 📊 Real-World Scenarios

### Scenario 1: Department Owner vs Private File

**Setup:**
- User: John (Department Owner of Finance)
- Item: Private file "salary_negotiations.xlsx" in Finance folder
- Creator: Sarah

**Result:** ❌ John **CANNOT** access the file

**Why?**
- ✅ Layer 1: John's role allows him in Finance department
- ❌ Layer 2: File is Private (only Sarah can access)
- **Both layers must pass** → Access denied

---

### Scenario 2: Shared Folder, Private File Inside

**Setup:**
- Folder: "Team Projects" (Restricted - Shared with Alice, Bob, Carol)
- File inside: "draft_proposal.docx" (Private - only Bob)

**Result:**
- ✅ Alice: Can see folder, **CANNOT** see draft_proposal.docx
- ✅ Bob: Can see folder **AND** draft_proposal.docx
- ✅ Carol: Can see folder, **CANNOT** see draft_proposal.docx

**Why?** Private visibility breaks inheritance. The file doesn't inherit the folder's sharing.

---

### Scenario 3: Public Child in Restricted Parent

**Setup:**
- Parent: "HR Department" (Restricted - only HR team)
- Child: "Company Holidays 2024.pdf" (Public)

**Result:** Everyone in the system can access "Company Holidays 2024.pdf"

**Why?** Child's Public visibility replaces parent's Restricted setting. No merging occurs.

---

### Scenario 4: Inheritance Chain

**Setup:**
```
📁 Engineering (Restricted - Dev Team: Editor)
  └── 📁 Projects (inherits)
       └── 📁 Project_Alpha (inherits)
            └── 📄 source_code.zip (inherits)
```

**Result:** All Dev Team members have Editor permissions on everything

**Why?** No child breaks inheritance, so all items inherit from "Engineering" folder.

---

### Scenario 5: Mid-Level Break

**Setup:**
```
📁 Engineering (Restricted - Dev Team: Editor)
  └── 📁 Projects (Private - Only Lead Developer)
       └── 📁 Project_Alpha (inherits from Projects)
            └── 📄 source_code.zip (inherits from Projects)
```

**Result:**
- Dev Team: Can only access "Engineering" folder
- Lead Developer: Can access everything

**Why?** "Projects" folder breaks inheritance and becomes Private. Everything below it inherits from "Projects" (Private), not from "Engineering".

---

## 🗄️ Database Structure

### Core Tables Overview

The system uses **5 main tables** to manage permissions:

#### 1. **roles**
Stores the 5 system roles (Super Admin, Admin, Department Owner, Member Bank User, General User)

#### 2. **user_roles**
Maps which users have which roles in which departments

#### 3. **folder_permissions**
Stores visibility settings for each folder (Public/Private/Restricted + inheritance flag)

#### 4. **file_permissions**
Stores visibility settings for each file (Public/Private/Restricted + inheritance flag)

#### 5. **permission_grants**
Stores granular permissions (the 5 permission flags) for users/roles on specific items

### How Tables Work Together

```
User tries to access Folder X:

1. Check user_roles → What role does user have?
2. Check folder_permissions → What's the folder's visibility?
3. If Restricted → Check permission_grants → What permissions does user have?
4. If inheriting → Walk up tree until permissions found
5. Grant/deny based on results
```

---

## 🎨 User Interface Elements

### Permission Indicators (Icons)

| Icon | Meaning | Shows When |
|------|---------|------------|
| 🌐 | Public | Anyone can access |
| 🔗 | Shared (Restricted) | Shared with specific people |
| 🔒 | Private | Only you can access |
| 👥 | Team Access | Shared with role/group |
| ⬆️ | Inherited | Using parent's permissions |

### Share Dialog (Google Drive Style)

When you click "Share" on a folder/file, users see:

```
┌─────────────────────────────────────────┐
│  Share "Q4 Report"                      │
├─────────────────────────────────────────┤
│  Visibility: [Restricted ▼]             │
│                                         │
│  Add people, roles, or banks:           │
│  [Search.....................] [Add]    │
│                                         │
│  Who has access:                        │
│  ─────────────────────────────────────  │
│  👤 Alice Johnson (You)                 │
│     Owner • Can do everything           │
│                                         │
│  👤 Bob Smith                           │
│     [Editor ▼] [Remove]                │
│                                         │
│  👥 Marketing Team (Role)               │
│     [Viewer ▼] [Remove]                │
│                                         │
│  ☐ Inherit from parent folder           │
│                                         │
│  [Cancel]  [Save Changes]              │
└─────────────────────────────────────────┘
```

### Conditional UI Elements

The interface adapts based on user permissions:

| If user has... | They see... |
|----------------|-------------|
| **View only** | Open, Preview buttons |
| **View + Download** | Open, Preview, Download buttons |
| **View + Upload** | Open, Preview, Upload button |
| **View + Delete** | Open, Preview, Delete button |
| **Change Visibility** | Share button appears |
| **No permissions** | Item is completely hidden |

---

## 🔧 API Endpoints Reference

### Permission Management

| Action | Endpoint | Method | Purpose |
|--------|----------|--------|---------|
| Share item | `/api/folders/:id/permissions` | POST | Add user/role with permissions |
| Update permissions | `/api/folders/:id/permissions/:grantId` | PATCH | Modify existing permissions |
| Remove access | `/api/folders/:id/permissions/:grantId` | DELETE | Revoke permissions |
| List access | `/api/folders/:id/permissions` | GET | See who has access |
| Change visibility | `/api/folders/:id/visibility` | PATCH | Public/Private/Restricted |
| Break inheritance | `/api/folders/:id/break-inheritance` | POST | Stop inheriting from parent |

*(Same endpoints exist for `/files/:id/...`)*

### Access Check

| Action | Endpoint | Method | Purpose |
|--------|----------|--------|---------|
| Check access | `/api/check-access` | POST | Validate user can access item |
| Get my permissions | `/api/folders/:id/my-permissions` | GET | See what you can do |

---

## ⚠️ Critical Rules to Remember

### Do's ✅

1. **Always check both layers** before granting access
2. **Respect private visibility** - even admins can't override
3. **Allow inheritance by default** for easier management
4. **Check specific permissions** for each action (view, download, delete, etc.)
5. **Walk up the folder tree** when resolving inherited permissions

### Don'ts ❌

1. **Don't merge permissions** - child replaces parent completely
2. **Don't assume role grants access** - always check visibility
3. **Don't ignore inheritance flags** - they determine which permissions apply
4. **Don't allow private bypass** - private must stay private
5. **Don't cache permissions forever** - they can change frequently

---

## 🧪 Testing Checklist

Before deploying, verify these scenarios work correctly:

- [ ] Super Admin can access all departments
- [ ] General User cannot see private files in shared folders
- [ ] Child with Public visibility is accessible even if parent is Restricted
- [ ] Breaking inheritance makes child independent from parent
- [ ] User with "View only" cannot download files
- [ ] Department Owner cannot access private files in their department
- [ ] Deleting a folder removes all permission grants
- [ ] User can have multiple roles across different departments
- [ ] Permission changes take effect immediately
- [ ] Inherited permissions resolve correctly through multiple folder levels

---

## 📈 Performance Considerations

### Optimization Tips

1. **Index heavily used columns**
   - `permission_grants(user_id, resource_type, resource_id)`
   - `folder_permissions(folder_id)`
   - `user_roles(user_id)`

2. **Cache user roles** - roles don't change frequently

3. **Eager load permissions** when fetching folders to avoid N+1 queries

4. **Limit inheritance depth** - walking too many levels is slow

5. **Use database views** for common permission queries

---

## 🚀 Migration Guide

### For Existing Systems

If you're adding this to an existing DMS:

1. **Phase 1:** Create new tables (don't touch existing data yet)
2. **Phase 2:** Set all existing folders/files to "Private" by default
3. **Phase 3:** Give creators full permissions on their items
4. **Phase 4:** Assign all users "General User" role initially
5. **Phase 5:** Manually assign proper roles (Admin, Department Owner, etc.)
6. **Phase 6:** Update folder/file visibility as needed
7. **Phase 7:** Enable permission checks in API endpoints
8. **Phase 8:** Deploy frontend UI updates

---

## 🆘 Troubleshooting

### Common Issues

| Problem | Likely Cause | Solution |
|---------|--------------|----------|
| User can't access shared folder | Role doesn't allow department access | Assign proper role first |
| Private file shows in shared folder | UI not filtering by visibility | Check frontend filtering logic |
| Permissions not inheriting | `inherits_from_parent` flag is false | Set flag to true or set explicit permissions |
| Admin can't access file | File is private | Private overrides role - add admin explicitly |
| Slow permission checks | Missing database indexes | Add indexes on foreign keys |

---

## 📚 Glossary

| Term | Definition |
|------|------------|
| **Role** | System-level access tier (what areas you can enter) |
| **Visibility** | Item-level access setting (who can see specific items) |
| **Permission** | Specific action you can perform (view, download, delete, etc.) |
| **Grant** | A record giving someone permissions on an item |
| **Inheritance** | Child items automatically getting parent's permissions |
| **Override** | Setting child visibility to break inheritance |
| **Layer 1** | Role-based access control (system level) |
| **Layer 2** | Visibility-based access control (item level) |

---

## 📞 Support & Resources

### For Developers
- Database schema diagrams: `/docs/database-schema.png`
- API documentation: `/docs/api-reference.md`
- Permission flow diagrams: `/docs/permission-flows.pdf`

### For End Users
- User guide: `/docs/user-guide.md`
- Sharing tutorial: `/docs/how-to-share.md`
- FAQ: `/docs/faq.md`

---

## 📝 Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Nov 2024 | Initial implementation of dual-layer permission system |

---

## 🎯 Quick Reference Card

```
┌────────────────────────────────────────────────────┐
│  DMS PERMISSION SYSTEM - QUICK REFERENCE           │
├────────────────────────────────────────────────────┤
│                                                    │
│  ACCESS GRANTED WHEN:                              │
│    ✅ Role allows system area                      │
│    AND                                             │
│    ✅ Visibility allows item access                │
│                                                    │
│  VISIBILITY TYPES:                                 │
│    🌐 Public    - Everyone                         │
│    🔒 Private   - Creator only                     │
│    🔐 Restricted - Specific users                  │
│                                                    │
│  5 PERMISSIONS:                                    │
│    👁️  View  ⬆️ Upload  ⬇️ Download               │
│    🗑️  Delete  🔗 Change Visibility                │
│                                                    │
│  INHERITANCE:                                      │
│    • Children inherit parent by default            │
│    • Setting child visibility breaks inheritance   │
│    • No merging - child replaces parent            │
│    • Private always stays private                  │
│                                                    │
└────────────────────────────────────────────────────┘
```

---

**End of Documentation**

*For questions or clarifications, please contact the development team.*