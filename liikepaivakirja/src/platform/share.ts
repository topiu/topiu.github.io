/* platform/share — capability detection and the two iOS-viable save mechanisms.
 *
 * Safari ships no File System Access pickers on any platform, and neither does
 * Firefox or any mobile browser, so showDirectoryPicker is effectively
 * "Chromium on desktop". Everywhere else a save costs one tap: either a plain
 * download (lands wherever Settings > Safari > Downloads points, which can be a
 * third-party File Provider such as a Syncthing folder) or the share sheet,
 * where the destination is chosen per save.
 */

export function hasDirectoryPicker(): boolean {
  try {
    return typeof window !== "undefined" && "showDirectoryPicker" in window;
  } catch {
    return false;
  }
}

export function canShareFiles(): boolean {
  try {
    if (typeof navigator === "undefined") return false;
    const nav = navigator as any;
    if (!nav.share || !nav.canShare) return false;
    const probe = new File(["{}"], "probe.json", { type: "application/json" });
    return !!nav.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

export type ShareResult = "shared" | "cancelled" | "unsupported" | "failed";

export async function shareTextFile(
  filename: string,
  text: string,
  title = "Liikepäiväkirja"
): Promise<ShareResult> {
  if (!canShareFiles()) return "unsupported";
  try {
    const file = new File([text], filename, { type: "application/json" });
    await (navigator as any).share({ files: [file], title });
    return "shared";
  } catch (err: any) {
    /* the user closing the sheet must not be recorded as a backup */
    if (err && (err.name === "AbortError" || err.name === "NotAllowedError")) return "cancelled";
    return "failed";
  }
}
