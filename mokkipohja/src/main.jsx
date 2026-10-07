/* Mökkipohja — cabin interior planner.
   Plans are stored in this browser under the "mokkipohja:" localStorage prefix.
   Use Plan -> Save backup to keep a copy you can move between devices. */
import { createRoot } from "react-dom/client";
import { CabinPlanner } from "./ui/CabinPlanner";

/* ---------------- mount ---------------- */
document.getElementById("boot").remove();
const rootEl = document.getElementById("root");
createRoot(rootEl).render(<CabinPlanner />);
window.__mokkipohjaMounted = true;
