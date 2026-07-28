/* ui/Update — the two things the service worker needs to say out loud.
 *
 * `UpdateBanner` offers a waiting version. It sits above the daily work rather
 * than in a settings screen because an update the user never sees is the same as
 * no update, and it is dismissible because "later" is a legitimate answer when
 * you have opened the app to log a set.
 *
 * `OfflineNote` reports whether offline actually works *right now* rather than
 * claiming it as a feature. On a first visit the worker is still installing, so
 * the honest answer is "from the next start", and the note says that instead of
 * a reassuring checkmark. The pattern matches the backup UI, which refuses to
 * record a backup it cannot verify.
 */

import { useState } from "react";
import { CloudOff, Download, RefreshCw, X } from "lucide-react";
import { applyUpdate, useOnlineStatus, useSwState } from "../platform/sw";
import { C } from "../styles/tokens";
import { MiniBtn } from "./common";

export function UpdateBanner() {
  const sw = useSwState();
  const [hidden, setHidden] = useState(false);
  if (!sw.updateWaiting || hidden) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: C.pineTint,
        border: `1px solid ${C.pineSoft}`,
        borderRadius: 14,
        padding: "11px 12px",
        marginBottom: 16,
      }}
    >
      <Download size={18} style={{ flex: "0 0 auto", color: C.pineDeep }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>Uusi versio ladattu</div>
        <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 1, lineHeight: 1.45 }}>
          Otetaan käyttöön uudelleenlatauksella. Merkinnät säilyvät.
        </div>
      </div>
      <button
        className="tap"
        onClick={applyUpdate}
        style={{
          flex: "0 0 auto",
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 12px",
          borderRadius: 10,
          background: C.pine,
          color: "#fff",
          fontSize: 13.5,
          fontWeight: 600,
        }}
      >
        <RefreshCw size={14} /> Päivitä
      </button>
      <MiniBtn label="Piilota" onClick={() => setHidden(true)}>
        <X size={16} />
      </MiniBtn>
    </div>
  );
}

export function OfflineNote() {
  const sw = useSwState();
  const online = useOnlineStatus();

  /* offline and working is worth confirming; it is the one state where the user
     might otherwise assume the app is broken */
  if (!online) {
    return (
      <p
        style={{
          marginTop: 10,
          textAlign: "center",
          fontSize: 12,
          color: sw.offlineReady ? C.pineDeep : C.amber,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 5,
        }}
      >
        <CloudOff size={13} />
        {sw.offlineReady
          ? "Ei verkkoyhteyttä — sovellus toimii silti."
          : "Ei verkkoyhteyttä. Tämä versio ei ole vielä tallentunut laitteelle."}
      </p>
    );
  }

  if (!sw.supported) return null;
  if (sw.error) {
    return (
      <p style={{ marginTop: 10, textAlign: "center", fontSize: 12, color: C.inkFaint }}>
        Offline-tila ei ole käytettävissä tässä selaimessa.
      </p>
    );
  }
  if (sw.offlineReady) return null; /* nothing to say when it simply works */

  return (
    <p style={{ marginTop: 10, textAlign: "center", fontSize: 12, color: C.inkFaint }}>
      Offline-tila valmistuu seuraavaan käynnistykseen.
    </p>
  );
}
