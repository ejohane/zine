import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AuthPage } from './auth-page';
import { BookmarksPage } from './bookmarks-page';
import { ProtectedRoute } from './protected-route';
import { SettingsPage } from './settings-page';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/sign-in/*" element={<AuthPage mode="sign-in" />} />
        <Route path="/sign-up/*" element={<AuthPage mode="sign-up" />} />
        <Route
          path="/bookmarks"
          element={
            <ProtectedRoute>
              <BookmarksPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/bookmarks/:bookmarkId"
          element={
            <ProtectedRoute>
              <BookmarksPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/bookmarks" replace />} />
        <Route path="*" element={<Navigate to="/bookmarks" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
