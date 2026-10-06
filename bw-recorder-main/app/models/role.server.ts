import prisma from "../../prisma/client.server";

export interface CreateRoleInput {
  name: string;
  displayName: string;
  description?: string;
  isActive?: boolean;
}

export interface UpdateRoleInput {
  name?: string;
  displayName?: string;
  description?: string;
  isActive?: boolean;
}

export async function createRole(data: CreateRoleInput) {
  const p = prisma as any;
  return await p.role.create({ data });
}

export async function updateRole(id: number, data: UpdateRoleInput) {
  const p = prisma as any;
  return await p.role.update({
    where: { id },
    data,
  });
}

export async function deleteRole(id: number) {
  const p = prisma as any;
  return await p.role.delete({ where: { id } });
}

export async function getRole(id: number) {
  const p = prisma as any;
  return await p.role.findUnique({
    where: { id },
    include: {
      rolePermissions: {
        include: {
          permission: true,
        },
      },
      parentRoles: {
        include: {
          parentRole: true,
        },
      },
      childRoles: {
        include: {
          childRole: true,
        },
      },
    },
  });
}

export async function getAllRoles() {
  const p = prisma as any;
  return await p.role.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: {
          userRoles: true,
          rolePermissions: true,
        },
      },
    },
  });
}

export async function assignRoleToUser(userId: number, roleId: number, grantedBy?: number) {
  const p = prisma as any;
  return await p.userRole.create({
    data: {
      userId,
      roleId,
      grantedBy,
    },
  });
}

export async function removeRoleFromUser(userId: number, roleId: number) {
  const p = prisma as any;
  return await p.userRole.deleteMany({
    where: {
      userId,
      roleId,
    },
  });
}

export async function addPermissionToRole(roleId: number, permissionId: number) {
  const p = prisma as any;
  return await p.rolePermission.create({
    data: {
      roleId,
      permissionId,
    },
  });
}

export async function removePermissionFromRole(roleId: number, permissionId: number) {
  const p = prisma as any;
  return await p.rolePermission.deleteMany({
    where: {
      roleId,
      permissionId,
    },
  });
}

export async function createRoleHierarchy(parentRoleId: number, childRoleId: number) {
  const p = prisma as any;
  
  // Check for circular dependencies
  const wouldCreateCycle = await checkCircularDependency(parentRoleId, childRoleId);
  if (wouldCreateCycle) {
    throw new Error("Cannot create role hierarchy: would create circular dependency");
  }
  
  return await p.roleHierarchy.create({
    data: {
      parentRoleId,
      childRoleId,
    },
  });
}

export async function removeRoleHierarchy(parentRoleId: number, childRoleId: number) {
  const p = prisma as any;
  return await p.roleHierarchy.deleteMany({
    where: {
      parentRoleId,
      childRoleId,
    },
  });
}

async function checkCircularDependency(parentRoleId: number, childRoleId: number): Promise<boolean> {
  const p = prisma as any;
  const visited = new Set<number>();
  const queue = [childRoleId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    
    if (currentId === parentRoleId) {
      return true; // Circular dependency found
    }

    if (visited.has(currentId)) {
      continue;
    }

    visited.add(currentId);

    // Get all children of current role
    const children = await p.roleHierarchy.findMany({
      where: { parentRoleId: currentId },
    });

    for (const child of children) {
      queue.push(child.childRoleId);
    }
  }

  return false;
}
