/* Proves the split app actually mounts: catches missing imports, module
   evaluation-order problems and storage-shim mistakes that a type-check and a
   bundle both pass over. */
// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
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

/* The two features below are mostly domain logic, but the wiring between App,
   Today, History and the print portal is exactly what a unit test cannot see.

   Note the `within(container)` scoping: this file runs without RTL's automatic
   cleanup (vitest globals are off, so its afterEach never registers), which is
   why the existing tests above reach for getAllByText. Every render therefore
   stays in the document and unscoped queries would match earlier mounts. */
describe("PSFS card", () => {
  it("appears on Tänään and explains itself before any activity exists", async () => {
    const { container } = render(<App />);
    const q = within(container);
    await waitFor(() => expect(q.getByText("Toimintakyky")).toBeTruthy());
    expect(q.getByPlaceholderText("esim. sukkien pukeminen")).toBeTruthy();
  });

  it("adds an activity and exposes the whole 0–10 scale for it", async () => {
    const { container } = render(<App />);
    const q = within(container);
    const input = await waitFor(() => q.getByPlaceholderText("esim. sukkien pukeminen"));
    fireEvent.change(input, { target: { value: "Sukkien pukeminen" } });
    fireEvent.click(q.getByLabelText("Lisää toiminto"));
    await waitFor(() => expect(q.getByText("Sukkien pukeminen")).toBeTruthy());
    /* both ends present, so the scale is whole and correctly bounded */
    expect(q.getByLabelText("Sukkien pukeminen: 0")).toBeTruthy();
    expect(q.getByLabelText("Sukkien pukeminen: 10")).toBeTruthy();
    fireEvent.click(q.getByLabelText("Sukkien pukeminen: 7"));
    await waitFor(() => expect(q.getByText("Keskiarvo")).toBeTruthy());
    /* "7/10" is the per-activity readout; a bare "7" would also match the scale button */
    expect(q.getByText("7/10")).toBeTruthy();
  });
});

describe("clinician report", () => {
  it("opens from Historia and offers all three ways out", async () => {
    const { container } = render(<App />);
    const q = within(container);
    await waitFor(() => expect(q.getByText("Historia")).toBeTruthy());
    fireEvent.click(q.getByText("Historia"));
    const open = await waitFor(() => q.getByText("Raportti fysioterapeutille"));
    fireEvent.click(open);

    /* the modal is portalled to <body> so it can be isolated for printing —
       which also means it is deliberately outside `container` */
    const portal = await waitFor(() => {
      const el = document.querySelector(".rpt-portal");
      if (!el) throw new Error("no portal");
      return within(el as HTMLElement);
    });
    expect(portal.getByText("Tulosta")).toBeTruthy();
    expect(portal.getByText("Lataa")).toBeTruthy();
    expect(portal.getByText("Kopioi")).toBeTruthy();
    /* the preview is the real document, not a placeholder */
    expect(portal.getByText("Harjoittelu")).toBeTruthy();
    expect(portal.getByText(/Miten luvut on laskettu/)).toBeTruthy();
    /* and it carries the PSFS activity added by the test above */
    expect(portal.getByText("Sukkien pukeminen")).toBeTruthy();
  });
});
