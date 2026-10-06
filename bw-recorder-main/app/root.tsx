import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  type LoaderFunctionArgs,
  useLoaderData,
  useLocation,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";
import { SidebarLayout } from "./components/sidebar-layout";
import { ThemeToggle } from "./components/theme-toggle";
import { UserMenu } from "./components/user-menu";
import { ThemeProvider } from "./lib/theme";
import { getCurrentUser } from "./lib/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getCurrentUser(request);
  return { user };
}

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

export function Layout({ children }: { readonly children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <ThemeProvider defaultTheme="system" storageKey="sinopsis-ui-theme">
          {children}
        </ThemeProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const data = useLoaderData<typeof loader>();
  const location = useLocation();
  
  // Don't render sidebar on login, register, and unauthorized pages
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register' || location.pathname === '/unauthorized';

  const handleLogout = () => {
    // Navigate to /logout action
    globalThis.location.href = "/logout";
  };

  const handleSettings = () => {
    // Handle settings navigation here
    console.log("Settings clicked");
  };

  const handleProfile = () => {
    // Handle profile navigation here
    console.log("Profile clicked");
  };

  // Render auth pages without sidebar
  if (isAuthPage) {
    return <Outlet />;
  }

  return (
    <SidebarLayout
      user={data.user ?? undefined}
      userMenu={
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <UserMenu user={data.user ?? undefined} onLogout={handleLogout} onSettings={handleSettings} onProfile={handleProfile} />
        </div>
      }
    >
      <Outlet />
    </SidebarLayout>
  );
}

export function ErrorBoundary({ error }: { readonly error: Route.ErrorBoundaryProps["error"] }) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404 ? "The requested page could not be found." : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
