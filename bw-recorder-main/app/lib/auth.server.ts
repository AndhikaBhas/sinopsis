import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import prisma from "../../prisma/client.server";

const SESSION_COOKIE = "sinopsis_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export async function registerUser({ email, password, name }: { email: string; password: string; name?: string }) {
  try {
    const p = prisma as any;
    const existing = await p.user.findUnique({ where: { email } });
    if (existing) throw new Error("User already exists");

    const salt = randomBytes(16).toString("hex");
    const derived = scryptSync(password, salt, 64).toString("hex");
    const hashedPassword = `${salt}:${derived}`;
    const user = await p.user.create({ data: { email, name, hashedPassword } });
    return user;
  } catch (err) {
    console.error("auth.registerUser error:", err);
    throw err;
  }
}

export async function verifyCredentials(email: string, password: string) {
  try {
    const p = prisma as any;
    const user = await p.user.findUnique({ where: { email } });
    if (!user) return null;
    
    // Check if user is approved by administrator
    if (!user.approved) {
      return { error: "pending_approval" };
    }
    
    const [salt, derived] = (user.hashedPassword as string).split(":");
    const attempt = scryptSync(password, salt, 64).toString("hex");
    const ok = timingSafeEqual(Buffer.from(attempt, "hex"), Buffer.from(derived, "hex"));
    return ok ? { id: user.id, email: user.email, name: user.name } : null;
  } catch (err) {
    console.error("auth.verifyCredentials error:", err);
    return null;
  }
}

export function createSessionCookie(user: { id: number }) {
  const value = JSON.stringify({ userId: user.id });
  // Simple cookie serialization
  const cookie = `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Max-Age=${SESSION_MAX_AGE}; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
  return cookie;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Max-Age=0`;
}

export function parseSessionCookie(request: Request) {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((p) => p.trim());
  const kv = parts.map((p) => p.split("=")).find((pair) => pair[0] === SESSION_COOKIE);
  if (!kv) return null;
  const raw = decodeURIComponent(kv[1] ?? "");
  try {
    const data = JSON.parse(raw);
    if (data && typeof data.userId === "number") return data as { userId: number };
  } catch (err) {
    console.error("auth.parseSessionCookie JSON parse error:", err);
  }
  return null;
}

export async function getCurrentUser(request: Request) {
  const session = parseSessionCookie(request);
  if (!session) return null;
  try {
    const p = prisma as any;
    const user = await p.user.findUnique({ 
      where: { id: session.userId },
      include: {
        userRoles: {
          where: {
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: new Date() } }
            ]
          },
          include: {
            role: true
          }
        }
      }
    });
    if (!user) return null;
    
    // Filter active roles and get primary role (first active role)
    const activeUserRoles = user.userRoles?.filter((ur: any) => ur.role?.isActive) || [];
    const primaryRole = activeUserRoles[0]?.role?.name || null;
    
    return { 
      id: user.id, 
      email: user.email, 
      name: user.name,
      approved: user.approved,
      role: primaryRole
    };
  } catch (err) {
    console.error("auth.getCurrentUser error:", err);
    return null;
  }
}
