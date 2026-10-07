import { Suspense, lazy } from "react";
import { C, SANS } from "../core";
import { Btn } from "./atoms";

/* three.js is most of the app's weight, so the 3D view is its own chunk.
   prefetch3D fetches it in the background once the plan is up, so 3D still
   opens at once. If the fetch fails (offline, or a page left open across a
   deploy that replaced the chunk) the view says so and offers a reload,
   instead of breaking. */

const load = () => import("../view3d/View3D");

export const prefetch3D = () => load().catch(() => {});

function Unavailable({ t, onClose }) {
  return (
    <Panel>
      <div style={{ maxWidth: 300 }}>{t("view3dFail")}</div>
      <div style={{ display: "flex", gap: 8 }}>
        <Btn onClick={() => window.location.reload()} active={true}>
          {t("reload")}
        </Btn>
        <Btn onClick={onClose}>{t("close")}</Btn>
      </div>
    </Panel>
  );
}

const View3D = lazy(() =>
  load().then(
    (m) => ({ default: m.View3D }),
    () => ({ default: Unavailable }),
  ),
);

function Panel({ children }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 60,
        background: C.chrome,
        color: C.text,
        fontFamily: SANS,
        fontSize: 14,
        lineHeight: 1.5,
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 24,
      }}
    >
      {children}
    </div>
  );
}

export function View3DLoader(props) {
  return (
    <Suspense fallback={<Panel>{props.t("loading3d")}</Panel>}>
      <View3D {...props} />
    </Suspense>
  );
}
