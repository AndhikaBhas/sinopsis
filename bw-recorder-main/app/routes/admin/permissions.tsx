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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { useState } from "react";
import { Pencil } from "lucide-react";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getCurrentUser(request);
  
  if (!user) {
    throw redirect("/login");
  }
  
  await requirePermission(user, "role.view");
  
  const p = prisma as any;
  const permissions = await p.permission.findMany({
    orderBy: [{ resource: "asc" }, { action: "asc" }],
    include: {
      _count: {
        select: {
          rolePermissions: true,
        },
      },
    },
  });
  
  return { permissions, currentUser: user };
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await getCurrentUser(request);
  
  if (!user) {
    throw redirect("/login");
  }
  
  const formData = await request.formData();
  const intent = formData.get("intent");
  const p = prisma as any;
  
  if (intent === "createPermission") {
    await requirePermission(user, "role.manage");
    
    const resource = formData.get("resource") as string;
    const action = formData.get("action") as string;
    const displayName = formData.get("displayName") as string;
    const description = formData.get("description") as string;
    
    const name = `${resource}.${action}`;
    
    await p.permission.create({
      data: {
        name,
        resource,
        action,
        displayName,
        description,
        isActive: true,
      },
    });
    
    return { success: true, message: "Permission created successfully" };
  }
  
  if (intent === "updatePermission") {
    await requirePermission(user, "role.manage");
    
    const permissionId = Number(formData.get("permissionId"));
    const resource = formData.get("resource") as string;
    const action = formData.get("action") as string;
    const displayName = formData.get("displayName") as string;
    const description = formData.get("description") as string;
    
    const name = `${resource}.${action}`;
    
    await p.permission.update({
      where: { id: permissionId },
      data: {
        name,
        resource,
        action,
        displayName,
        description,
      },
    });
    
    return { success: true, message: "Permission updated successfully" };
  }
  
  if (intent === "toggleActive") {
    await requirePermission(user, "role.manage");
    
    const permissionId = Number(formData.get("permissionId"));
    const isActive = formData.get("isActive") === "true";
    
    await p.permission.update({
      where: { id: permissionId },
      data: { isActive: !isActive },
    });
    
    return { success: true, message: "Permission status updated" };
  }
  
  if (intent === "delete") {
    await requirePermission(user, "role.manage");
    
    const permissionId = Number(formData.get("permissionId"));
    
    // Check if permission is in use
    const count = await p.rolePermission.count({
      where: { permissionId },
    });
    
    if (count > 0) {
      return { error: "Cannot delete permission that is assigned to roles" };
    }
    
    await p.permission.delete({
      where: { id: permissionId },
    });
    
    return { success: true, message: "Permission deleted successfully" };
  }
  
  return { error: "Invalid action" };
}

function EditPermissionDialog({ permission }: { permission: any }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Pencil className="h-4 w-4 mr-1" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Permission</DialogTitle>
          <DialogDescription>
            Update the permission details below
          </DialogDescription>
        </DialogHeader>
        <Form method="post" className="space-y-4" onSubmit={() => setOpen(false)}>
          <input type="hidden" name="intent" value="updatePermission" />
          <input type="hidden" name="permissionId" value={permission.id} />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor={`edit-resource-${permission.id}`}>Resource</Label>
              <Input
                id={`edit-resource-${permission.id}`}
                type="text"
                name="resource"
                defaultValue={permission.resource}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`edit-action-${permission.id}`}>Action</Label>
              <Input
                id={`edit-action-${permission.id}`}
                type="text"
                name="action"
                defaultValue={permission.action}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`edit-displayName-${permission.id}`}>Display Name</Label>
            <Input
              id={`edit-displayName-${permission.id}`}
              type="text"
              name="displayName"
              defaultValue={permission.displayName}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`edit-description-${permission.id}`}>Description</Label>
            <textarea
              id={`edit-description-${permission.id}`}
              name="description"
              defaultValue={permission.description || ""}
              className="w-full px-3 py-2 border border-input rounded-md bg-background min-h-[80px]"
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">
              Update Permission
            </Button>
          </div>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminPermissions() {
  const { permissions } = useLoaderData<typeof loader>();
  
  // Group permissions by resource
  const groupedPermissions = permissions.reduce((acc: any, perm: any) => {
    if (!acc[perm.resource]) {
      acc[perm.resource] = [];
    }
    acc[perm.resource].push(perm);
    return acc;
  }, {});
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Permission Management</h1>
          <p className="text-muted-foreground">Manage system permissions and access controls</p>
        </div>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Create New Permission</CardTitle>
          <CardDescription>Add a new permission to the system</CardDescription>
        </CardHeader>
        <CardContent>
          <Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="createPermission" />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="resource">Resource</Label>
                <Input
                  id="resource"
                  type="text"
                  name="resource"
                  placeholder="e.g., user, role, rapat"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="action">Action</Label>
                <Input
                  id="action"
                  type="text"
                  name="action"
                  placeholder="e.g., view, create, delete"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                type="text"
                name="displayName"
                placeholder="e.g., View Users"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                name="description"
                placeholder="Describe what this permission allows..."
                className="w-full px-3 py-2 border border-input rounded-md bg-background min-h-[80px]"
                rows={3}
              />
            </div>
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">
              Create Permission
            </Button>
          </Form>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>All Permissions</CardTitle>
          <CardDescription>
            {permissions.length} {permissions.length === 1 ? "permission" : "permissions"} in the system
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {Object.entries(groupedPermissions).map(([resource, perms]: [string, any]) => (
              <div key={resource}>
                <h3 className="text-lg font-semibold mb-3 capitalize">{resource}</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Permission</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Display Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Used By</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {perms.map((perm: any) => (
                      <TableRow key={perm.id}>
                        <TableCell className="font-medium font-mono text-sm">{perm.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{perm.action}</Badge>
                        </TableCell>
                        <TableCell>{perm.displayName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                          {perm.description || "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {perm._count.rolePermissions} {perm._count.rolePermissions === 1 ? "role" : "roles"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {perm.isActive ? (
                            <Badge variant="default">Active</Badge>
                          ) : (
                            <Badge variant="destructive">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <EditPermissionDialog permission={perm} />
                            
                            <Form method="post">
                              <input type="hidden" name="intent" value="toggleActive" />
                              <input type="hidden" name="permissionId" value={perm.id} />
                              <input type="hidden" name="isActive" value={perm.isActive.toString()} />
                              <Button type="submit" size="sm" variant="outline">
                                {perm.isActive ? "Deactivate" : "Activate"}
                              </Button>
                            </Form>
                            
                            {perm._count.rolePermissions === 0 && (
                              <Form
                                method="post"
                                onSubmit={(e) => {
                                  if (!confirm("Are you sure you want to delete this permission?")) {
                                    e.preventDefault();
                                  }
                                }}
                              >
                                <input type="hidden" name="intent" value="delete" />
                                <input type="hidden" name="permissionId" value={perm.id} />
                                <Button type="submit" size="sm" variant="destructive">
                                  Delete
                                </Button>
                              </Form>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
