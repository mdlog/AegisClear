// @vitest-environment jsdom
// LAYOUT_SPEC "Keyboard" and README §1.1 C8: n, r, l, ? and Esc; inactive in form fields; a persisted switch turns
// single-key shortcuts off (WCAG 2.1.4); every shortcut has a visible, clickable equivalent.
import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "@/test/app";

beforeEach(() => localStorage.clear());

const shell = () => screen.findByRole("navigation", { name: "Main" });

describe("keyboard shortcuts", () => {
  it("opens the shortcut list with ?, and closes it with Esc", async () => {
    renderApp("/channels");
    await shell();
    await userEvent.keyboard("?");
    const dialog = await screen.findByRole("dialog", { name: "Keyboard shortcuts" });
    expect(dialog).toHaveTextContent("Go to the Desk and focus the featured Run");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("opens the same list from the Shortcuts button, and gives focus back to it on close", async () => {
    renderApp("/channels");
    await shell();
    const button = screen.getByRole("button", { name: "Shortcuts" });
    await userEvent.click(button);
    await screen.findByRole("dialog", { name: "Keyboard shortcuts" });
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(button).toHaveFocus());
  });

  it("n goes to the Desk and focuses the featured Run", async () => {
    const { router } = renderApp("/channels");
    await shell();
    await userEvent.keyboard("n");
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Run dispute" })).toHaveFocus());
  });

  it("r opens the latest run of the session", async () => {
    const { router } = renderApp("/");
    await screen.findByRole("region", { name: /Latest run/ });
    await userEvent.keyboard("r");
    await waitFor(() => expect(router.state.location.pathname).toBe("/runs/mudg39dg-1815b0"));
  });

  it("r says so when the session has no run yet", async () => {
    const { router } = renderApp("/", { set: "testnet" });
    await screen.findByText("No runs in this server session yet.");
    await userEvent.keyboard("r");
    expect(await screen.findByText("No run yet")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
  });

  it("l runs the leak check on a finished run", async () => {
    renderApp("/runs/mudg1f4b-60a0fd");
    await screen.findByRole("button", { name: "Check for leaks" });
    await userEvent.keyboard("l");
    expect(await screen.findByRole("group", { name: "Leak check" })).toHaveTextContent("5");
  });

  it("stays out of the way while a form field has focus", async () => {
    const { router } = renderApp("/channels");
    const mode = await screen.findByRole("combobox", { name: "Mode" });
    mode.focus();
    await userEvent.keyboard("n");
    expect(router.state.location.pathname).toBe("/channels");
  });

  it("can be switched off in the list, and the choice is remembered", async () => {
    const { router } = renderApp("/channels");
    await shell();
    await userEvent.keyboard("?");
    await userEvent.click(await screen.findByRole("checkbox", { name: /Single-key shortcuts/ }));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await userEvent.keyboard("n");
    await userEvent.keyboard("?");
    expect(router.state.location.pathname).toBe("/channels");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(localStorage.getItem("aegis-shortcuts")).toBe("off");
  });
});
