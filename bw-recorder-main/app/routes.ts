import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("register", "routes/register.tsx"),
  route("logout", "routes/logout.tsx"),
  route("unauthorized", "routes/unauthorized.tsx"),
  route("test-permissions", "routes/test-permissions.tsx"),
  route("profile", "routes/profile.tsx"),
  route("audio-files", "routes/audio-files.tsx"),
  route("analytics", "routes/analytics.tsx"),
  route("settings", "routes/settings.tsx"),
  route("upload-audio", "routes/upload-audio.tsx"),
  route("upload-status", "routes/upload-status.tsx"),
  route("rapat/index?", "routes/rapat/rapat-index.tsx"),
  route("rapat/create", "routes/rapat/rapat-create.tsx"),
  route("rapat/upload", "routes/rapat/rapat-upload.tsx"),
  route("rapat/view/:id", "routes/rapat/rapat-view.tsx"),
  route("rapat/download/:id", "routes/rapat/rapat-download.tsx"),
  // Admin routes
  route("admin/users", "routes/admin/users.tsx"),
  route("admin/roles", "routes/admin/roles.tsx"),
  route("admin/permissions", "routes/admin/permissions.tsx"),
  // Catch-all route for unmatched URLs (including Chrome DevTools requests)
  route("*", "routes/$.tsx"),
] satisfies RouteConfig;
