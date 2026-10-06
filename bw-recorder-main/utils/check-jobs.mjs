// Simple script to check upload jobs
import 'dotenv/config'
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../prisma/generated/client.js";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function checkJobs() {
  try {
    const jobs = await prisma.upload_job.findMany({
      orderBy: { created_at: "desc" },
      take: 10,
    });

    console.log("\n📊 Upload Jobs:");
    console.log("================\n");

    if (jobs.length === 0) {
      console.log("No upload jobs found.");
    } else {
      jobs.forEach((job) => {
        console.log(`ID: ${job.id}`);
        console.log(`Rapat ID: ${job.rapat_id}`);
        console.log(`File: ${job.file_name}`);
        console.log(`Status: ${job.status}`);
        console.log(`Progress: ${job.progress}%`);
        console.log(`Created: ${job.created_at}`);
        if (job.error_message) {
          console.log(`Error: ${job.error_message}`);
        }
        console.log("---");
      });
    }

    // Check pending jobs specifically
    const pendingJobs = jobs.filter((j) => j.status === "pending" || j.status === "processing");
    if (pendingJobs.length > 0) {
      console.log(`\n⚠️  ${pendingJobs.length} job(s) need processing!`);
    }
  } catch (error) {
    console.error("Error checking jobs:", error);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

checkJobs();
