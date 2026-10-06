// Reset stuck job to retry
import 'dotenv/config'
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../prisma/generated/client.js";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const jobId = process.argv[2];

if (!jobId) {
  console.error("Usage: node reset-job.mjs <job-id>");
  process.exit(1);
}

try {
  const job = await prisma.upload_job.update({
    where: { id: jobId },
    data: {
      status: "pending",
      progress: 0,
      error_message: null,
    },
  });

  console.log(`✅ Job ${jobId} reset to pending`);
  console.log(`File: ${job.file_name}`);
  console.log(`Rapat ID: ${job.rapat_id}`);
} catch (error) {
  console.error("❌ Error resetting job:", error.message);
} finally {
  await prisma.$disconnect();
  await pool.end();
}
