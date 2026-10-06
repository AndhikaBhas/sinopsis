import prisma from "../../prisma/client.server";

export interface CreatePermissionInput {
  name: string;
  resource: string;
  action: string;
  displayName: string;
  description?: string;
  isActive?: boolean;
}

export interface UpdatePermissionInput {
  name?: string;
  resource?: string;
  action?: string;
  displayName?: string;
  description?: string;
  isActive?: boolean;
}

export async function createPermission(data: CreatePermissionInput) {
  const p = prisma as any;
  return await p.permission.create({ data });
}

export async function updatePermission(id: number, data: UpdatePermissionInput) {
  const p = prisma as any;
  return await p.permission.update({
    where: { id },
    data,
  });
}

export async function deletePermission(id: number) {
  const p = prisma as any;
  return await p.permission.delete({ where: { id } });
}

export async function getPermission(id: number) {
  const p = prisma as any;
  return await p.permission.findUnique({
    where: { id },
    include: {
      rules: {
        where: { isActive: true },
        orderBy: { priority: "desc" },
      },
      _count: {
        select: {
          rolePermissions: true,
          userPermissions: true,
        },
      },
    },
  });
}

export async function getAllPermissions() {
  const p = prisma as any;
  return await p.permission.findMany({
    orderBy: [{ resource: "asc" }, { action: "asc" }],
    include: {
      _count: {
        select: {
          rolePermissions: true,
          userPermissions: true,
          rules: true,
        },
      },
    },
  });
}

export async function getPermissionsByResource(resource: string) {
  const p = prisma as any;
  return await p.permission.findMany({
    where: { resource },
    orderBy: { action: "asc" },
  });
}

export async function assignPermissionToUser(
  userId: number,
  permissionId: number,
  grantedBy?: number,
  expiresAt?: Date
) {
  const p = prisma as any;
  return await p.userPermission.create({
    data: {
      userId,
      permissionId,
      grantedBy,
      expiresAt,
    },
  });
}

export async function removePermissionFromUser(userId: number, permissionId: number) {
  const p = prisma as any;
  return await p.userPermission.deleteMany({
    where: {
      userId,
      permissionId,
    },
  });
}

export async function getUserPermissions(userId: number) {
  const p = prisma as any;
  return await p.userPermission.findMany({
    where: {
      userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    include: {
      permission: true,
    },
  });
}
