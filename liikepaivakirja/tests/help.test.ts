import { describe, it, expect } from "vitest";
import { FIRST_RUN, HELP_SECTIONS } from "../src/domain";

describe("help content", () => {
  it("has a unique id, a title and a body for every section", () => {
    const ids = HELP_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    HELP_SECTIONS.forEach((s) => {
      expect(s.id).toMatch(/^[a-z]+$/);
      expect(s.title.trim().length).toBeGreaterThan(0);
      expect(s.body.length).toBeGreaterThan(0);
      s.body.forEach((p) => expect(p.trim().length).toBeGreaterThan(0));
    });
  });

  /* The guard that matters. Data living only on the device is the single fact a
     user cannot afford to miss, and "tidying up for length" is exactly how that
     sentence would go missing. */
  it("still tells the user their data is local and must be backed up", () => {
    const data = HELP_SECTIONS.find((s) => s.id === "data");
    expect(data).toBeTruthy();
    const all = [...data!.body, data!.note || ""].join(" ").toLowerCase();
    expect(all).toContain("vain tässä laitteessa");
    expect(all).toContain("varmuuskopio");
  });

  it("mentions the escape hatch where someone stuck would look for it", () => {
    const offline = HELP_SECTIONS.find((s) => s.id === "offline");
    expect(offline!.body.join(" ")).toContain("?sw=off");
  });

  /* Help nobody reads because it is a wall of text is worse than no help. */
  it("stays short enough to actually be read", () => {
    HELP_SECTIONS.forEach((s) => {
      expect(s.body.length).toBeLessThanOrEqual(3);
      s.body.forEach((p) => expect(p.length).toBeLessThanOrEqual(400));
      if (s.note) expect(s.note.length).toBeLessThanOrEqual(260);
    });
    expect(HELP_SECTIONS.length).toBeLessThanOrEqual(10);
  });

  it("keeps the first-run card to three steps", () => {
    expect(FIRST_RUN.lines.length).toBe(3);
    FIRST_RUN.lines.forEach((l) => expect(l.length).toBeLessThanOrEqual(220));
    /* the backup warning belongs here too, not only buried in the help panel */
    expect(FIRST_RUN.lines.join(" ").toLowerCase()).toContain("varmuuskopio");
  });
});
