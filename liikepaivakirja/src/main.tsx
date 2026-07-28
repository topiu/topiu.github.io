import { createRoot } from "react-dom/client";
import App from "./ui/App";
import { requestPersistence } from "./storage/store";
import { maybeSnapshot } from "./storage/backup";
import { unregisterServiceWorkers } from "./platform/sw";

const el = document.getElementById("root");
if (el) createRoot(el).render(<App />);

/* Both are best-effort and must never block first paint. */
void requestPersistence();
void maybeSnapshot();
/* Offline was withdrawn; this removes any worker left behind by it. Cache
   Storage only — IndexedDB, and therefore the diary, is untouched. */
unregisterServiceWorkers();
