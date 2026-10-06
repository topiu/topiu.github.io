/* First setup, mounted: a template replaces the example programme in two taps,
   Muokkaa adds a template without touching what exists, and the compact
   editor sets a target in one tap. Own file, own store. */
// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanup, render, waitFor, fireEvent, within } from "@testing-library/react";
import App from "../src/ui/App";
import { deleteKey, loadJSON } from "../src/storage/store";

beforeEach(async () => {
  for (const k of ["physio-config", "physio-logs", "physio-marks", "physio-psfs", "physio-ui"]) await deleteKey(k);
});
afterEach(() => cleanup());

const body = () => within(document.body);

describe("first setup", () => {
  it("replaces the example programme with a template from the welcome card", async () => {
    const { container } = render(<App />);
    const q = within(container);
    fireEvent.click(await waitFor(() => q.getByText("Valitse valmis pohja")));
    fireEvent.click(await waitFor(() => body().getByText("Kahvakuula perus")));
    expect(body().getByText(/Tavoitteet ovat tyypillisiä aloitusarvoja/)).toBeTruthy();
    fireEvent.click(body().getByText("Ota käyttöön"));
    await waitFor(() => expect(q.getByText("Kahvakuulaheilautus")).toBeTruthy());
    expect(q.queryByText("Tarjoilijankumarrus")).toBeNull(); /* the example is gone */
    const cfg: any = await loadJSON("physio-config", null);
    expect(cfg.exercises.map((e: any) => e.name)).toContain("Turkkilainen nousu kahvakuulalla");
    expect(cfg.exercises[0].dose).toMatchObject({ sets: 3, reps: 15 });
  });

  it("keeps an emptied programme empty across a reload", async () => {
    const { container, unmount } = render(<App />);
    const q = within(container);
    fireEvent.click(await waitFor(() => q.getByText("Valitse valmis pohja")));
    fireEvent.click(await waitFor(() => body().getByText("Tyhjä")));
    fireEvent.click(body().getByText("Ota käyttöön"));
    await waitFor(() => expect(q.getByText("Ei liikkeitä vielä.")).toBeTruthy());
    unmount();
    const again = within(render(<App />).container);
    await waitFor(() => expect(again.getByText("Ei liikkeitä vielä.")).toBeTruthy());
  });

  it("adds a template from Muokkaa and sets a target with one tap", async () => {
    const { container } = render(<App />);
    const q = within(container);
    fireEvent.click(await waitFor(() => q.getAllByText("Muokkaa")[0]));
    fireEvent.click(await waitFor(() => q.getByText("Pohjasta")));
    fireEvent.click(await waitFor(() => body().getByText("Koko keho · kehonpaino")));
    fireEvent.click(body().getByText(/^Lisää \d+ liikettä$/));
    await waitFor(() => expect(q.getByLabelText("Muokkaa: Punnerrus")).toBeTruthy());
    /* the example programme is still there */
    expect(q.getByLabelText("Muokkaa: Tarjoilijankumarrus")).toBeTruthy();

    fireEvent.click(q.getByLabelText("Muokkaa: Tarjoilijankumarrus"));
    fireEvent.click(await waitFor(() => q.getByText("3 × 12")));
    await waitFor(async () => {
      const cfg: any = await loadJSON("physio-config", null);
      expect(cfg.exercises.find((e: any) => e.name === "Tarjoilijankumarrus").dose).toMatchObject({ sets: 3, reps: 12 });
      const marks: any = await loadJSON("physio-marks", []);
      expect(marks.some((m: any) => /Tavoite: Tarjoilijankumarrus: ei tavoitetta → 3 × 12/.test(m.text))).toBe(true);
    });
  });
});
