import type { ActionFunctionArgs } from "react-router";
import { redirect, useActionData } from "react-router";
import { verifyCredentials, createSessionCookie } from "../lib/auth.server";
import { Button } from "~/components/ui/button";

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const params = new URLSearchParams();
  for (const [k, v] of form.entries()) {
    if (v instanceof File) continue;
    params.append(k, v.toString());
  }
  const email = params.get("email") ?? "";
  const password = params.get("password") ?? "";

  const result = await verifyCredentials(email, password);
  
  // Check if account is pending approval
  if (result && 'error' in result && result.error === 'pending_approval') {
    return Response.json(
      { error: "Your account is pending administrator approval. Please wait for approval before logging in." },
      { status: 403 }
    );
  }
  
  // Check if credentials are invalid
  if (!result) {
    return Response.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const headers = new Headers();
  headers.append("Set-Cookie", createSessionCookie({ id: result.id } as any));
  return redirect("/", { headers });
}

export default function Login() {
  const actionData = useActionData<{ error?: string }>();
  
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-8 rounded-lg border border-border bg-card p-8 shadow-lg">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Sign in</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to your account
          </p>
        </div>
        
        {actionData?.error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {actionData.error}
          </div>
        )}
        
        <form method="post" className="space-y-6">
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-2">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="you@example.com"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              />
            </div>
            
            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-2">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                placeholder="Enter your password"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              />
            </div>
          </div>

          <div className="space-y-3">
            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              Sign in
            </Button>
            
            <div className="text-center text-sm space-y-2">
              <div>
                <span className="text-muted-foreground">Don't have an account? </span>
                <a 
                  href="/register" 
                  className="font-medium text-primary hover:underline"
                >
                  Create one
                </a>
              </div>
              <div>
                <a 
                  href="/" 
                  className="font-medium text-primary hover:underline"
                >
                  ← Back to Home
                </a>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
