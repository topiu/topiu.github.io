import { createRoot } from "react-dom/client";
import App from "./ui/App";
import { requestPersistence } from "./storage/store";
import { maybeSnapshot } from "./storage/backup";
import { initServiceWorker } from "./platform/sw";

const el = document.getElementById("root");
if (el) createRoot(el).render(<App />);

/* Both are best-effort and must never block first paint. */
void requestPersistence();
void maybeSnapshot();
/* Offline capability arrives on the second load by design: the worker installs
   in the background now and controls the page from the next start. Honours the
   ?sw=off escape hatch before doing anything else. */
initServiceWorker();
