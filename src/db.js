import "dotenv/config";
import { neon, Pool } from "@neondatabase/serverless";

export const sql = neon(process.env.NEON_URL);

export const pool = new Pool({
    connectionString: process.env.NEON_URL
});

try {
    const result = await sql`SELECT NOW()`;
    console.log("✅ Neon database connected:", result[0]);
} catch (error) {
    console.error("❌ Neon database connection failed:", error.message);
}