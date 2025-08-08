import { defineConfig } from "drizzle-kit";

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
