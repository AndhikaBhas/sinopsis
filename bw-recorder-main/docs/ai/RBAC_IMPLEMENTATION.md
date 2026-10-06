# Dynamic Role-Based Access Control (RBAC) Implementation Guide

## Overview

This document describes the comprehensive RBAC system implemented in Sinopsis-Recorder, featuring dynamic, database-driven permissions with rules engine support.

## Architecture Components

### 1. **Database Models**

#### **User**
- Core user information
- Many-to-many relationships with both Roles and Permissions
- Can have direct permissions (overriding role permissions)

#### **Role**
- Named groups of permissions (e.g., "admin", "moderator")
- Can inherit from parent roles (role hierarchy)
- Many-to-many with Permissions
- Many-to-many with Users

#### **Permission**
- Granular access rights (e.g., "meeting.create", "user.manage")
- Structured as `resource.action` (e.g., "meeting.delete")
- Can have multiple Rules attached
- Many-to-many with both Roles and Users

#### **Rule**
- Conditional logic for permissions
- JSON-based conditions (ownership, time-based, status-based, etc.)
- Priority-based evaluation
- Effect: "allow" or "deny"

### 2. **Junction Tables**

- **UserRole**: Links users to roles with optional expiration
- **UserPermission**: Direct permission grants to users
- **RolePermission**: Links permissions to roles
- **RoleHierarchy**: Defines parent-child role relationships

## Key Features

### ✅ **Dynamic Permission Management**
All permissions, roles, and rules are stored in the database and can be modified at runtime without code changes.

### ✅ **Role Hierarchy**
Roles can inherit permissions from parent roles. Example:
- `super_admin` → inherits from → `admin` → inherits from → `user`

### ✅ **Direct User Permissions**
Users can be granted individual permissions that override or extend their role permissions.

### ✅ **Rule Engine**
Permissions can have conditional rules:
```json
{
  "field": "resourceOwnerId",
  "operator": "equals",
  "value": "${userId}"
}
```

### ✅ **Permission Expiration**
User roles and permissions can have expiration dates for temporary access.

## Usage Examples

### **1. Check Permission in Loader**

```typescript
import { getCurrentUser } from "~/lib/auth.server";
import { requirePermission } from "~/lib/rbac.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const user = await getCurrentUser(request);
  
  if (!user) {
    return redirect("/login");
  }
  
  // Simple permission check
  await requirePermission(user, "meeting.view.all");
  
  // Permission check with rule context (e.g., ownership)
  const meeting = await getMeeting(params.id);
  await requirePermission(user, "meeting.edit.own", {
    userId: user.id,
    resourceOwnerId: meeting.createdBy,
  });
  
  return { meeting };
}
```

### **2. Check Permission in Action**

```typescript
export async function action({ request }: ActionFunctionArgs) {
  const user = await getCurrentUser(request);
  
  await requirePermission(user, "meeting.delete.all");
  
  // Proceed with deletion
}
```

### **3. Conditional UI in Components**

```tsx
import { useLoaderData } from "react-router";
import { hasPermission } from "~/lib/rbac.server";

export default function MeetingDetail() {
  const { meeting, user, permissions } = useLoaderData<typeof loader>();
  
  return (
    <div>
      <h1>{meeting.title}</h1>
      
      {permissions.includes("meeting.edit.all") && (
        <Button>Edit Meeting</Button>
      )}
      
      {permissions.includes("meeting.delete.all") && (
        <Button variant="destructive">Delete</Button>
      )}
    </div>
  );
}

// In the loader:
export async function loader({ request, params }: LoaderFunctionArgs) {
  const user = await getCurrentUser(request);
  const permissions = await getUserPermissions(user.id);
  
  return { meeting, user, permissions };
}
```

### **4. Create Custom Rules**

```typescript
import { createRule, createOwnershipRule } from "~/models/rule.server";

// Example: Only owners can edit their meetings
const editOwnPermission = await getPermissionByName("meeting.edit.own");

await createRule({
  permissionId: editOwnPermission.id,
  name: "Owner Only",
  description: "User can only edit meetings they created",
  conditions: {
    field: "resourceOwnerId",
    operator: "equals",
    value: "${userId}",
  },
  effect: "allow",
  priority: 100,
  isActive: true,
});

// Complex rule with AND/OR logic
await createRule({
  permissionId: somePermission.id,
  name: "Complex Access Rule",
  conditions: {
    AND: [
      { field: "userDepartment", operator: "equals", value: "Engineering" },
      {
        OR: [
          { field: "resourceStatus", operator: "equals", value: "draft" },
          { field: "resourceOwnerId", operator: "equals", value: "${userId}" },
        ],
      },
    ],
  },
  effect: "allow",
  priority: 80,
});
```

## Setup Instructions

### **1. Update Database Schema**

```bash
npx prisma migrate dev --name add_rbac_system
```

### **2. Seed Initial Data**

```bash
npx tsx prisma/seed-rbac.ts
```

This will create:
- 4 default roles (super_admin, admin, moderator, user)
- 18 permissions covering meetings, users, roles, and settings
- Example ownership rules for edit/delete permissions
- Assign "user" role to all existing users

### **3. Assign Admin Role**

After seeding, manually assign super_admin to your account:

```sql
-- Get your user ID
SELECT id FROM users WHERE email = 'your@email.com';

-- Get super_admin role ID
SELECT id FROM roles WHERE name = 'super_admin';

-- Assign role
INSERT INTO user_roles (user_id, role_id, granted_at)
VALUES (YOUR_USER_ID, SUPER_ADMIN_ROLE_ID, NOW());
```

Or use Prisma Studio:
```bash
npx prisma studio
```

### **4. Access Admin Routes**

Navigate to:
- `/admin/users` - Manage users and assign roles
- `/admin/roles` - Manage roles and permissions

## Permission Naming Convention

Use the format: `{resource}.{action}[.scope]`

Examples:
- `meeting.create` - Create meetings
- `meeting.view.own` - View own meetings
- `meeting.view.all` - View all meetings
- `meeting.edit.own` - Edit own meetings
- `meeting.edit.all` - Edit any meeting
- `user.manage` - Manage users
- `settings.manage` - Manage system settings

## Rule Operators

Supported operators in rule conditions:
- `equals` / `==` - Exact match
- `notEquals` / `!=` - Not equal
- `in` - Value in array
- `notIn` - Value not in array
- `greaterThan` / `>` - Greater than
- `greaterThanOrEqual` / `>=` - Greater than or equal
- `lessThan` / `<` - Less than
- `lessThanOrEqual` / `<=` - Less than or equal
- `contains` - String contains
- `startsWith` - String starts with
- `endsWith` - String ends with

Logical operators:
- `AND` - All conditions must be true
- `OR` - At least one condition must be true
- `NOT` - Negate condition

## Best Practices

1. **Principle of Least Privilege**: Grant minimum necessary permissions
2. **Use Roles**: Prefer role-based permissions over direct user permissions
3. **Document Permissions**: Keep permission descriptions clear
4. **Test Rules**: Always test rule conditions with various scenarios
5. **Audit Access**: Log permission checks for security auditing
6. **Cache Permissions**: Consider caching user permissions for performance

## Migration from Old System

If you had a simple `role` string field:

```typescript
// Old way
if (user.role === 'admin') { ... }

// New way
import { hasPermission } from "~/lib/rbac.server";

if (await hasPermission(user.id, 'settings.manage')) { ... }
```

## Troubleshooting

### User has no permissions
Check:
1. User has at least one role assigned
2. Role has permissions attached
3. Permissions are active (`isActive: true`)
4. Role is active

### Rules not working
Check:
1. Rule conditions match the context you're passing
2. Rule is active
3. Rule priority (higher priority rules evaluate first)
4. Field names in conditions match context object

### Performance issues
Consider:
1. Cache user permissions in session
2. Index database properly
3. Limit role hierarchy depth
4. Use background jobs for permission audits

## API Reference

See the following files:
- `app/lib/rbac.server.ts` - Core RBAC logic
- `app/models/role.server.ts` - Role management
- `app/models/permission.server.ts` - Permission management
- `app/models/rule.server.ts` - Rule management

## Security Considerations

1. **Always validate on server**: Never trust client-side permission checks
2. **Use requirePermission()**: Throws 403 if unauthorized
3. **Context validation**: Ensure rule contexts are sanitized
4. **Audit logs**: Log permission grants/revokes
5. **Regular reviews**: Periodically audit role assignments
