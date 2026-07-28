// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  BUILD_ID,
  __resetSwState,
  getSwState,
  offlineEnabled,
  setOfflineEnabled,
  swOverrideFromSearch,
} from "../src/platform/sw";

describe("swOverrideFromSearch", () => {
  it("recognises the documented forms", () => {
    expect(swOverrideFromSearch("?sw=off")).toBe("off");
    expect(swOverrideFromSearch("?sw=on")).toBe("on");
    expect(swOverrideFromSearch("sw=off")).toBe("off"); /* leading ? optional */
  });

  it("accepts the shorthand, because that is what gets typed in a panic", () => {
    expect(swOverrideFromSearch("?nosw")).toBe("off");
    expect(swOverrideFromSearch("?nosw=1")).toBe("off");
    expect(swOverrideFromSearch("?foo=1&nosw")).toBe("off");
  });

  it("accepts boolean-ish spellings", () => {
    expect(swOverrideFromSearch("?sw=0")).toBe("off");
    expect(swOverrideFromSearch("?sw=false")).toBe("off");
    expect(swOverrideFromSearch("?sw=1")).toBe("on");
    expect(swOverrideFromSearch("?sw=TRUE")).toBe("on");
    expect(swOverrideFromSearch("?sw=Off")).toBe("off");
  });

  it("returns null when nothing was asked for, so the stored preference stands", () => {
    expect(swOverrideFromSearch("")).toBe(null);
    expect(swOverrideFromSearch("?other=1")).toBe(null);
    expect(swOverrideFromSearch("?sw=maybe")).toBe(null);
    expect(swOverrideFromSearch("?sw=")).toBe(null);
  });
});

describe("offline preference", () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetSwState();
  });

  it("defaults to on, so a fresh install gets offline without being asked", () => {
    expect(offlineEnabled()).toBe(true);
  });

  it("persists an opt-out and can be turned back on", async () => {
    await setOfflineEnabled(false);
    expect(offlineEnabled()).toBe(false);
    expect(getSwState().enabled).toBe(false);

    await setOfflineEnabled(true);
    expect(offlineEnabled()).toBe(true);
    expect(getSwState().enabled).toBe(true);
  });

  it("stores nothing at all when enabled, so the default cannot drift", async () => {
    await setOfflineEnabled(true);
    expect(window.localStorage.getItem("physio-offline")).toBe(null);
  });

  it("reports offline as not ready once switched off", async () => {
    await setOfflineEnabled(false);
    expect(getSwState().offlineReady).toBe(false);
    expect(getSwState().updateWaiting).toBe(false);
  });
});

describe("BUILD_ID", () => {
  it("is compiled in, so the running version is visible from the app", () => {
    expect(typeof BUILD_ID).toBe("string");
    expect(BUILD_ID.length).toBeGreaterThan(0);
  });
});
