import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData } from "react-router";
import { getCurrentUser } from "~/lib/auth.server";
import { requirePermission } from "~/lib/rbac.server";
import prisma from "../../../prisma/client.server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Badge } from "~/components/ui/badge";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getCurrentUser(request);
  
  if (!user) {
    throw redirect("/login");
  }
  
  await requirePermission(user, "user.view");
  
  const p = prisma as any;
  const users = await p.user.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      userRoles: {
        include: {
          role: true,
        },
      },
    },
  });
  
  const roles = await p.role.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
  
  return { users, roles, currentUser: user };
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await getCurrentUser(request);
  
  if (!user) {
    throw redirect("/login");
  }
  
  const formData = await request.formData();
  const intent = formData.get("intent");
  const p = prisma as any;
  
  if (intent === "approve") {
    await requirePermission(user, "user.approve");
    const userId = Number(formData.get("userId"));
    
    await p.user.update({
      where: { id: userId },
      data: { approved: true },
    });
    
    return { success: true, message: "User approved successfully" };
  }
  
  if (intent === "assignRole") {
    await requirePermission(user, "role.manage");
    const userId = Number(formData.get("userId"));
    const roleId = Number(formData.get("roleId"));
    
    // Remove existing roles
    await p.userRole.deleteMany({
      where: { userId },
    });
    
    // Assign new role
    await p.userRole.create({
      data: {
        userId,
        roleId,
        grantedBy: user.id,
      },
    });
    
    return { success: true, message: "Role assigned successfully" };
  }
  
  if (intent === "delete") {
    await requirePermission(user, "user.delete");
    const userId = Number(formData.get("userId"));
    
    if (userId === user.id) {
      return { error: "Cannot delete your own account" };
    }
    
    await p.user.delete({
      where: { id: userId },
    });
    
    return { success: true, message: "User deleted successfully" };
  }
  
  return { error: "Invalid action" };
}

export default function AdminUsers() {
  const { users, roles, currentUser } = useLoaderData<typeof loader>();
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
        <p className="text-muted-foreground">Manage user accounts, roles, and permissions</p>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
          <CardDescription>
            {users.length} {users.length === 1 ? "user" : "users"} in the system
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u: any) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.email}</TableCell>
                  <TableCell>{u.name || "-"}</TableCell>
                  <TableCell>
                    {u.userRoles?.[0]?.role ? (
                      <Badge variant="secondary">{u.userRoles[0].role.displayName}</Badge>
                    ) : (
                      <Badge variant="outline">No Role</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {u.approved ? (
                      <Badge className="border border-green-500 text-green-500 bg-transparent hover:bg-green-50 dark:hover:bg-green-950">Approved</Badge>
                    ) : (
                      <Badge className="border border-red-500 text-red-500 bg-transparent hover:bg-red-50 dark:hover:bg-red-950">Pending</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2 items-center">
                      {!u.approved && (
                        <Form method="post">
                          <input type="hidden" name="intent" value="approve" />
                          <input type="hidden" name="userId" value={u.id} />
                          <Button type="submit" size="sm" className="bg-green-600 hover:bg-green-700 text-white">
                            Approve
                          </Button>
                        </Form>
                      )}
                      
                      <Form method="post" className="flex gap-2 items-center">
                        <input type="hidden" name="intent" value="assignRole" />
                        <input type="hidden" name="userId" value={u.id} />
                        <select
                          name="roleId"
                          className="h-9 px-3 py-1 text-sm border border-input rounded-md bg-background"
                          defaultValue={u.userRoles?.[0]?.roleId || ""}
                        >
                          <option value="">Select Role</option>
                          {roles.map((role: any) => (
                            <option key={role.id} value={role.id}>
                              {role.displayName}
                            </option>
                          ))}
                        </select>
                        <Button type="submit" size="sm" variant="outline">
                          Update
                        </Button>
                      </Form>
                      
                      {u.id !== currentUser.id && (
                        <Form
                          method="post"
                          onSubmit={(e) => {
                            if (!confirm("Are you sure you want to delete this user?")) {
                              e.preventDefault();
                            }
                          }}
                        >
                          <input type="hidden" name="intent" value="delete" />
                          <input type="hidden" name="userId" value={u.id} />
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
        </CardContent>
      </Card>
    </div>
  );
}
