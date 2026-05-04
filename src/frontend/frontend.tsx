/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `src/frontend/index.html`.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Routes, Route } from "react-router";
import { Toaster } from "sonner";
import { App } from "./App";
import { SettingsLayout } from "./components/SettingsLayout";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { PromptsListPage } from "./pages/PromptsListPage";
import { PromptCreatePage } from "./pages/PromptCreatePage";
import { PromptDetailPage } from "./pages/PromptDetailPage";
import { ApiKeysPage } from "./pages/ApiKeysPage";
import { ApiKeyDetailPage } from "./pages/ApiKeyDetailPage";
import { SettingsProfilePage } from "./pages/SettingsProfilePage";
import { SettingsIntegrationsPage } from "./pages/SettingsIntegrationsPage";
import { RequireAuth } from "./RequireAuth";
import { RedirectIfAuthed } from "./RedirectIfAuthed";

const elem = document.getElementById("root")!;
const tree = (
  <StrictMode>
    <BrowserRouter>
      <Toaster position="top-right" richColors closeButton />
      <Routes>
        {/* Public landing — redirects to /prompts if user is already logged in */}
        <Route
          path="/"
          element={
            <RedirectIfAuthed to="/prompts">
              <LandingPage />
            </RedirectIfAuthed>
          }
        />
        <Route path="/login" element={<LoginPage />} />

        {/* Authenticated app */}
        <Route
          element={
            <RequireAuth>
              <App />
            </RequireAuth>
          }
        >
          <Route path="/prompts" element={<PromptsListPage />} />
          <Route path="/prompts/new" element={<PromptCreatePage />} />
          <Route path="/prompts/:slug" element={<PromptDetailPage />} />
          <Route path="/settings" element={<SettingsLayout />}>
            <Route
              index
              element={<Navigate to="/settings/profile" replace />}
            />
            <Route path="profile" element={<SettingsProfilePage />} />
            <Route path="api-keys" element={<ApiKeysPage />} />
            <Route path="api-keys/:id" element={<ApiKeyDetailPage />} />
            <Route path="integrations" element={<SettingsIntegrationsPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>
);

if (import.meta.hot) {
  // With hot module reloading, `import.meta.hot.data` is persisted.
  const root = (import.meta.hot.data.root ??= createRoot(elem));
  root.render(tree);
} else {
  // The hot module reloading API is not available in production.
  createRoot(elem).render(tree);
}
