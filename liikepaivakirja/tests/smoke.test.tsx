/* Proves the split app actually mounts: catches missing imports, module
   evaluation-order problems and storage-shim mistakes that a type-check and a
   bundle both pass over. */
// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import App from "../src/ui/App";
import { loadJSON, saveJSONNow } from "../src/storage/store";
import { maybeSnapshot } from "../src/storage/backup";

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

describe("restore", () => {
  it("is collapsed under Muokkaa and reports honestly when there is nothing to restore", async () => {
    const { container } = render(<App />);
    const q = within(container);
    await waitFor(() => expect(q.getAllByText("Muokkaa").length).toBeGreaterThan(0));
    fireEvent.click(q.getAllByText("Muokkaa")[0]);
    const toggle = await waitFor(() => q.getByText("Palauta tai tarkista varmuuskopio"));
    /* the destructive controls are behind a deliberate tap */
    expect(q.queryByText("Laitteen sisäiset kopiot")).toBeNull();
    fireEvent.click(toggle);
    await waitFor(() => expect(q.getByText("Laitteen sisäiset kopiot")).toBeTruthy());
    expect(q.getByText("Valitse tiedosto ja tarkista")).toBeTruthy();
  });

  it("lists a real snapshot and shows what restoring it would change", async () => {
    /* App has seeded physio-config by now, so there is something to snapshot */
    expect(await maybeSnapshot()).toBe(true);

    const { container } = render(<App />);
    const q = within(container);
    await waitFor(() => expect(q.getAllByText("Muokkaa").length).toBeGreaterThan(0));
    fireEvent.click(q.getAllByText("Muokkaa")[0]);
    fireEvent.click(await waitFor(() => q.getByText("Palauta tai tarkista varmuuskopio")));

    /* the snapshot list is read asynchronously from IndexedDB */
    const row = await waitFor(() => {
      const el = q.queryByText(/päivää ·/);
      if (!el) throw new Error("no snapshot row yet");
      return el;
    });
    fireEvent.click(row);

    /* picking one never applies it — you get the diff and a separate confirm */
    await waitFor(() => expect(q.getByText("Palauta")).toBeTruthy());
    expect(q.getByText("Peruuta")).toBeTruthy();
    expect(q.getByText("Päiviä")).toBeTruthy();
  });
});

describe("one-tap programme", () => {
  it("fills every exercise still owed, then offers a way back", async () => {
    const { container } = render(<App />);
    const q = within(container);
    const btn = await waitFor(() => q.getByText("Merkitse ohjelma tehdyksi"));
    fireEvent.click(btn);

    /* the button is gone because nothing is owed any more, and the undo bar
       replaces it rather than sitting alongside */
    await waitFor(() => expect(q.getByText("Kumoa")).toBeTruthy());
    expect(q.queryByText("Merkitse ohjelma tehdyksi")).toBeNull();
    expect(q.getByText(/merkittiin tehdyksi/)).toBeTruthy();

    fireEvent.click(q.getByText("Kumoa"));
    await waitFor(() => expect(q.getByText("Merkitse ohjelma tehdyksi")).toBeTruthy());
    expect(q.queryByText("Kumoa")).toBeNull();
  });
});

describe("weekly prescription", () => {
  it("shows a weekly counter once an exercise is set below daily", async () => {
    const { container } = render(<App />);
    const q = within(container);
    await waitFor(() => expect(q.getAllByText("Muokkaa").length).toBeGreaterThan(0));
    fireEvent.click(q.getAllByText("Muokkaa")[0]);

    /* every exercise starts daily, so no counter is shown yet */
    await waitFor(() => expect(q.getAllByText("päivittäin").length).toBeGreaterThan(0));
    /* four taps down: 7 -> 3 */
    const fewer = q.getAllByLabelText("Harvemmin")[0];
    for (let i = 0; i < 4; i++) fireEvent.click(fewer);
    await waitFor(() => expect(q.getAllByText("3× viikossa").length).toBeGreaterThan(0));

    fireEvent.click(q.getAllByText("Tänään")[0]);
    /* the badge reads done/target for the current week */
    await waitFor(() => expect(q.getByText(/^\d+\/3 vk$/)).toBeTruthy());
  });
});

describe("symptom logging", () => {
  it("takes one tap to flare and grade, and one more to undo it", async () => {
    const { container } = render(<App />);
    const q = within(container);
    const moderate = await waitFor(() => q.getByLabelText("Nivunen: kohtalainen"));

    /* nothing is flared until asked: the quality row is the tell */
    expect(q.queryByText("Laatu:")).toBeNull();
    expect(moderate.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(moderate);
    /* one tap did both jobs — the symptom is flared and graded */
    await waitFor(() => expect(q.getByLabelText("Nivunen: kohtalainen").getAttribute("aria-pressed")).toBe("true"));
    expect(q.getByText("Laatu:")).toBeTruthy();
    expect(q.getByLabelText("Nivunen: lievä").getAttribute("aria-pressed")).toBe("false");

    /* tapping the active level clears the whole entry */
    fireEvent.click(q.getByLabelText("Nivunen: kohtalainen"));
    await waitFor(() => expect(q.queryByText("Laatu:")).toBeNull());
    expect(q.getByLabelText("Nivunen: kohtalainen").getAttribute("aria-pressed")).toBe("false");
  });

  it("changes level in one tap without clearing the entry", async () => {
    const { container } = render(<App />);
    const q = within(container);
    fireEvent.click(await waitFor(() => q.getByLabelText("Selkä: lievä")));
    await waitFor(() => expect(q.getByLabelText("Selkä: lievä").getAttribute("aria-pressed")).toBe("true"));

    fireEvent.click(q.getByLabelText("Selkä: kova"));
    await waitFor(() => expect(q.getByLabelText("Selkä: kova").getAttribute("aria-pressed")).toBe("true"));
    expect(q.getByLabelText("Selkä: lievä").getAttribute("aria-pressed")).toBe("false");
    /* still one entry, not two */
    expect(q.getAllByText("Laatu:").length).toBe(1);

    fireEvent.click(q.getByLabelText("Poista merkintä: Selkä"));
    await waitFor(() => expect(q.queryByText("Laatu:")).toBeNull());
  });

  it("keeps quality optional and independent of level", async () => {
    const { container } = render(<App />);
    const q = within(container);
    fireEvent.click(await waitFor(() => q.getByLabelText("Pakara: kova")));
    const ache = await waitFor(() => q.getByText("jomotus"));
    expect(ache.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(ache);
    await waitFor(() => expect(q.getByText("jomotus").getAttribute("aria-pressed")).toBe("true"));
    /* level survives setting a quality */
    expect(q.getByLabelText("Pakara: kova").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(q.getByLabelText("Poista merkintä: Pakara"));
    await waitFor(() => expect(q.queryByText("Laatu:")).toBeNull());
  });
});

describe("offline settings", () => {
  it("shows the running version and offers a way to switch offline off", async () => {
    const { container } = render(<App />);
    const q = within(container);
    await waitFor(() => expect(q.getAllByText("Muokkaa").length).toBeGreaterThan(0));
    fireEvent.click(q.getAllByText("Muokkaa")[0]);

    await waitFor(() => expect(q.getByText("Offline ja versio")).toBeTruthy());
    /* the build identifier is the thing that answers "did the deploy land" */
    expect(q.getByText("Versio")).toBeTruthy();
    /* jsdom has no ServiceWorkerContainer, so the honest status is "not supported"
       and the switch is disabled rather than pretending to work */
    const toggle = q.getByLabelText("Offline-tila");
    expect(q.getByText("Ei tuettu tässä selaimessa")).toBeTruthy();
    expect(toggle.hasAttribute("disabled")).toBe(true);
    /* and the escape hatch is documented where someone stuck would look for it */
    expect(q.getByText(/\?sw=off/)).toBeTruthy();
  });
});
