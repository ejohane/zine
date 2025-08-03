import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables from .drizzle.env if present
dotenv.config({ path: path.resolve(__dirname, ".drizzle.env") });

// Check if we're trying to connect to production
const isProduction = process.env.DRIZZLE_ENV === "production";

// Debug: Log environment variables (remove in production)
if (isProduction) {
  console.log("Connecting to production D1 database...");
  console.log("Account ID:", process.env.CLOUDFLARE_ACCOUNT_ID);
  console.log("Database ID:", process.env.CLOUDFLARE_DATABASE_ID);
  console.log("Token:", process.env.CLOUDFLARE_D1_TOKEN ? "Set" : "Not set");
}

export default isProduction
  ? defineConfig({
      schema: "./src/schema.ts",
      out: "./migrations",
      dialect: "sqlite",
      driver: "d1-http",
      dbCredentials: {
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
        databaseId: process.env.CLOUDFLARE_DATABASE_ID!,
        token: process.env.CLOUDFLARE_D1_TOKEN!,
        // accountId: "887513bb1f71a8ef2029e2f9bd3086b2",
        // databaseId: "9020d4fb-d780-4feb-bb6f-7c5a424f2835",
        // token: "6FyhhT-Vm5PTUfKRNZyKN7sV14F3NAj119Gf2i5f",
      },
    })
  : defineConfig({
      schema: "./src/schema.ts",
      out: "./migrations",
      dialect: "sqlite",
      dbCredentials: {
        url: "./local.db",
      },
    });

