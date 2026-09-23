import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router";
// Bundled .woff2 only, no CDN (README §2.2 #4). Archivo's wdth.css carries both axes: wdth 62–125 and wght 100–900.
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource-variable/atkinson-hyperlegible-mono";
import "./styles/tokens.css";
import "./styles/global.css";
import "./styles/primitives.css";
import { Providers } from "./app/Providers";
import { appRoutes } from "./app/router";
import { createApi } from "./lib/api/client";

// A manual theme choice is applied before React renders; without one the OS preference decides.
try {
  const stored = localStorage.getItem("aegis-theme");
  if (stored === "light" || stored === "dark") document.documentElement.dataset.theme = stored;
} catch {
  /* storage unavailable (private window, blocked site data) */
}

const api = createApi();
const queryClient = new QueryClient();
const router = createBrowserRouter(appRoutes({ api, queryClient }));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Providers api={api} queryClient={queryClient}>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
);
