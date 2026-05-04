/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `src/frontend/index.html`.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router";
import { App } from "./App";
import { LoginPage } from "./pages/LoginPage";
import { PromptsListPage } from "./pages/PromptsListPage";
import { PromptCreatePage } from "./pages/PromptCreatePage";
import { PromptDetailPage } from "./pages/PromptDetailPage";
import { ApiKeysPage } from "./pages/ApiKeysPage";
import { SettingsIntegrationsPage } from "./pages/SettingsIntegrationsPage";
import { RequireAuth } from "./RequireAuth";

const elem = document.getElementById("root")!;
const tree = (
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <App />
            </RequireAuth>
          }
        >
          <Route index element={<PromptsListPage />} />
          <Route path="prompts/new" element={<PromptCreatePage />} />
          <Route path="prompts/:slug" element={<PromptDetailPage />} />
          <Route path="settings/api-keys" element={<ApiKeysPage />} />
          <Route
            path="settings/integrations"
            element={<SettingsIntegrationsPage />}
          />
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
