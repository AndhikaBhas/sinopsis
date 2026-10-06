import {
  AudioWaveform,
  CirclePlus,
  FileAudio,
  Home,
  Key,
  Shield,
  Upload,
  Users,
} from "lucide-react";
import { Link, useLocation } from "react-router";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "~/components/ui/sidebar";
import { Button } from "./ui/button";

interface SidebarLayoutProps {
  readonly children: React.ReactNode;
  readonly userMenu?: React.ReactNode;
  readonly user?: {
    id: number;
    email: string;
    name?: string | null;
    role?: string | null;
  };
}

const sidebarItems = [
  {
    title: "Home",
    href: "/",
    icon: Home,
  },
  {
    title: "Daftar Rapat",
    href: "/rapat",
    icon: Upload,
  },
  {
    title: "Unggah Rekaman",
    href: "/rapat/upload",
    icon: FileAudio,
  },
  // {
  //   title: "Audio Files",
  //   href: "/audio-files",
  //   icon: FileAudio,
  // },
  // {
  //   title: "Analytics",
  //   href: "/analytics",
  //   icon: BarChart3,
  // },
  // {
  //   title: "Settings",
  //   href: "/settings",
  //   icon: Settings,
  // },
];

const adminItems = [
  {
    title: "Kelola Pengguna",
    href: "/admin/users",
    icon: Users,
  },
  {
    title: "Kelola Role",
    href: "/admin/roles",
    icon: Shield,
  },
  {
    title: "Kelola Permissions",
    href: "/admin/permissions",
    icon: Key,
  },
];

function AppSidebar({
  user,
}: Readonly<{
  user?: {
    id: number;
    email: string;
    name?: string | null;
    role?: string | null;
  };
}>) {
  const location = useLocation();

  // Check if user is super admin
  const isSuperAdmin = user?.role === "super_admin";

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <AudioWaveform className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold flex items-center gap-2">
                    Sinopsis{" "}
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-gradient-to-r from-orange-500 to-pink-500 text-white shadow-sm dark:from-orange-400 dark:to-pink-400 animate-pulse">
                      BETA
                    </span>
                  </span>
                  <span className="truncate text-xs">
                    Sistem Notulen Otomatis
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent className="overflow-x-hidden">
        {/* Meeting Button */}
        <div className="px-2 pt-2">
          <Button
            type="button"
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg py-1 text-sm font-medium transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-orange-500 transform active:scale-95 cursor-pointer bg-orange-600 text-white hover:bg-orange-700 dark:bg-orange-700 dark:hover:bg-orange-800 shadow-lg shadow-orange-500/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:bg-orange-600 disabled:shadow-none"
            aria-label="Buat rapat baru"
            disabled={location.pathname === "/rapat/create"}
            asChild={location.pathname !== "/rapat/create"}
          >
            {location.pathname === "/rapat/create" ? (
              <>
                <CirclePlus className="h-5 w-5" />
                Rekam Rapat
              </>
            ) : (
              <Link prefetch="intent" to="/rapat/create">
                <CirclePlus className="h-5 w-5" />
                Rekam Rapat
              </Link>
            )}
          </Button>
        </div>
        <SidebarSeparator />
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {sidebarItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === item.href}
                  >
                    <Link prefetch="intent" to={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {/* Admin Section - Only visible for super_admin */}
        {isSuperAdmin && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel>Administration</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {adminItems.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={location.pathname === item.href}
                      >
                        <Link prefetch="intent" to={item.href}>
                          <item.icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>
      <SidebarFooter>
        <div className="p-1">
          <div className="text-xs text-sidebar-foreground/70">v1.0.0</div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

export function SidebarLayout({
  children,
  userMenu,
  user,
}: Readonly<SidebarLayoutProps>) {
  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset className="flex flex-col overflow-hidden">
        <header className="sticky top-0 z-10 flex h-12 w-full shrink-0 items-center gap-2 border-b px-4 bg-background">
          <SidebarTrigger className="-ml-1" />
          <div className="flex-1" />
          {userMenu && (
            <div className="flex items-center gap-4">{userMenu}</div>
          )}
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 overflow-auto">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
