/* ui/ErrorBoundary — keeps one broken view from taking the whole app down.
 *
 * Why this exists: a throw during render unmounts the entire React tree, not the
 * component that threw. On a phone that means a white page, and on a Home Screen
 * install there are no developer tools, so the remedy a user reaches for is
 * clearing website data — which destroys the diary, because the diary *is*
 * IndexedDB on one device. The cost of a render bug was therefore total, and it
 * was paid for real: a temporal dead zone reference in `TrendChart` blanked the
 * app for every Historia range except "14 pv".
 *
 * The design follows from that. One boundary per tab, keyed on the tab in
 * `App.tsx`, so the header and the tab bar always survive and switching tabs
 * mounts a clean one. Logging today stays possible while a chart is broken,
 * which matters more than the chart does.
 *
 * "Yritä uudelleen" remounts the children, which resets any view-local state —
 * for Historia that returns the range to the 14 pv default, i.e. away from the
 * selection that broke. That is a recovery, not a cure, and the wording says so
 * rather than promising it is fixed.
 *
 * The fallback shows BUILD_ID and the error text and offers to copy them. That
 * is not decoration: on a phone it is the only bug report available, and
 * BUILD_ID first is the same order as "check the deploy before suspecting the
 * app" in CLAUDE.md.
 *
 * Deliberately not done: no error reporting anywhere. There is no server and no
 * account, and adding one for diagnostics would put diary contents on a wire.
 */
import { Component } from "react";
import { AlertTriangle, Copy, RotateCcw, Check } from "lucide-react";
import { copyText } from "../platform/download";
import { BUILD_ID } from "../platform/sw";
import { C } from "../styles/tokens";

export class ErrorBoundary extends Component<any, any> {
  constructor(props) {
    super(props);
    this.state = { err: null, where: "", copied: false };
  }

  static getDerivedStateFromError(err) {
    return { err, copied: false };
  }

  componentDidCatch(err, info) {
    /* Nowhere to send this, but the console is still worth something when the
       app happens to be open in a desktop browser. */
    console.error("Liikepäiväkirja: render error", err, info);
    const stack = (info && info.componentStack) || "";
    /* First named component in the stack — enough to say which view broke
       without printing forty lines of tree on a phone. */
    const m = stack.match(/\s+(?:at|in)\s+([A-Za-z0-9_$]+)/);
    this.setState({ where: m ? m[1] : "" });
  }

  reset = () => this.setState({ err: null, where: "", copied: false });

  copy = async () => {
    const err = this.state.err;
    const text = [
      `Liikepäiväkirja ${BUILD_ID}`,
      this.props.label ? `Näkymä: ${this.props.label}` : null,
      this.state.where ? `Komponentti: ${this.state.where}` : null,
      `Virhe: ${(err && (err.message || String(err))) || "tuntematon"}`,
      err && err.stack ? String(err.stack).split("\n").slice(0, 6).join("\n") : null,
    ]
      .filter(Boolean)
      .join("\n");
    if (await copyText(text)) this.setState({ copied: true });
  };

  render() {
    const { err, copied } = this.state;
    if (!err) return this.props.children;
    const msg = (err && (err.message || String(err))) || "tuntematon virhe";

    return (
      <div
        data-error-boundary=""
        role="alert"
        style={{ background: C.surface, border: `1px solid ${C.amberLine}`, borderRadius: 16, padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <AlertTriangle size={17} color={C.amber} />
          <span style={{ fontSize: 15.5, fontWeight: 600, color: C.ink }}>
            {this.props.label ? `${this.props.label} ei piirtynyt` : "Näkymä ei piirtynyt"}
          </span>
        </div>
        <div style={{ fontSize: 13.5, color: C.inkSoft, lineHeight: 1.55 }}>
          Merkinnät ovat tallessa — vika on tässä näkymässä, ei tiedoissa. Muut välilehdet
          toimivat normaalisti, ja päivän kirjaaminen onnistuu Tänään-välilehdellä.
        </div>
        <div style={{ marginTop: 10, padding: "9px 11px", borderRadius: 10, background: C.bg, border: `1px solid ${C.line}`, fontSize: 12, lineHeight: 1.5, color: C.inkSoft, fontFamily: "ui-monospace, Menlo, Consolas, monospace", overflowWrap: "anywhere" }}>
          <div>{BUILD_ID}</div>
          <div style={{ color: C.ink }}>{msg}</div>
          {this.state.where && <div>{this.state.where}</div>}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button className="tap" onClick={this.reset}
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, flex: 1, padding: "11px 12px", borderRadius: 11, border: "none", background: C.pine, color: "#fff", fontSize: 14.5, fontWeight: 600 }}>
            <RotateCcw size={15} /> Yritä uudelleen
          </button>
          <button className="tap" onClick={this.copy}
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, flex: "0 0 auto", padding: "11px 13px", borderRadius: 11, border: `1px solid ${C.line}`, background: C.surface, color: C.inkSoft, fontSize: 14.5, fontWeight: 600 }}>
            {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Kopioitu" : "Kopioi"}
          </button>
        </div>
        <div style={{ fontSize: 12, color: C.inkFaint, marginTop: 10, lineHeight: 1.5 }}>
          Jos vika toistuu, ota varmuuskopio Muokkaa-välilehdeltä ennen muuta.
        </div>
      </div>
    );
  }
}
