import { type LoaderFunctionArgs, useLoaderData } from "react-router";
import { getCurrentUser } from "~/lib/auth.server";
import { getUserPermissions, getUserRoles } from "~/lib/rbac.server";
import prisma from "../../prisma/client.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getCurrentUser(request);
  
  if (!user) {
    return Response.json({ error: "Not logged in" }, { status: 401 });
  }

  const p = prisma as any;

  // Get user's roles
  const roles = await getUserRoles(user.id);
  
  // Get user's permissions
  const permissions = await getUserPermissions(user.id);

  // Get all role hierarchies for debugging
  const allHierarchies = await p.roleHierarchy.findMany({
    include: {
      parentRole: true,
      childRole: true,
    },
  });

  // Get all role permissions
  const allRolePermissions = await p.rolePermission.findMany({
    include: {
      role: true,
      permission: true,
    },
  });

  return Response.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
    roles: roles.map((r: any) => ({
      id: r.id,
      name: r.name,
      displayName: r.displayName,
    })),
    permissions,
    debug: {
      roleHierarchies: allHierarchies.map((h: any) => ({
        id: h.id,
        parent: { id: h.parentRoleId, name: h.parentRole.name },
        child: { id: h.childRoleId, name: h.childRole.name },
      })),
      rolePermissions: allRolePermissions.map((rp: any) => ({
        role: rp.role.name,
        permission: rp.permission.name,
      })),
    },
  });
}

export default function TestPermissions() {
  const data = useLoaderData<typeof loader>();
  
  return (
    <div className="container mx-auto p-8">
      <h1 className="text-2xl font-bold mb-4">Permission Test</h1>
      <pre className="bg-gray-100 p-4 rounded-lg overflow-auto text-xs">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
