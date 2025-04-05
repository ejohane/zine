import { defineConfig } from "drizzle-kit";
import * as fs from "fs";
import * as path from "path";

function getLocalD1DB() {
  try {
    const basePath = path.resolve(".wrangler");
    const dbFile = fs
      .readdirSync(basePath, { encoding: "utf-8", recursive: true })
      .find((f) => f.endsWith(".sqlite"));
    if (!dbFile) {
      throw new Error(`.sqlite file not found in ${basePath}`);
    }
    const url = path.resolve(basePath, dbFile);
    return url;
  } catch (err) {
    console.log(`Error: ${err.message}`);
  }
}

const isProduction = process.env.ENVIRONMENT === "production";

const config = isProduction
  ? defineConfig({
      dialect: "sqlite",
      schema: "./src/**/*.sql.ts",
      out: "./drizzle",
      driver: "d1-http",
      dbCredentials: {
        databaseId: "4746a303-2143-4573-8997-849d7b707607",
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID as string,
        token: process.env.CLOUDFLARE_API_TOKEN as string,
      },
    })
  : defineConfig({
      dialect: "sqlite",
      schema: "./src/**/*.sql.ts",
      out: "./drizzle",
      dbCredentials: {
        url: getLocalD1DB(),
      } as any,
    });

export default config;
