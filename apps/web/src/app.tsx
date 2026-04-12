import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import {
  AddLinkPage,
  AppShell,
  AuthPage,
  HomePage,
  InboxPage,
  ItemDetailPage,
  LibraryPage,
  OAuthCallbackPage,
  ProtectedRoute,
  SettingsPage,
  SubscriptionSourcePage,
  SubscriptionsHubPage,
  WeeklyRecapPage,
} from './pages';

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
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<HomePage />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/add-link" element={<AddLinkPage />} />
          <Route path="/item/:id" element={<ItemDetailPage />} />
          <Route path="/subscriptions" element={<SubscriptionsHubPage />} />
          <Route path="/subscriptions/:source" element={<SubscriptionSourcePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/recap/weekly" element={<WeeklyRecapPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
