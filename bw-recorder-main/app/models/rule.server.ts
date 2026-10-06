import prisma from "../../prisma/client.server";

export interface CreateRuleInput {
  permissionId: number;
  name: string;
  description?: string;
  conditions: any; // JSON object with conditions
  effect: "allow" | "deny";
  priority?: number;
  isActive?: boolean;
}

export interface UpdateRuleInput {
  name?: string;
  description?: string;
  conditions?: any;
  effect?: "allow" | "deny";
  priority?: number;
  isActive?: boolean;
}

export async function createRule(data: CreateRuleInput) {
  const p = prisma as any;
  return await p.rule.create({ data });
}

export async function updateRule(id: number, data: UpdateRuleInput) {
  const p = prisma as any;
  return await p.rule.update({
    where: { id },
    data,
  });
}

export async function deleteRule(id: number) {
  const p = prisma as any;
  return await p.rule.delete({ where: { id } });
}

export async function getRule(id: number) {
  const p = prisma as any;
  return await p.rule.findUnique({
    where: { id },
    include: {
      permission: true,
    },
  });
}

export async function getRulesByPermission(permissionId: number) {
  const p = prisma as any;
  return await p.rule.findMany({
    where: { permissionId },
    orderBy: { priority: "desc" },
  });
}

export async function getAllRules() {
  const p = prisma as any;
  return await p.rule.findMany({
    orderBy: [{ priority: "desc" }, { name: "asc" }],
    include: {
      permission: {
        select: {
          id: true,
          name: true,
          displayName: true,
        },
      },
    },
  });
}

// Helper function to create common rule templates
export function createOwnershipRule(permissionId: number, resourceOwnerField = "ownerId") {
  return {
    permissionId,
    name: "Owner Only",
    description: "Only resource owner can perform this action",
    conditions: {
      field: resourceOwnerField,
      operator: "equals",
      value: "${userId}",
    },
    effect: "allow" as const,
    priority: 100,
    isActive: true,
  };
}

export function createTimeBasedRule(
  permissionId: number,
  startHour: number,
  endHour: number
) {
  return {
    permissionId,
    name: "Time-based Access",
    description: `Access allowed between ${startHour}:00 and ${endHour}:00`,
    conditions: {
      AND: [
        {
          field: "currentHour",
          operator: ">=",
          value: startHour,
        },
        {
          field: "currentHour",
          operator: "<",
          value: endHour,
        },
      ],
    },
    effect: "allow" as const,
    priority: 50,
    isActive: true,
  };
}

export function createStatusBasedRule(
  permissionId: number,
  allowedStatuses: string[]
) {
  return {
    permissionId,
    name: "Status-based Access",
    description: `Access allowed when status is one of: ${allowedStatuses.join(", ")}`,
    conditions: {
      field: "resourceStatus",
      operator: "in",
      value: allowedStatuses,
    },
    effect: "allow" as const,
    priority: 75,
    isActive: true,
  };
}
