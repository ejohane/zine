import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';

import { AuthPage } from './auth-page';
import { BookmarksPage } from './bookmarks-page';
import { HomePage, InboxPage, LibraryPage, SearchPage } from './mobile-parity-pages';
import { OAuthCallbackPage } from './oauth-callback-page';
import { PwaProvider } from './lib/pwa';
import { ProtectedRoute } from './protected-route';
import { PwaSupport } from './pwa-support';
import { SettingsPage } from './settings-page';
import { WelcomePage } from './welcome-page';

function LegacyBookmarksRedirect({ detail = false }: { detail?: boolean }) {
  const { bookmarkId } = useParams<{ bookmarkId: string }>();
  const location = useLocation();

  if (detail) {
    return <Navigate to={`/item/${bookmarkId ?? ''}${location.search}`} replace />;
  }

  return <Navigate to={`/library/bookmarks${location.search}`} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <PwaProvider>
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
            path="/home"
            element={
              <ProtectedRoute>
                <HomePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inbox"
            element={
              <ProtectedRoute>
                <InboxPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/search"
            element={
              <ProtectedRoute>
                <SearchPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/library/bookmarks"
            element={
              <ProtectedRoute>
                <BookmarksPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/library/people"
            element={
              <ProtectedRoute>
                <LibraryPage object="people" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/library/sources"
            element={
              <ProtectedRoute>
                <LibraryPage object="sources" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/library/collections"
            element={
              <ProtectedRoute>
                <LibraryPage object="collections" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/item/:bookmarkId"
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
          <Route
            path="/welcome"
            element={
              <ProtectedRoute>
                <WelcomePage />
              </ProtectedRoute>
            }
          />
          <Route path="/bookmarks" element={<LegacyBookmarksRedirect />} />
          <Route path="/bookmarks/:bookmarkId" element={<LegacyBookmarksRedirect detail />} />
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
        <PwaSupport />
      </PwaProvider>
    </BrowserRouter>
  );
}
