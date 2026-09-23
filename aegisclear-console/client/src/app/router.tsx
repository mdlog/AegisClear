// Route table (LAYOUT_SPEC routing patterns): a data router with a root loader, one lazy chunk per page.
import { redirect, type RouteObject, type ShouldRevalidateFunctionArgs } from "react-router";
import { AppShell, ShellFallback } from "./AppShell";
import { channelLoader, rootLoader, runLoader, type AppDeps } from "./loaders";
import { RouteError } from "./RouteError";

/** Search-param-only changes (`?ch=`, `?leak=`, registry filters) never refetch a loader. */
const skipSearchOnly = ({ currentUrl, nextUrl, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) =>
  currentUrl.pathname === nextUrl.pathname ? false : defaultShouldRevalidate;

export function appRoutes(deps: AppDeps): RouteObject[] {
  return [
    {
      id: "root",
      path: "/",
      Component: AppShell,
      HydrateFallback: ShellFallback,
      ErrorBoundary: RouteError,
      loader: rootLoader(deps),
      shouldRevalidate: ({ currentUrl, nextUrl, defaultShouldRevalidate }) =>
        currentUrl.pathname === nextUrl.pathname && currentUrl.search === nextUrl.search ? defaultShouldRevalidate : false,
      children: [
        { index: true, lazy: () => import("@/routes/desk/Desk").then((m) => ({ Component: m.Desk })) },
        { path: "runs", loader: () => redirect("/#session-runs") },
        {
          path: "runs/:runId",
          loader: runLoader(deps),
          shouldRevalidate: skipSearchOnly,
          lazy: () => import("@/routes/run/RunView").then((m) => ({ Component: m.RunView })),
        },
        { path: "channels", lazy: () => import("@/routes/registry/Registry").then((m) => ({ Component: m.Registry })) },
        {
          path: "channels/:address",
          loader: channelLoader(deps),
          shouldRevalidate: skipSearchOnly,
          lazy: () => import("@/routes/channel/ChannelRecord").then((m) => ({ Component: m.ChannelRecord })),
        },
        { path: "offer", lazy: () => import("@/routes/offer/OfferView").then((m) => ({ Component: m.OfferView })) },
        { path: "deployment", lazy: () => import("@/routes/deployment/Deployment").then((m) => ({ Component: m.Deployment })) },
        { path: "*", lazy: () => import("@/routes/not-found/NotFound").then((m) => ({ Component: m.NotFound })) },
      ],
    },
  ];
}
