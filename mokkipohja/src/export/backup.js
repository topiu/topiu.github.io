import { backupAll } from "../storage";
import { download } from "./pdf";

/* Save every stored key as a dated backup file. Used by the plan sheet and by
   the error screen, which has to work without the app running. */
export function downloadBackup() {
  const stamp = new Date().toISOString().slice(0, 10);
  download(new Blob([JSON.stringify(backupAll())], { type: "application/json" }), `mokkipohja-${stamp}.json`);
}
