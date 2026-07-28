/* ui/Update — everything the service worker needs to say out loud, plus the
 * switch that turns it off.
 *
 * `UpdateBanner` offers a waiting version above the daily work, because an update
 * nobody sees is the same as no update. It is dismissible: "later" is a legitimate
 * answer when you opened the app to log a set.
 *
 * `OfflineNote` reports what is actually true right now rather than claiming
 * offline as a feature. On a first visit the worker is still installing, so the
 * honest answer is "from the next start", and it says that.
 *
 * `OfflineSettings` is the in-app way out, and it shows BUILD_ID. That last part
 * is small and was the missing piece the first time round: when the app looked
 * broken there was no way to tell from the screen whether a deploy had taken
 * effect at all, and a great deal of guessing followed.
 */

import { useState } from "react";
import { CloudOff, Download, RefreshCw, X } from "lucide-react";
import { BUILD_ID, applyUpdate, setOfflineEnabled, useOnlineStatus, useSwState } from "../platform/sw";
import { C } from "../styles/tokens";
import { MiniBtn } from "./common";

export function UpdateBanner() {
  const sw = useSwState();
  const [hidden, setHidden] = useState(false);
  if (!sw.updateWaiting || hidden) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: C.pineTint, border: `1px solid ${C.pineSoft}`, borderRadius: 14, padding: "11px 12px", marginBottom: 16 }}>
      <Download size={18} style={{ flex: "0 0 auto", color: C.pineDeep }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>Uusi versio ladattu</div>
        <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 1, lineHeight: 1.45 }}>
          Otetaan käyttöön uudelleenlatauksella. Merkinnät säilyvät.
        </div>
      </div>
      <button className="tap" onClick={applyUpdate}
        style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 10, background: C.pine, color: "#fff", fontSize: 13.5, fontWeight: 600 }}>
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

  if (!online) {
    return (
      <p style={{ marginTop: 10, textAlign: "center", fontSize: 12, color: sw.offlineReady ? C.pineDeep : C.amber, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, lineHeight: 1.5 }}>
        <CloudOff size={13} />
        {sw.offlineReady
          ? "Ei verkkoyhteyttä — sovellus toimii silti."
          : "Ei verkkoyhteyttä. Merkinnät tallentuvat laitteelle."}
      </p>
    );
  }
  if (!sw.supported || !sw.enabled || sw.error) return null;
  if (sw.offlineReady) return null; /* nothing to say when it simply works */

  return (
    <p style={{ marginTop: 10, textAlign: "center", fontSize: 12, color: C.inkFaint }}>
      Offline-tila valmistuu seuraavaan käynnistykseen.
    </p>
  );
}

export function OfflineSettings() {
  const sw = useSwState();
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      await setOfflineEnabled(!sw.enabled);
    } finally {
      setBusy(false);
    }
  };

  const status = !sw.supported
    ? "Ei tuettu tässä selaimessa"
    : sw.error
      ? `Ei käytössä: ${sw.error}`
      : !sw.enabled
        ? "Pois käytöstä"
        : sw.offlineReady
          ? "Käytössä — sovellus avautuu ilman verkkoa"
          : "Valmistuu seuraavaan käynnistykseen";

  return (
    <>
      <SectionHeading>Offline ja versio</SectionHeading>
      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>Offline-tila</div>
            <div style={{ fontSize: 12, color: C.inkFaint, marginTop: 2, lineHeight: 1.45 }}>{status}</div>
          </div>
          <button
            className="tap"
            onClick={toggle}
            disabled={busy || !sw.supported}
            aria-pressed={sw.enabled}
            aria-label="Offline-tila"
            style={{ flex: "0 0 auto", padding: "9px 14px", borderRadius: 10, border: `1px solid ${sw.enabled ? C.pine : C.line}`, background: sw.enabled ? C.pine : C.surface, color: sw.enabled ? "#fff" : C.inkSoft, fontSize: 13.5, fontWeight: 600, opacity: busy || !sw.supported ? 0.5 : 1 }}>
            {sw.enabled ? "Käytössä" : "Pois"}
          </button>
        </div>

        <p style={{ margin: "12px 0 0", fontSize: 11.5, color: C.inkFaint, lineHeight: 1.55 }}>
          Offline tallentaa vain sovelluksen tiedostot. Merkinnät ovat aina laitteella eivätkä riipu tästä
          asetuksesta, eikä tämän kytkimen käyttö poista niitä.
          <br />
          Jos sovellus ei jostain syystä avaudu, lisää osoitteen perään <b>?sw=off</b> ja avaa se
          selaimessa. Se purkaa offline-tilan. <b>?sw=on</b> palauttaa sen.
        </p>

        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.line}`, display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11.5, color: C.inkFaint }}>
          <span>Versio</span>
          <span style={{ fontFamily: "ui-monospace, Menlo, Consolas, monospace" }}>{BUILD_ID}</span>
        </div>
      </div>
    </>
  );
}

function SectionHeading({ children }) {
  return (
    <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: C.inkSoft, fontWeight: 700, margin: "22px 2px 9px" }}>
      {children}
    </div>
  );
}
