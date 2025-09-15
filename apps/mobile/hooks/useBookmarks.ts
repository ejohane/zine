// @ts-nocheck
import * as React from 'react';
const { useState, useEffect, useCallback } = React;
import { bookmarksApi } from '../lib/api';

interface Bookmark {
  id: string;
  title: string;
  url: string;
  description?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBookmarks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await bookmarksApi.getAll();
      setBookmarks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch bookmarks');
      console.error('Error fetching bookmarks:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const createBookmark = useCallback(async (bookmark: Partial<Bookmark>) => {
    try {
      setError(null);
      const newBookmark = await bookmarksApi.create(bookmark);
      setBookmarks(prev => [...prev, newBookmark]);
      return newBookmark;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create bookmark');
      console.error('Error creating bookmark:', err);
      throw err;
    }
  }, []);

  const updateBookmark = useCallback(async (id: string, updates: Partial<Bookmark>) => {
    try {
      setError(null);
      const updatedBookmark = await bookmarksApi.update(id, updates);
      setBookmarks(prev => prev.map(b => b.id === id ? updatedBookmark : b));
      return updatedBookmark;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update bookmark');
      console.error('Error updating bookmark:', err);
      throw err;
    }
  }, []);

  const deleteBookmark = useCallback(async (id: string) => {
    try {
      setError(null);
      await bookmarksApi.delete(id);
      setBookmarks(prev => prev.filter(b => b.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete bookmark');
      console.error('Error deleting bookmark:', err);
      throw err;
    }
  }, []);

  useEffect(() => {
    fetchBookmarks();
  }, [fetchBookmarks]);

  return {
    bookmarks,
    loading,
    error,
    refetch: fetchBookmarks,
    createBookmark,
    updateBookmark,
    deleteBookmark,
  };
}