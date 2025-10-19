import { defineConfig } from "drizzle-kit";
import { readdirSync } from "fs";
import { join } from "path";

const wranglerStateDir = "./.wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const dbFile = readdirSync(wranglerStateDir).find((f) => f.endsWith(".sqlite"));

if (!dbFile) {
  throw new Error("No SQLite database found in Wrangler state directory");
}

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: join(wranglerStateDir, dbFile),
  },
});
