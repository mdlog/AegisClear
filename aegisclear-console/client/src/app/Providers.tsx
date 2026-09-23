import type { ReactNode } from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { ApiClient } from "@/lib/api/client";
import { ApiContext } from "@/lib/api/queries";
import { AnnouncerProvider } from "@/ui/Announcer";

export function Providers({ api, queryClient, children }: { api: ApiClient; queryClient: QueryClient; children: ReactNode }) {
  return (
    <ApiContext.Provider value={api}>
      <QueryClientProvider client={queryClient}>
        <AnnouncerProvider>{children}</AnnouncerProvider>
      </QueryClientProvider>
    </ApiContext.Provider>
  );
}
