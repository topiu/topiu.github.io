import { describe, it, expect } from "vitest";
import {
  defaultBackupState,
  needsBackup,
  backupName,
  dateOfBackupName,
  daysBetween,
  backupAgeDays,
  backupAgeLabel,
  backupUrgency,
  staleNames,
  LATEST_NAME,
} from "../src/domain/backup";

const TODAY = "2026-07-28";

describe("when a backup is due", () => {
  it("is due when none has ever been taken", () => {
    expect(needsBackup(defaultBackupState(), TODAY)).toBe(true);
    expect(needsBackup(null, TODAY)).toBe(true);
  });
  it("is not due once taken today", () => {
    const s = { ...defaultBackupState(), lastDate: TODAY };
    expect(needsBackup(s, TODAY)).toBe(false);
  });
  it("is due again the next day", () => {
    const s = { ...defaultBackupState(), lastDate: "2026-07-27" };
    expect(needsBackup(s, TODAY)).toBe(true);
  });
  it("stays quiet for the rest of a day it was dismissed", () => {
    const s = { ...defaultBackupState(), snoozedFor: TODAY };
    expect(needsBackup(s, TODAY)).toBe(false);
  });
  it("but a dismissal does not carry into tomorrow", () => {
    const s = { ...defaultBackupState(), snoozedFor: "2026-07-27" };
    expect(needsBackup(s, TODAY)).toBe(true);
  });
});

describe("age and urgency", () => {
  it("counts whole days across a month boundary", () => {
    expect(daysBetween("2026-06-30", "2026-07-01")).toBe(1);
    expect(daysBetween("2026-07-01", "2026-07-28")).toBe(27);
  });
  it("counts whole days across a DST change", () => {
    /* European DST ends 2026-10-25; the rounding must not yield 0 or 2 */
    expect(daysBetween("2026-10-24", "2026-10-25")).toBe(1);
    expect(daysBetween("2026-10-25", "2026-10-26")).toBe(1);
  });
  it("labels the age in Finnish", () => {
    expect(backupAgeLabel(defaultBackupState(), TODAY)).toMatch(/ei ole vielä otettu/);
    expect(backupAgeLabel({ ...defaultBackupState(), lastDate: TODAY }, TODAY)).toMatch(/tänään/);
    expect(backupAgeLabel({ ...defaultBackupState(), lastDate: "2026-07-27" }, TODAY)).toMatch(/eilen/);
    expect(backupAgeLabel({ ...defaultBackupState(), lastDate: "2026-07-24" }, TODAY)).toBe(
      "Viimeisin varmuuskopio 4 päivää sitten."
    );
    expect(backupAgeDays({ ...defaultBackupState(), lastDate: "2026-07-24" }, TODAY)).toBe(4);
  });
  it("escalates only after three days", () => {
    expect(backupUrgency({ ...defaultBackupState(), lastDate: TODAY }, TODAY)).toBe("none");
    expect(backupUrgency({ ...defaultBackupState(), lastDate: "2026-07-27" }, TODAY)).toBe("due");
    expect(backupUrgency({ ...defaultBackupState(), lastDate: "2026-07-25" }, TODAY)).toBe("stale");
    /* never backed up at all is treated as stale, not merely due */
    expect(backupUrgency(defaultBackupState(), TODAY)).toBe("stale");
  });
});

describe("filenames and retention", () => {
  it("round-trips the date in the filename", () => {
    expect(backupName(TODAY)).toBe("liikepaivakirja-2026-07-28.json");
    expect(dateOfBackupName(backupName(TODAY))).toBe(TODAY);
    expect(dateOfBackupName("random.json")).toBeNull();
    expect(dateOfBackupName(LATEST_NAME)).toBeNull();
  });
  it("prunes only dated files past the window", () => {
    const names = [
      "liikepaivakirja-2026-07-28.json",
      "liikepaivakirja-2026-06-01.json",
      "liikepaivakirja-2025-12-31.json",
      LATEST_NAME,
      "verokortti.pdf",
      "notes.txt",
    ];
    expect(staleNames(names, TODAY, 30)).toEqual([
      "liikepaivakirja-2026-06-01.json",
      "liikepaivakirja-2025-12-31.json",
    ]);
  });
  it("never proposes deleting the latest file or unrelated files", () => {
    const out = staleNames([LATEST_NAME, "taxes.pdf", "IMG_0001.HEIC"], TODAY, 0);
    expect(out).toEqual([]);
  });
  it("keeps a file exactly on the boundary", () => {
    expect(staleNames(["liikepaivakirja-2026-06-28.json"], TODAY, 30)).toEqual([]);
  });
});
