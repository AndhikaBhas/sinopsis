import type { ActionFunctionArgs } from "react-router";
import { useActionData } from "react-router";
import { registerUser } from "../lib/auth.server";
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
  const confirmPassword = params.get("confirmPassword") ?? "";

  // Validate password confirmation
  if (password !== confirmPassword) {
    return Response.json(
      { error: "Passwords do not match" },
      { status: 400 }
    );
  }

  try {
    await registerUser({ email, password });
    // Registration successful, show pending approval message
    return Response.json(
      { 
        success: true, 
        message: "Registration successful! Your account is pending administrator approval. You will be able to log in once approved." 
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Registration error:", err);
    const errorMessage = err instanceof Error ? err.message : "Registration failed";
    return Response.json({ error: errorMessage }, { status: 400 });
  }
}

export default function Register() {
  const actionData = useActionData<{ error?: string; success?: boolean; message?: string }>();
  
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-8 rounded-lg border border-border bg-card p-8 shadow-lg">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Create Account</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Register for a new account
          </p>
        </div>
        
        {actionData?.error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {actionData.error}
          </div>
        )}
        
        {actionData?.success && actionData?.message && (
            <>
          <div className="rounded-md bg-green-500/10 border border-green-500/20 px-4 py-3 text-sm text-green-700 dark:text-green-400">
            {actionData.message}
          </div>
           <div className="text-center mt-3 space-y-2">
              <div>
                <span className="text-muted-foreground">Back to </span>
                  <a 
                    href="/login" 
                    className="font-medium text-primary hover:underline"
                  >
                    Sign in
                  </a>
              </div>
              <div>
                <a 
                  href="/" 
                  className="text-sm font-medium text-primary hover:underline"
                >
                  ← Back to Home
                </a>
              </div>
            </div>
            </>
        )}
        
        {!actionData?.success && (
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

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium mb-2">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  placeholder="Confirm your password"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                />
              </div>
            </div>

            <div className="space-y-3">
              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                Create Account
              </Button>
              
              <div className="text-center text-sm space-y-2">
                <div>
                  <span className="text-muted-foreground">Already have an account? </span>
                  <a 
                    href="/login" 
                    className="font-medium text-primary hover:underline"
                  >
                    Sign in
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
        )}
      </div>
    </div>
  );
}
