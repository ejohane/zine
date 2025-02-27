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

// export default defineConfig({
//   dialect: "sqlite",
//   schema: "./src/**/*.sql.ts",
//   out: "./drizzle",
//   driver: "d1-http",
//   dbCredentials: {
//     databaseId: "06dd0188-b014-405e-b9a5-19e3068c507f",
//     accountId: process.env.CLOUDFLARE_ACCOUNT_ID as string,
//     token: process.env.CLOUDFLARE_API_TOKEN as string,
//   },
// });

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/**/*.sql.ts",
  out: "./drizzle",
  // dbCredentials: {
  // 	databaseId: "06dd0188-b014-405e-b9a5-19e3068c507f",
  // 	accountId: process.env.CLOUDFLARE_ACCOUNT_ID as string,
  // 	token: process.env.CLOUDFLARE_API_TOKEN as string,
  // },
  dbCredentials: {
    url: getLocalD1DB(),
  } as any,
});
