import { redirect } from "react-router";
import prisma from "../../prisma/client.server";

export interface User {
  id: number;
  email: string;
  name?: string | null;
  role?: string;
  approved?: boolean;
}

export interface RuleContext {
  userId: number;
  resourceId?: number | string;
  resourceOwnerId?: number;
  [key: string]: any;
}

/**
 * Get all permissions for a user (from roles and direct permissions)
 * Includes role hierarchy traversal
 */
export async function getUserPermissions(userId: number): Promise<string[]> {
  const p = prisma as any;

  // console.log(`[RBAC DEBUG] Getting permissions for user ${userId}`);

  // Get user's direct permissions
  const directPermissions = await p.userPermission.findMany({
    where: {
      userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    include: {
      permission: true,
    },
  });

  // Get user's roles (including non-expired ones)
  const userRoles = await p.userRole.findMany({
    where: {
      userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    include: {
      role: true,
    },
  });

  // console.log(`[RBAC DEBUG] User has ${userRoles.length} roles:`, userRoles.map((ur: any) => ({ id: ur.roleId, name: ur.role?.name })));

  // Bypass: super_admin gets all active permissions (fixes mismatch e.g. rapat.* vs meeting.*)
  const isSuperAdmin = userRoles.some((ur: any) => ur.role?.name === "super_admin" && ur.role?.isActive);
  if (isSuperAdmin) {
    const allPerms = await p.permission.findMany({
      where: { isActive: true },
      select: { name: true },
    });
    return allPerms.map((perm: any) => perm.name);
  }

  // Filter active roles only
  const activeRoleIds = userRoles.filter((ur: any) => ur.role?.isActive).map((ur: any) => ur.roleId);

  // console.log(`[RBAC DEBUG] Active role IDs:`, activeRoleIds);

  // Get all permissions from roles (including inherited roles)
  const allRoleIds = await getAllInheritedRoles(activeRoleIds);

  // console.log(`[RBAC DEBUG] All role IDs (after inheritance):`, allRoleIds);

  const rolePermissions = await p.rolePermission.findMany({
    where: {
      roleId: { in: allRoleIds },
    },
    include: {
      permission: true,
    },
  });

  // console.log(`[RBAC DEBUG] Found ${rolePermissions.length} permissions from roles`);

  // Combine and deduplicate permissions (filter active only)
  const permissionNames = new Set<string>();

  for (const up of directPermissions) {
    if (up.permission?.isActive) {
      permissionNames.add(up.permission.name);
    }
  }

  for (const rp of rolePermissions) {
    if (rp.permission?.isActive) {
      permissionNames.add(rp.permission.name);
    }
  }

  // console.log(`[RBAC DEBUG] Final permissions for user ${userId}:`, Array.from(permissionNames));

  return Array.from(permissionNames);
}

/**
 * Get all inherited roles (including parent roles recursively)
 */
async function getAllInheritedRoles(roleIds: number[]): Promise<number[]> {
  if (roleIds.length === 0) return [];

  const p = prisma as any;
  const allRoleIds = new Set<number>(roleIds);
  const toProcess = [...roleIds];

  // console.log('[RBAC DEBUG] Starting role hierarchy traversal for roles:', roleIds);

  while (toProcess.length > 0) {
    const currentRoleId = toProcess.pop()!;

    // Find parent roles
    const hierarchies = await p.roleHierarchy.findMany({
      where: { childRoleId: currentRoleId },
    });

    // console.log(`[RBAC DEBUG] Role ${currentRoleId} has parent hierarchies:`, hierarchies);

    for (const hierarchy of hierarchies) {
      if (!allRoleIds.has(hierarchy.parentRoleId)) {
        allRoleIds.add(hierarchy.parentRoleId);
        toProcess.push(hierarchy.parentRoleId);
        // console.log(`[RBAC DEBUG] Added parent role ${hierarchy.parentRoleId} to hierarchy`);
      }
    }
  }

  // console.log('[RBAC DEBUG] Final role IDs (including inherited):', Array.from(allRoleIds));
  return Array.from(allRoleIds);
}

/**
 * Check if user has a specific permission
 */
export async function hasPermission(userId: number, permissionName: string, context?: RuleContext): Promise<boolean> {
  // Bypass: super_admin has all permissions without rule evaluation
  const roles = await getUserRoles(userId);
  if (roles.some((r: any) => r.name === "super_admin")) {
    return true;
  }

  const permissions = await getUserPermissions(userId);

  if (!permissions.includes(permissionName)) {
    return false;
  }

  // Check rules if context is provided
  if (context) {
    return await evaluateRules(userId, permissionName, context);
  }

  return true;
}

/**
 * Check if user has any of the specified permissions
 */
export async function hasAnyPermission(
  userId: number,
  permissionNames: string[],
  context?: RuleContext
): Promise<boolean> {
  for (const permissionName of permissionNames) {
    if (await hasPermission(userId, permissionName, context)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if user has all of the specified permissions
 */
export async function hasAllPermissions(
  userId: number,
  permissionNames: string[],
  context?: RuleContext
): Promise<boolean> {
  for (const permissionName of permissionNames) {
    if (!(await hasPermission(userId, permissionName, context))) {
      return false;
    }
  }
  return true;
}

/**
 * Evaluate rules for a permission with given context
 */
async function evaluateRules(userId: number, permissionName: string, context: RuleContext): Promise<boolean> {
  const p = prisma as any;

  // Get the permission
  const permission = await p.permission.findUnique({
    where: { name: permissionName },
    include: {
      rules: {
        where: { isActive: true },
        orderBy: { priority: "desc" },
      },
    },
  });

  if (!permission?.rules || permission.rules.length === 0) {
    return true; // No rules means permission is granted
  }

  // Evaluate rules in priority order
  for (const rule of permission.rules) {
    const result = evaluateRuleConditions(rule.conditions, { ...context, userId });

    if (result) {
      return rule.effect === "allow";
    }
  }

  return true; // Default allow if no rules match
}

/**
 * Evaluate rule conditions
 */
function evaluateRuleConditions(conditions: any, context: RuleContext): boolean {
  if (!conditions || typeof conditions !== "object") {
    return true;
  }

  // Handle logical operators
  if (conditions.AND) {
    return conditions.AND.every((cond: any) => evaluateRuleConditions(cond, context));
  }

  if (conditions.OR) {
    return conditions.OR.some((cond: any) => evaluateRuleConditions(cond, context));
  }

  if (conditions.NOT) {
    return !evaluateRuleConditions(conditions.NOT, context);
  }

  // Handle simple condition: { field, operator, value }
  const { field, operator, value } = conditions;

  if (!field || !operator) {
    return true;
  }

  const contextValue = getNestedValue(context, field);
  const comparisonValue = resolveValue(value, context);

  switch (operator) {
    case "equals":
    case "==":
      return contextValue == comparisonValue;
    case "notEquals":
    case "!=":
      return contextValue != comparisonValue;
    case "in":
      return Array.isArray(comparisonValue) && comparisonValue.includes(contextValue);
    case "notIn":
      return Array.isArray(comparisonValue) && !comparisonValue.includes(contextValue);
    case "greaterThan":
    case ">":
      return contextValue > comparisonValue;
    case "greaterThanOrEqual":
    case ">=":
      return contextValue >= comparisonValue;
    case "lessThan":
    case "<":
      return contextValue < comparisonValue;
    case "lessThanOrEqual":
    case "<=":
      return contextValue <= comparisonValue;
    case "contains":
      return String(contextValue).includes(String(comparisonValue));
    case "startsWith":
      return String(contextValue).startsWith(String(comparisonValue));
    case "endsWith":
      return String(contextValue).endsWith(String(comparisonValue));
    default:
      return true;
  }
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((current, key) => current?.[key], obj);
}

/**
 * Resolve value, supporting template variables like ${userId}
 */
function resolveValue(value: any, context: RuleContext): any {
  if (typeof value === "string" && value.startsWith("${") && value.endsWith("}")) {
    const varName = value.slice(2, -1);
    return getNestedValue(context, varName);
  }
  return value;
}

/**
 * Require permission - throws error if user doesn't have permission
 */
export async function requirePermission(
  user: User | null,
  permissionName: string,
  context?: RuleContext
): Promise<void> {
  if (!user) {
    throw redirect("/login");
  }

  // Fast-path bypass: primary role from session is super_admin
  if ((user as User).role === "super_admin") {
    return;
  }

  const allowed = await hasPermission(user.id, permissionName, context);

  if (!allowed) {
    throw redirect("/unauthorized");
  }
}

/**
 * Require any permission - throws error if user doesn't have at least one
 */
export async function requireAnyPermission(
  user: User | null,
  permissionNames: string[],
  context?: RuleContext
): Promise<void> {
  if (!user) {
    throw redirect("/login");
  }

  // Fast-path bypass: primary role from session is super_admin
  if ((user as User).role === "super_admin") {
    return;
  }

  const allowed = await hasAnyPermission(user.id, permissionNames, context);

  if (!allowed) {
    throw redirect("/unauthorized");
  }
}

/**
 * Get user's roles
 */
export async function getUserRoles(userId: number) {
  const p = prisma as any;

  const userRoles = await p.userRole.findMany({
    where: {
      userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    include: {
      role: true,
    },
  });

  return userRoles.map((ur: any) => ur.role).filter((role: any) => role?.isActive);
}
