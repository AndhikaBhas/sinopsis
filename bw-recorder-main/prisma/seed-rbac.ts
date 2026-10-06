import "dotenv/config";

import prisma from "./client.server";

async function seed() {
  const p = prisma as any;

  console.log("🌱 Seeding RBAC data...");

  // Create Permissions
  console.log("Creating permissions...");

  const permissions = [
    // Meeting permissions
    { name: "meeting.create", resource: "meeting", action: "create", displayName: "Create Meeting" },
    { name: "meeting.view.own", resource: "meeting", action: "view", displayName: "View Own Meetings" },
    { name: "meeting.view.all", resource: "meeting", action: "viewAll", displayName: "View All Meetings" },
    { name: "meeting.edit.own", resource: "meeting", action: "edit", displayName: "Edit Own Meetings" },
    { name: "meeting.edit.all", resource: "meeting", action: "editAll", displayName: "Edit All Meetings" },
    { name: "meeting.delete.own", resource: "meeting", action: "delete", displayName: "Delete Own Meetings" },
    { name: "meeting.delete.all", resource: "meeting", action: "deleteAll", displayName: "Delete All Meetings" },

    // User permissions
    { name: "user.view", resource: "user", action: "view", displayName: "View Users" },
    { name: "user.create", resource: "user", action: "create", displayName: "Create Users" },
    { name: "user.edit", resource: "user", action: "edit", displayName: "Edit Users" },
    { name: "user.delete", resource: "user", action: "delete", displayName: "Delete Users" },
    { name: "user.approve", resource: "user", action: "approve", displayName: "Approve Users" },

    // Role & Permission Management
    { name: "role.view", resource: "role", action: "view", displayName: "View Roles" },
    { name: "role.manage", resource: "role", action: "manage", displayName: "Manage Roles" },
    { name: "permission.view", resource: "permission", action: "view", displayName: "View Permissions" },
    { name: "permission.manage", resource: "permission", action: "manage", displayName: "Manage Permissions" },

    // System permissions
    { name: "settings.manage", resource: "settings", action: "manage", displayName: "Manage Settings" },
    { name: "analytics.view", resource: "analytics", action: "view", displayName: "View Analytics" },
  ];

  const createdPermissions = await Promise.all(
    permissions.map(async (perm) => {
      const existing = await p.permission.findUnique({ where: { name: perm.name } });
      if (existing) return existing;
      return await p.permission.create({ data: perm });
    })
  );

  console.log(`✅ Created ${createdPermissions.length} permissions`);

  // Create Roles
  console.log("Creating roles...");

  const roles = [
    {
      name: "super_admin",
      displayName: "Super Administrator",
      description: "Full system access with all permissions",
    },
    {
      name: "admin",
      displayName: "Administrator",
      description: "Administrative access to manage users and meetings",
    },
    {
      name: "moderator",
      displayName: "Moderator",
      description: "Can manage all meetings but not users",
    },
    {
      name: "user",
      displayName: "Regular User",
      description: "Basic user with access to own meetings",
    },
  ];

  const createdRoles = await Promise.all(
    roles.map(async (role) => {
      const existing = await p.role.findUnique({ where: { name: role.name } });
      if (existing) return existing;
      return await p.role.create({ data: role });
    })
  );

  console.log(`✅ Created ${createdRoles.length} roles`);

  // Assign Permissions to Roles
  console.log("Assigning permissions to roles...");

  const superAdminRole = createdRoles.find((r) => r.name === "super_admin");
  const adminRole = createdRoles.find((r) => r.name === "admin");
  const moderatorRole = createdRoles.find((r) => r.name === "moderator");
  const userRole = createdRoles.find((r) => r.name === "user");

  // Super Admin gets all permissions
  if (superAdminRole) {
    for (const permission of createdPermissions) {
      await p.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: superAdminRole.id,
            permissionId: permission.id,
          },
        },
        create: {
          roleId: superAdminRole.id,
          permissionId: permission.id,
        },
        update: {},
      });
    }
    console.log(`✅ Super Admin: ${createdPermissions.length} permissions`);
  }

  // Admin permissions
  if (adminRole) {
    const adminPermissions = createdPermissions.filter((p) =>
      [
        "meeting.create",
        "meeting.view.all",
        "meeting.edit.all",
        "meeting.delete.all",
        "user.view",
        "user.create",
        "user.edit",
        "user.approve",
        "analytics.view",
        "settings.manage",
      ].includes(p.name)
    );

    for (const permission of adminPermissions) {
      await p.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: adminRole.id,
            permissionId: permission.id,
          },
        },
        create: {
          roleId: adminRole.id,
          permissionId: permission.id,
        },
        update: {},
      });
    }
    console.log(`✅ Admin: ${adminPermissions.length} permissions`);
  }

  // Moderator permissions
  if (moderatorRole) {
    const moderatorPermissions = createdPermissions.filter((p) =>
      [
        "meeting.create",
        "meeting.view.all",
        "meeting.edit.all",
        "meeting.delete.own",
        "user.view",
        "analytics.view",
      ].includes(p.name)
    );

    for (const permission of moderatorPermissions) {
      await p.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: moderatorRole.id,
            permissionId: permission.id,
          },
        },
        create: {
          roleId: moderatorRole.id,
          permissionId: permission.id,
        },
        update: {},
      });
    }
    console.log(`✅ Moderator: ${moderatorPermissions.length} permissions`);
  }

  // User permissions
  if (userRole) {
    const userPermissions = createdPermissions.filter((p) =>
      ["meeting.create", "meeting.view.own", "meeting.edit.own", "meeting.delete.own"].includes(p.name)
    );

    for (const permission of userPermissions) {
      await p.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: userRole.id,
            permissionId: permission.id,
          },
        },
        create: {
          roleId: userRole.id,
          permissionId: permission.id,
        },
        update: {},
      });
    }
    console.log(`✅ User: ${userPermissions.length} permissions`);
  }

  // Create example rules
  console.log("Creating example rules...");

  const meetingEditOwnPerm = createdPermissions.find((p) => p.name === "meeting.edit.own");
  const meetingDeleteOwnPerm = createdPermissions.find((p) => p.name === "meeting.delete.own");

  if (meetingEditOwnPerm) {
    await p.rule.upsert({
      where: { id: 1 },
      create: {
        permissionId: meetingEditOwnPerm.id,
        name: "Owner Only - Edit",
        description: "User can only edit meetings they created",
        conditions: {
          field: "resourceOwnerId",
          operator: "equals",
          value: "${userId}",
        },
        effect: "allow",
        priority: 100,
        isActive: true,
      },
      update: {},
    });
  }

  if (meetingDeleteOwnPerm) {
    await p.rule.upsert({
      where: { id: 2 },
      create: {
        permissionId: meetingDeleteOwnPerm.id,
        name: "Owner Only - Delete",
        description: "User can only delete meetings they created",
        conditions: {
          field: "resourceOwnerId",
          operator: "equals",
          value: "${userId}",
        },
        effect: "allow",
        priority: 100,
        isActive: true,
      },
      update: {},
    });
  }

  console.log("✅ Created example rules");

  // Assign default role to existing users
  console.log("Assigning default roles to existing users...");
  const users = await p.user.findMany();

  if (userRole) {
    for (const user of users) {
      const existingRole = await p.userRole.findFirst({
        where: { userId: user.id },
      });

      if (!existingRole) {
        await p.userRole.create({
          data: {
            userId: user.id,
            roleId: userRole.id,
          },
        });
      }
    }
    console.log(`✅ Assigned default role to ${users.length} users`);
  }

  console.log("✨ Seeding complete!");
}

seed()
  .catch((e) => {
    console.error("Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    const p = prisma as any;
    await p.$disconnect();
  });
