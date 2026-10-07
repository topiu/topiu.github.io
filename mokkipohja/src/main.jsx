/* Mökkipohja — cabin interior planner.
   Plans are stored in this browser under the "mokkipohja:" localStorage prefix.
   Use Plan -> Save backup to keep a copy you can move between devices. */
import { createRoot } from "react-dom/client";
import { CabinPlanner } from "./ui/CabinPlanner";
import { ErrorBoundary } from "./ui/ErrorBoundary";

/* ---------------- mount ---------------- */
document.getElementById("boot").remove();
const rootEl = document.getElementById("root");
createRoot(rootEl).render(
  <ErrorBoundary>
    <CabinPlanner />
  </ErrorBoundary>,
);
window.__mokkipohjaMounted = true;
