import type { LoaderFunctionArgs } from "react-router";

// Catch-all route to handle unmatched URLs like Chrome DevTools requests
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  // Handle Chrome DevTools specific route
  if (url.pathname === "/.well-known/appspecific/com.chrome.devtools.json") {
    return new Response("Not Found", { status: 404 });
  }

  // For other unmatched routes, throw a 404
  throw new Response("Not Found", { status: 404 });
}

export default function CatchAll() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold">Page Not Found</h1>
      <p className="mt-4">The page you're looking for doesn't exist.</p>
    </div>
  );
}
