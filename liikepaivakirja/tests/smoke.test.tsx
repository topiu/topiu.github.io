/* Proves the split app actually mounts: catches missing imports, module
   evaluation-order problems and storage-shim mistakes that a type-check and a
   bundle both pass over. */
// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
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

describe("daily backup reminder", () => {
  it("prompts when no backup exists and stops for the day when dismissed", async () => {
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText("Päivän varmuuskopio puuttuu")).toBeTruthy()
    );
    /* never backed up counts as stale, so it explains the eviction risk */
    expect(screen.getByText(/Selain voi tyhjentää tallennustilan/)).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Piilota tälle päivälle"));
    await waitFor(() =>
      expect(screen.queryByText("Päivän varmuuskopio puuttuu")).toBeNull()
    );
  });

  it("offers backup settings under Muokkaa", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getAllByText("Muokkaa").length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText("Muokkaa")[0]);
    await waitFor(() => expect(screen.getByText("Varmuuskopiot")).toBeTruthy());
    /* jsdom exposes neither the directory picker nor file sharing, so the
       download path must be the one on offer */
    expect(screen.getByText("Lataus")).toBeTruthy();
    expect((screen.getByText("Jaa") as HTMLButtonElement).disabled).toBe(true);
  });
});
