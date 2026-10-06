# RBAC System - Quick Start Guide

## What Was Implemented

✅ **Dynamic RBAC system** with 4 main components:
- **User** - Can have multiple roles and direct permissions
- **Role** - Named permission groups with hierarchy support
- **Permission** - Granular access rights (e.g., "meeting.create")
- **Rule** - Conditional logic for permissions (ownership, time-based, etc.)

## File Structure

```
app/
├── lib/
│   ├── auth.server.ts           # Updated with RBAC support
│   └── rbac.server.ts            # Core RBAC logic NEW
├── models/
│   ├── role.server.ts            # Role CRUD operations NEW
│   ├── permission.server.ts      # Permission CRUD operations NEW
│   └── rule.server.ts            # Rule engine NEW
├── routes/
│   └── admin/
│       ├── users.tsx             # User management UI NEW
│       └── roles.tsx             # Role management UI NEW
└── components/ui/
    ├── badge.tsx                 # NEW
    └── table.tsx                 # NEW

prisma/
├── schema.prisma                 # Updated with RBAC models
└── seed-rbac.ts                  # Seed script NEW

docs/
└── RBAC_IMPLEMENTATION.md        # Full documentation NEW
```

## Quick Setup

### 1. Run Migration
```powershell
npx prisma migrate dev --name add_rbac_system
```

### 2. Seed Initial Data
```powershell
npx tsx prisma/seed-rbac.ts
```

### 3. Make Yourself Super Admin

Option A - Using Prisma Studio:
```powershell
npx prisma studio
```
Then:
1. Go to `user_roles` table
2. Create new record:
   - `userId`: Your user ID
   - `roleId`: 1 (super_admin)
   - `grantedAt`: now

Option B - Using SQL:
```sql
INSERT INTO user_roles (user_id, role_id, granted_at)
VALUES (
  (SELECT id FROM users WHERE email = 'your@email.com'),
  (SELECT id FROM roles WHERE name = 'super_admin'),
  NOW()
);
```

## Usage Examples

### Protect a Route
```typescript
import { getCurrentUser } from "~/lib/auth.server";
import { requirePermission } from "~/lib/rbac.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getCurrentUser(request);
  await requirePermission(user, "meeting.view.all");
  
  return { data: "..." };
}
```

### Check Ownership Rule
```typescript
// Only allow editing own meetings
await requirePermission(user, "meeting.edit.own", {
  userId: user.id,
  resourceOwnerId: meeting.createdBy
});
```

### Conditional UI
```tsx
{permissions.includes("meeting.delete.all") && (
  <Button variant="destructive">Delete</Button>
)}
```

## Default Roles

| Role | Permissions |
|------|------------|
| **super_admin** | All permissions |
| **admin** | Manage meetings, users (not roles), analytics |
| **moderator** | View/edit all meetings, view users |
| **user** | Create/edit/delete own meetings only |

## Default Permissions

**Meeting**: create, view.own, view.all, edit.own, edit.all, delete.own, delete.all  
**User**: view, create, edit, delete, approve  
**Role**: view, manage  
**Permission**: view, manage  
**System**: settings.manage, analytics.view

## Admin Routes

- `/admin/users` - Manage users, assign roles
- `/admin/roles` - Manage roles and permissions

## API Functions

```typescript
// Check permission
await hasPermission(userId, "meeting.create")

// Require permission (throws 403 if not allowed)
await requirePermission(user, "meeting.delete.all")

// Get all user permissions
const permissions = await getUserPermissions(userId)

// Get user roles
const roles = await getUserRoles(userId)
```

## Next Steps

1. ✅ Run migration and seed
2. ✅ Assign yourself super_admin role
3. ✅ Visit `/admin/users` to test UI
4. ✅ Create custom roles and permissions
5. ✅ Add RBAC checks to your existing routes
6. ✅ Create custom rules for your use cases

## Example: Add Rule to Permission

```typescript
import { createRule } from "~/models/rule.server";

// Only allow editing drafts or own resources
await createRule({
  permissionId: 5, // meeting.edit.own
  name: "Draft or Owner",
  conditions: {
    OR: [
      { field: "resourceStatus", operator: "equals", value: "draft" },
      { field: "resourceOwnerId", operator: "equals", value: "${userId}" }
    ]
  },
  effect: "allow",
  priority: 100,
  isActive: true
});
```

## Testing Checklist

- [ ] Super admin can access all routes
- [ ] Regular users can only access own meetings
- [ ] Non-approved users cannot login
- [ ] Admin can assign roles to users
- [ ] Admin can add/remove permissions from roles
- [ ] Rules are evaluated correctly (ownership checks)

## Troubleshooting

**"Cannot find module" errors**: Run `npm install` or `pnpm install`

**Migration fails**: Check PostgreSQL connection in `.env`

**No permissions**: Make sure user has a role assigned in `user_roles` table

**Rule not working**: Check rule conditions match the context you're passing

For detailed information, see: `docs/RBAC_IMPLEMENTATION.md`
