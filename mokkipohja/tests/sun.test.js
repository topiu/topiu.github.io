import { describe, expect, it } from "vitest";
import { compassPoint, siteOf, sunDirection, sunPosition } from "../src/domain/sun";

describe("where the sun is", () => {
  it("stands due south at midsummer noon, 53.4° up at 60°N", () => {
    // solar noon at 25°E is about 10:22 UT
    const s = sunPosition(new Date(Date.UTC(2026, 5, 21, 10, 22)), 60, 25);
    expect(Math.abs(s.azimuth - 180)).toBeLessThan(1);
    expect(s.elevation).toBeCloseTo(90 - 60 + 23.44, 0);
  });

  it("barely clears the horizon at midwinter noon", () => {
    const s = sunPosition(new Date(Date.UTC(2026, 11, 21, 10, 28)), 60, 25);
    expect(s.elevation).toBeCloseTo(90 - 60 - 23.44, 0);
  });

  it("stays up at midnight in Lapland in June, low in the north", () => {
    const s = sunPosition(new Date(Date.UTC(2026, 5, 21, 22, 20)), 69.9, 27);
    expect(s.elevation).toBeGreaterThan(0);
    expect(Math.min(s.azimuth, 360 - s.azimuth)).toBeLessThan(10);
  });

  it("rises in the east at the equinox", () => {
    // 06:00 by the sundial at 25°E on 20 March: 04:27 UT (1 h 40 min for the
    // longitude, and the sundial runs 7 minutes slow in March)
    const s = sunPosition(new Date(Date.UTC(2026, 2, 20, 4, 27)), 61, 25);
    expect(Math.abs(s.elevation)).toBeLessThan(1);
    expect(s.azimuth).toBeGreaterThan(80);
    expect(s.azimuth).toBeLessThan(100);
  });
});

describe("the sun on the plan", () => {
  it("puts south down the screen while north is up", () => {
    const d = sunDirection(180, 0, 0);
    expect(d.x).toBeCloseTo(0);
    expect(d.y).toBeCloseTo(1);
    expect(sunDirection(90, 0, 0).x).toBeCloseTo(1); // east is to the right
  });

  it("turns with the plan's north", () => {
    // north to the right of the screen: the northern sun is to the right too
    const d = sunDirection(0, 30, 90);
    expect(d.x).toBeCloseTo(Math.cos(Math.PI / 6));
    expect(d.y).toBeCloseTo(0);
    expect(d.up).toBeCloseTo(0.5);
  });

  it("names compass points and fills in a plan's site", () => {
    expect(compassPoint(0)).toBe("N");
    expect(compassPoint(224)).toBe("SW");
    expect(compassPoint(359)).toBe("N");
    expect(siteOf({})).toEqual({ north: 0, lat: 61, lon: 25 });
    expect(siteOf({ site: { north: 0, lat: 65.5 } })).toEqual({ north: 0, lat: 65.5, lon: 25 });
  });
});
