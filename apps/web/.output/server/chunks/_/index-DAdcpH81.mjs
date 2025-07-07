import { jsx, jsxs } from 'react/jsx-runtime';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

z.object({
  id: z.string(),
  url: z.string().url().optional(),
  title: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});
const CreateBookmarkSchema = z.object({
  url: z.string().url().optional(),
  title: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional()
});
CreateBookmarkSchema.partial();
const mockBookmarks = [
  { id: "1", title: "GitHub - React", url: "https://github.com/facebook/react" },
  { id: "2", title: "TanStack Query Documentation", url: "https://tanstack.com/query" },
  { id: "3", title: "Vite Documentation", url: "https://vitejs.dev" },
  { id: "4", title: "Cloudflare Workers", url: "https://workers.cloudflare.com" },
  { id: "5", title: "TypeScript Handbook", url: "https://www.typescriptlang.org/docs" }
];
class InMemoryBookmarkRepository {
  constructor() {
    this.bookmarks = [...mockBookmarks];
    this.nextId = 6;
  }
  async getAll() {
    return this.bookmarks;
  }
  async getById(id) {
    return this.bookmarks.find((b) => b.id === id) || null;
  }
  async create(bookmark) {
    const newBookmark = {
      id: String(this.nextId++),
      ...bookmark,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    };
    this.bookmarks.push(newBookmark);
    return newBookmark;
  }
  async update(id, bookmark) {
    const index = this.bookmarks.findIndex((b) => b.id === id);
    if (index === -1) return null;
    this.bookmarks[index] = {
      ...this.bookmarks[index],
      ...bookmark,
      updatedAt: /* @__PURE__ */ new Date()
    };
    return this.bookmarks[index];
  }
  async delete(id) {
    const index = this.bookmarks.findIndex((b) => b.id === id);
    if (index === -1) return false;
    this.bookmarks.splice(index, 1);
    return true;
  }
}
class BookmarkService {
  constructor(repository) {
    this.repository = repository;
  }
  async getBookmarks() {
    try {
      const bookmarks = await this.repository.getAll();
      return { data: bookmarks };
    } catch (error) {
      return { error: "Failed to fetch bookmarks" };
    }
  }
  async getBookmark(id) {
    try {
      const bookmark = await this.repository.getById(id);
      if (!bookmark) {
        return { error: "Bookmark not found" };
      }
      return { data: bookmark };
    } catch (error) {
      return { error: "Failed to fetch bookmark" };
    }
  }
  async createBookmark(bookmark) {
    try {
      const newBookmark = await this.repository.create(bookmark);
      return { data: newBookmark, message: "Bookmark created successfully" };
    } catch (error) {
      return { error: "Failed to create bookmark" };
    }
  }
  async updateBookmark(id, bookmark) {
    try {
      const updatedBookmark = await this.repository.update(id, bookmark);
      if (!updatedBookmark) {
        return { error: "Bookmark not found" };
      }
      return { data: updatedBookmark, message: "Bookmark updated successfully" };
    } catch (error) {
      return { error: "Failed to update bookmark" };
    }
  }
  async deleteBookmark(id) {
    try {
      const deleted = await this.repository.delete(id);
      if (!deleted) {
        return { error: "Bookmark not found" };
      }
      return { message: "Bookmark deleted successfully" };
    } catch (error) {
      return { error: "Failed to delete bookmark" };
    }
  }
}
const bookmarkService = new BookmarkService(new InMemoryBookmarkRepository());
const fetchBookmarks = async () => {
  const response = await bookmarkService.getBookmarks();
  if (response.error) {
    throw new Error(response.error);
  }
  return response.data || [];
};
const useBookmarks = () => {
  return useQuery({
    queryKey: ["bookmarks"],
    queryFn: fetchBookmarks
  });
};
const SplitComponent = function Home() {
  const {
    data: bookmarks,
    isLoading,
    error
  } = useBookmarks();
  if (isLoading) return /* @__PURE__ */ jsx("div", { className: "p-2", children: "Loading bookmarks..." });
  if (error) return /* @__PURE__ */ jsxs("div", { className: "p-2", children: [
    "Error loading bookmarks: ",
    error.message
  ] });
  return /* @__PURE__ */ jsxs("div", { className: "p-2", children: [
    /* @__PURE__ */ jsx("h1", { className: "text-3xl font-bold", children: "Welcome to Zine" }),
    /* @__PURE__ */ jsx("p", { className: "mt-2", children: "Your personal bookmark manager" }),
    /* @__PURE__ */ jsxs("div", { className: "mt-6", children: [
      /* @__PURE__ */ jsx("h2", { className: "text-xl font-semibold mb-4", children: "Bookmarks" }),
      /* @__PURE__ */ jsx("ul", { className: "space-y-2", children: bookmarks == null ? void 0 : bookmarks.map((bookmark) => /* @__PURE__ */ jsx("li", { className: "p-2 border rounded", children: bookmark.title }, bookmark.id)) })
    ] })
  ] });
};

export { SplitComponent as component };
//# sourceMappingURL=index-DAdcpH81.mjs.map
