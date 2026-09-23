import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// Component tests load lazy route chunks and recorded fixtures; under a parallel run 1 s is too tight.
configure({ asyncUtilTimeout: 3_000 });

// jsdom has no layout: ScrollRestoration's window.scrollTo is a no-op here instead of a "Not implemented" warning.
if (typeof window !== "undefined") window.scrollTo = () => {};

afterEach(() => cleanup());
