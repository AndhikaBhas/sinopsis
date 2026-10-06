import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
import { Pool } from "pg";
import { PrismaClient } from "./generated/client";

// Create a connection pool for better performance
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10, // Maximum number of clients in the pool (reduced from 20)
  min: 2, // Minimum number of clients to maintain
  idleTimeoutMillis: 60000, // Close idle clients after 60 seconds (increased from 30)
  connectionTimeoutMillis: 10000, // Return an error after 10 seconds (increased from 2)
  allowExitOnIdle: true, // Allow the pool to close when all connections are idle
});

// Handle pool errors
pool.on("error", (err) => {
  console.error("Unexpected error on idle database client", err);
});

const adapter = new PrismaPg(pool);

// Use singleton pattern to avoid creating multiple Prisma instances
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
