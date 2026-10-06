import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { clearSessionCookie } from "../lib/auth.server";

export async function action({ request }: ActionFunctionArgs) {
  const headers = new Headers();
  headers.append("Set-Cookie", clearSessionCookie());
  return redirect("/", { headers });
}

export default function Logout() {
  return null;
}
