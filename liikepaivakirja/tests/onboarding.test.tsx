/* Own file so it gets its own fake-indexeddb: the first-run card only shows on a
   genuinely empty diary, and the other mount tests leave entries behind.
   Each test resets the two keys it depends on rather than relying on the order
   it happens to run in — undo state is per-mount React state, so a later mount
   cannot walk back what an earlier one recorded. */
// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { render, waitFor, fireEvent, within } from "@testing-library/react";
import App from "../src/ui/App";
import { saveJSONNow } from "../src/storage/store";

const emptyDiary = async () => {
  await saveJSONNow("physio-logs", {});
  await saveJSONNow("physio-marks", []);
  await saveJSONNow("physio-psfs", { activities: [], entries: {} });
  await saveJSONNow("physio-ui", {});
};

describe("first run", () => {
  beforeEach(emptyDiary);

  it("welcomes an empty diary and points at the three things that matter", async () => {
    const { container } = render(<App />);
    const q = within(container);
    await waitFor(() => expect(q.getByText("Tervetuloa")).toBeTruthy());
    expect(q.getByText("Muokkaa liikkeet")).toBeTruthy();
    expect(q.getByText("Lue ohjeet")).toBeTruthy();
    /* the restore offer, for an empty diary that is lost rather than new */
    expect(q.getByText(/Onko sinulla varmuuskopio/)).toBeTruthy();
  });

  it("retires itself once anything is logged, with no dismissal needed", async () => {
    const { container } = render(<App />);
    const q = within(container);
    await waitFor(() => expect(q.getByText("Tervetuloa")).toBeTruthy());
    fireEvent.click(q.getByText("Merkitse ohjelma tehdyksi"));
    await waitFor(() => expect(q.queryByText("Tervetuloa")).toBeNull());
  });

  it("stays dismissed across mounts when waved away", async () => {
    const first = render(<App />);
    const q1 = within(first.container);
    await waitFor(() => expect(q1.getByText("Tervetuloa")).toBeTruthy());
    fireEvent.click(q1.getByLabelText("Piilota ohje"));
    await waitFor(() => expect(q1.queryByText("Tervetuloa")).toBeNull());

    const second = render(<App />);
    const q2 = within(second.container);
    await waitFor(() => expect(q2.getByText("Tänään")).toBeTruthy());
    expect(q2.queryByText("Tervetuloa")).toBeNull();
  });
});

describe("help panel", () => {
  it("opens from the header at any time and expands one section at a time", async () => {
    const { container } = render(<App />);
    const q = within(container);
    fireEvent.click(await waitFor(() => q.getByLabelText("Ohjeet ja tietoja")));

    const panel = within(document.body);
    /* opens as a list of questions, nothing expanded */
    await waitFor(() => expect(panel.getByText("Missä tiedot ovat")).toBeTruthy());
    expect(panel.queryByText(/Ei tiliä, ei palvelinta/)).toBeNull();

    fireEvent.click(panel.getByText("Missä tiedot ovat"));
    await waitFor(() => expect(panel.getByText(/Ei tiliä, ei palvelinta/)).toBeTruthy());

    /* opening another closes the first, so the panel never becomes a wall */
    fireEvent.click(panel.getByText("PSFS — toimintakyky"));
    await waitFor(() => expect(panel.queryByText(/Ei tiliä, ei palvelinta/)).toBeNull());
  });
});
