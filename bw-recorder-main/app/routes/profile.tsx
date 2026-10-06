import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { getCurrentUser } from "../lib/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getCurrentUser(request);
  if (!user) return redirect("/login");
  return { user };
}

export default function Profile() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Profile</h1>
      <p>Profile details are shown in the header dropdown. This page can be extended to edit profile information.</p>
    </div>
  );
}
