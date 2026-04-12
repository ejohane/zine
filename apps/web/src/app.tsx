import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';

import { AuthPage } from './auth-page';
import { BookmarksPage } from './bookmarks-page';
import { OAuthCallbackPage } from './oauth-callback-page';
import { ProtectedRoute } from './protected-route';
import { SettingsPage } from './settings-page';

function LegacyItemRedirect() {
  const { bookmarkId } = useParams<{ bookmarkId: string }>();

  if (!bookmarkId) {
    return <Navigate to="/bookmarks" replace />;
  }

  return <Navigate to={`/bookmarks/${bookmarkId}`} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/sign-in/*" element={<AuthPage mode="sign-in" />} />
        <Route path="/sign-up/*" element={<AuthPage mode="sign-up" />} />
        <Route
          path="/oauth/callback"
          element={
            <ProtectedRoute>
              <OAuthCallbackPage />
            </ProtectedRoute>
          }
        />
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
        <Route path="/item/:bookmarkId" element={<LegacyItemRedirect />} />
        <Route path="/" element={<Navigate to="/bookmarks" replace />} />
        <Route path="*" element={<Navigate to="/bookmarks" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
