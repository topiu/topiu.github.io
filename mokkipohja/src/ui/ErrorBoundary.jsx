import { Component } from "react";
import { C, MONO, SANS } from "../core";
import { downloadBackup } from "../export/backup";
import { tr } from "../i18n";
import { KEY_SET, NS } from "../storage";

/* The language from saved settings, read directly: the app may not be running. */
function savedLang() {
  try {
    return JSON.parse(localStorage.getItem(NS + KEY_SET)).lang || "en";
  } catch (e) {
    return "en";
  }
}

const btn = {
  background: C.chrome3,
  color: C.text,
  border: `1px solid ${C.line}`,
  borderRadius: 8,
  padding: "10px 14px",
  fontFamily: SANS,
  fontSize: 14,
  cursor: "pointer",
};

/* A render error used to unmount the whole app and leave a blank screen (the
   corner-switching crash did exactly that). This catches it and shows a way
   out instead. The plans are already in storage, so a reload and a backup
   file both work without the app.

   With `onClose`, it guards a single view (3D, section): the error replaces
   only that view, and closing it returns to the planner. */
export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(error, info && info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const lang = this.props.lang || savedLang();
    const t = (k) => tr(lang, k);
    const detail = (
      <div style={{ fontFamily: MONO, fontSize: 11, color: C.dim, marginTop: 10, wordBreak: "break-word" }}>
        {String((error && error.message) || error)}
      </div>
    );
    if (this.props.onClose)
      return (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 50,
            background: C.chrome,
            color: C.text,
            fontFamily: SANS,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: 24,
            gap: 14,
          }}
        >
          <div style={{ fontSize: 15 }}>{t("viewCrash")}</div>
          {detail}
          <div>
            <button style={btn} onClick={this.props.onClose}>
              {t("close")}
            </button>
          </div>
        </div>
      );
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: C.chrome,
          color: C.text,
          fontFamily: SANS,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 24,
          gap: 12,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 600 }}>{t("crashTitle")}</div>
        <div style={{ fontSize: 14, color: C.dim, lineHeight: 1.5 }}>{t("crashBody")}</div>
        {detail}
        <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
          <button style={{ ...btn, background: C.accent, borderColor: C.accent }} onClick={() => location.reload()}>
            {t("reload")}
          </button>
          <button style={btn} onClick={downloadBackup}>
            {t("backup")}
          </button>
        </div>
      </div>
    );
  }
}
