const { hc } = require("hono/dist/client") as typeof import("hono/client");
import type { AppType } from "api";

const API_URL = process.env.EXPO_PUBLIC_API_URL as string;

export const client = hc<AppType>(API_URL);

export type Bookmarks = Awaited<ReturnType<typeof client.bookmarks.$get>>;
export type Bookmark = Awaited<ReturnType<Bookmarks["json"]>>["result"][number];
