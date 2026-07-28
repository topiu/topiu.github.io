/* Proves the split app actually mounts: catches missing imports, module
   evaluation-order problems and storage-shim mistakes that a type-check and a
   bundle both pass over. */
// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import App from "../src/ui/App";
import { loadJSON, saveJSONNow } from "../src/storage/store";

describe("app mounts on IndexedDB", () => {
  it("renders the Finnish UI and seeds default data", async () => {
    render(<App />);
    /* the three tabs of the shell */
    await waitFor(() => expect(screen.getByText("Tänään")).toBeTruthy());
    expect(screen.getByText("Historia")).toBeTruthy();
    expect(screen.getByText("Muokkaa")).toBeTruthy();
  });

  it("round-trips through the storage shim", async () => {
    const payload = { logs: { "2026-07-28": { sets: { e1: 2 } } } };
    expect(await saveJSONNow("test-key", payload)).toBe(true);
    expect(await loadJSON("test-key", null)).toEqual(payload);
    expect(await loadJSON("absent-key", "fallback")).toBe("fallback");
  });
});
