// One title per page (WCAG 2.4.2 Page Titled): screen readers announce it and every browser tab can be told apart.
import { useEffect } from "react";
import { pageTitle } from "@/copy/en";

export function useDocumentTitle(page: string) {
  useEffect(() => {
    document.title = pageTitle(page);
  }, [page]);
}
