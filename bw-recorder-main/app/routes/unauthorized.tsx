import { ShieldAlert } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";

export default function Unauthorized() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <ShieldAlert className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-2xl">Access Denied</CardTitle>
          <CardDescription>
            You don't have permission to access this resource
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted p-4 text-sm">
            <p className="text-muted-foreground">
              If you believe you should have access to this page, please contact your administrator
              to request the necessary permissions.
            </p>
          </div>
          
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={() => globalThis.history.back()}
              variant="outline"
              className="flex-1"
            >
              Go Back
            </Button>
            <Button
              onClick={() => globalThis.location.href = "/"}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            >
              Go to Home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
