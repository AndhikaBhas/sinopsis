import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData } from "react-router";
import { getCurrentUser } from "~/lib/auth.server";
import { requirePermission } from "~/lib/rbac.server";
import prisma from "../../../prisma/client.server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getCurrentUser(request);
  
  if (!user) {
    throw redirect("/login");
  }
  
  await requirePermission(user, "role.view");
  
  const p = prisma as any;
  const roles = await p.role.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: {
          userRoles: true,
          rolePermissions: true,
        },
      },
      rolePermissions: {
        include: {
          permission: true,
        },
      },
      parentRoles: {
        include: {
          childRole: true,
        },
      },
      childRoles: {
        include: {
          parentRole: true,
        },
      },
    },
  });
  
  const permissions = await p.permission.findMany({
    where: { isActive: true },
    orderBy: [{ resource: "asc" }, { action: "asc" }],
  });
  
  return { roles, permissions, currentUser: user };
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await getCurrentUser(request);
  
  if (!user) {
    throw redirect("/login");
  }
  
  const formData = await request.formData();
  const intent = formData.get("intent");
  const p = prisma as any;
  
  if (intent === "createRole") {
    await requirePermission(user, "role.manage");
    
    const name = formData.get("name") as string;
    const displayName = formData.get("displayName") as string;
    const description = formData.get("description") as string;
    
    await p.role.create({
      data: {
        name: name.toLowerCase().replaceAll(/\s+/g, "_"),
        displayName,
        description,
        isActive: true,
      },
    });
    
    return { success: true, message: "Role created successfully" };
  }
  
  if (intent === "addPermission") {
    await requirePermission(user, "role.manage");
    
    const roleId = Number(formData.get("roleId"));
    const permissionId = Number(formData.get("permissionId"));
    
    await p.rolePermission.create({
      data: { roleId, permissionId },
    });
    
    return { success: true, message: "Permission added to role" };
  }
  
  if (intent === "removePermission") {
    await requirePermission(user, "role.manage");
    
    const roleId = Number(formData.get("roleId"));
    const permissionId = Number(formData.get("permissionId"));
    
    await p.rolePermission.deleteMany({
      where: { roleId, permissionId },
    });
    
    return { success: true, message: "Permission removed from role" };
  }
  
  if (intent === "addParentRole") {
    await requirePermission(user, "role.manage");
    
    const childRoleId = Number(formData.get("childRoleId"));
    const parentRoleId = Number(formData.get("parentRoleId"));
    
    // Prevent circular hierarchy
    if (childRoleId === parentRoleId) {
      return { error: "Cannot add a role as its own parent" };
    }
    
    // Check if this would create a circular dependency
    const existingHierarchies = await p.roleHierarchy.findMany();
    const wouldCreateCircle = checkCircularDependency(
      existingHierarchies,
      parentRoleId,
      childRoleId
    );
    
    if (wouldCreateCircle) {
      return { error: "Cannot add parent role: would create circular dependency" };
    }
    
    await p.roleHierarchy.create({
      data: { parentRoleId, childRoleId },
    });
    
    return { success: true, message: "Parent role added successfully" };
  }
  
  if (intent === "removeParentRole") {
    await requirePermission(user, "role.manage");
    
    const childRoleId = Number(formData.get("childRoleId"));
    const parentRoleId = Number(formData.get("parentRoleId"));
    
    await p.roleHierarchy.deleteMany({
      where: { parentRoleId, childRoleId },
    });
    
    return { success: true, message: "Parent role removed successfully" };
  }
  
  return { error: "Invalid action" };
}

// Helper function to check for circular dependencies
function checkCircularDependency(
  hierarchies: any[],
  newParentId: number,
  newChildId: number
): boolean {
  // Build a map of child -> parents
  const childToParents = new Map<number, Set<number>>();
  
  for (const h of hierarchies) {
    if (!childToParents.has(h.childRoleId)) {
      childToParents.set(h.childRoleId, new Set());
    }
    childToParents.get(h.childRoleId)!.add(h.parentRoleId);
  }
  
  // Check if newParent has newChild as an ancestor
  const visited = new Set<number>();
  const queue = [newParentId];
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    
    if (current === newChildId) {
      return true; // Found circular dependency
    }
    
    if (visited.has(current)) continue;
    visited.add(current);
    
    const parents = childToParents.get(current);
    if (parents) {
      queue.push(...Array.from(parents));
    }
  }
  
  return false;
}

export default function AdminRoles() {
  const { roles, permissions } = useLoaderData<typeof loader>();
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Role Management</h1>
          <p className="text-muted-foreground">Manage roles and their permissions</p>
        </div>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Create New Role</CardTitle>
          <CardDescription>Add a new role to the system</CardDescription>
        </CardHeader>
        <CardContent>
          <Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="createRole" />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name (slug)</Label>
                <Input
                  id="name"
                  type="text"
                  name="name"
                  placeholder="e.g., content_editor"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  type="text"
                  name="displayName"
                  placeholder="e.g., Content Editor"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                name="description"
                placeholder="Describe the role..."
                className="w-full px-3 py-2 border border-input rounded-md bg-background min-h-[80px]"
                rows={3}
              />
            </div>
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">
              Create Role
            </Button>
          </Form>
        </CardContent>
      </Card>
      
      <div className="grid gap-6">
        {roles.map((role: any) => (
          <Card key={role.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{role.displayName}</CardTitle>
                  <CardDescription>
                    {role.name} • {role._count.userRoles} users • {role._count.rolePermissions} permissions
                  </CardDescription>
                </div>
                <Badge variant={role.isActive ? "default" : "secondary"}>
                  {role.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {role.description && (
                <p className="text-sm text-muted-foreground">{role.description}</p>
              )}
              
              <div>
                <h4 className="font-medium mb-2">Inherits From (Parent Roles)</h4>
                <p className="text-xs text-muted-foreground mb-2">
                  This role inherits all permissions from these parent roles
                </p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {role.childRoles.length > 0 ? (
                    role.childRoles.map((ch: any) => (
                      <Form key={ch.parentRoleId} method="post" className="inline">
                        <input type="hidden" name="intent" value="removeParentRole" />
                        <input type="hidden" name="childRoleId" value={role.id} />
                        <input type="hidden" name="parentRoleId" value={ch.parentRoleId} />
                        <Badge variant="outline" className="cursor-pointer hover:bg-destructive/10">
                          {ch.parentRole.displayName}
                          <button type="submit" className="ml-2 hover:text-destructive">
                            ×
                          </button>
                        </Badge>
                      </Form>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">No parent roles</span>
                  )}
                </div>
                
                <Form method="post" className="flex gap-2 items-end">
                  <input type="hidden" name="intent" value="addParentRole" />
                  <input type="hidden" name="childRoleId" value={role.id} />
                  <div className="flex-1">
                    <Label htmlFor={`parent-role-${role.id}`}>Add Parent Role</Label>
                    <select
                      id={`parent-role-${role.id}`}
                      name="parentRoleId"
                      className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background"
                    >
                      <option value="">Select parent role to inherit from...</option>
                      {roles
                        .filter((r: any) => 
                          r.id !== role.id && 
                          !role.childRoles.some((ch: any) => ch.parentRoleId === r.id)
                        )
                        .map((r: any) => (
                          <option key={r.id} value={r.id}>
                            {r.displayName} ({r.name})
                          </option>
                        ))}
                    </select>
                  </div>
                  <Button type="submit" size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                    Add
                  </Button>
                </Form>
              </div>
              
              {role.parentRoles.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Inherited By (Child Roles)</h4>
                  <p className="text-xs text-muted-foreground mb-2">
                    These roles inherit all permissions from this role
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {role.parentRoles.map((ph: any) => (
                      <Badge key={ph.childRoleId} variant="secondary">
                        {ph.childRole.displayName}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              
              <div>
                <h4 className="font-medium mb-2">Permissions</h4>
                <div className="flex flex-wrap gap-2 mb-4">
                  {role.rolePermissions.map((rp: any) => (
                    <Form key={rp.permissionId} method="post" className="inline">
                      <input type="hidden" name="intent" value="removePermission" />
                      <input type="hidden" name="roleId" value={role.id} />
                      <input type="hidden" name="permissionId" value={rp.permissionId} />
                      <Badge variant="secondary" className="cursor-pointer hover:bg-destructive/10">
                        {rp.permission.displayName}
                        <button type="submit" className="ml-2 hover:text-destructive">
                          ×
                        </button>
                      </Badge>
                    </Form>
                  ))}
                </div>
                
                <Form method="post" className="flex gap-2 items-end">
                  <input type="hidden" name="intent" value="addPermission" />
                  <input type="hidden" name="roleId" value={role.id} />
                  <div className="flex-1">
                    <Label htmlFor={`permission-${role.id}`}>Add Permission</Label>
                    <select
                      id={`permission-${role.id}`}
                      name="permissionId"
                      className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background"
                    >
                      <option value="">Select permission to add...</option>
                      {permissions
                        .filter((p: any) => 
                          !role.rolePermissions.some((rp: any) => rp.permissionId === p.id)
                        )
                        .map((p: any) => (
                          <option key={p.id} value={p.id}>
                            {p.displayName} ({p.name})
                          </option>
                        ))}
                    </select>
                  </div>
                  <Button type="submit" size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                    Add
                  </Button>
                </Form>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
