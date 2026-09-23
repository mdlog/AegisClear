// Renders the real route table in memory, fed by the recorded fixtures (or a test double of ApiClient).
import { render } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { Providers } from "@/app/Providers";
import { appRoutes } from "@/app/router";
import type { ApiClient } from "@/lib/api/client";
import { createFixtureApi, type FixtureSet } from "@/lib/api/fixtures";

export interface RenderAppOptions { api?: ApiClient; set?: FixtureSet; speed?: number }

export function renderApp(url: string, opts: RenderAppOptions = {}) {
  const api = opts.api ?? createFixtureApi({ set: opts.set ?? "local", speed: opts.speed ?? 10_000 });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(appRoutes({ api, queryClient }), { initialEntries: [url] });
  const view = render(
    <Providers api={api} queryClient={queryClient}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { ...view, api, router, queryClient };
}
