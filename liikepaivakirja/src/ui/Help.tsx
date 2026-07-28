/* ui/Help — the about/help panel and the first-run card.
 *
 * Two separate things on purpose, because they answer different questions at
 * different times.
 *
 * `FirstRunCard` appears on Tänään only while the diary is genuinely empty — no
 * logged days, no milestones, no PSFS — and vanishes the moment anything is
 * recorded. Onboarding that outstays its welcome is just clutter on the one screen
 * that has to stay fast. It is also dismissible, because a returning user who
 * cleared their data does not need to be told what the app is.
 *
 * It offers a restore alongside the introduction, which covers the case the
 * emptiness check cannot distinguish: an empty diary is either a new install or a
 * lost one, and the second one wants a backup file, not a welcome.
 *
 * `HelpModal` is reference material reachable from the header at any time, not
 * only when empty — the questions it answers (what is PSFS, where does my data
 * live, what does the report contain) come up months in. Every section starts
 * collapsed so the panel opens as a list of questions rather than a wall of prose.
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, HelpCircle, Info, RotateCcw, X } from "lucide-react";
import { FIRST_RUN, HELP_SECTIONS } from "../domain";
import { BUILD_ID } from "../platform/sw";
import { C } from "../styles/tokens";
import { IconBtn } from "./common";

export function HelpButton({ onClick }) {
  return (
    <button
      className="tap"
      onClick={onClick}
      aria-label="Ohjeet ja tietoja"
      style={{ flex: "0 0 auto", width: 38, height: 38, borderRadius: 11, border: `1px solid ${C.line}`, background: C.surface, display: "flex", alignItems: "center", justifyContent: "center", color: C.inkSoft }}>
      <HelpCircle size={19} />
    </button>
  );
}

export function HelpModal({ onClose }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(22,36,31,0.34)", zIndex: 70, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 0 }}
      onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto", background: C.bg, borderRadius: "18px 18px 0 0", padding: "16px 16px 32px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 600 }}>Ohjeet</h2>
            <div style={{ fontSize: 12.5, color: C.inkFaint, marginTop: 2 }}>Liikepäiväkirja · fysioterapian seuranta</div>
          </div>
          <IconBtn label="Sulje" onClick={onClose}>
            <X size={18} />
          </IconBtn>
        </div>

        <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, overflow: "hidden" }}>
          {HELP_SECTIONS.map((s, i) => {
            const on = open === s.id;
            return (
              <div key={s.id} style={{ borderTop: i === 0 ? "none" : `1px solid ${C.line}` }}>
                <button
                  className="tap"
                  onClick={() => setOpen(on ? null : s.id)}
                  aria-expanded={on}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%", textAlign: "left", padding: "13px 13px" }}>
                  <span style={{ fontSize: 14.5, fontWeight: 600, color: on ? C.pineDeep : C.ink }}>{s.title}</span>
                  {on ? (
                    <ChevronUp size={17} style={{ flex: "0 0 auto", color: C.inkFaint }} />
                  ) : (
                    <ChevronDown size={17} style={{ flex: "0 0 auto", color: C.inkFaint }} />
                  )}
                </button>
                {on && (
                  <div style={{ padding: "0 13px 14px" }}>
                    {s.body.map((para, j) => (
                      <p key={j} style={{ margin: j === 0 ? "0 0 8px" : "0 0 8px", fontSize: 13.5, lineHeight: 1.6, color: C.inkSoft }}>
                        {para}
                      </p>
                    ))}
                    {s.note && (
                      <div style={{ display: "flex", gap: 8, background: C.pineTint, border: `1px solid ${C.pineSoft}`, borderRadius: 10, padding: "9px 11px" }}>
                        <Info size={15} style={{ flex: "0 0 auto", color: C.pineDeep, marginTop: 1 }} />
                        <span style={{ fontSize: 12.5, lineHeight: 1.55, color: C.ink }}>{s.note}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 14, padding: "0 3px", fontSize: 11.5, color: C.inkFaint }}>
          <span>Versio</span>
          <span style={{ fontFamily: "ui-monospace, Menlo, Consolas, monospace" }}>{BUILD_ID}</span>
        </div>
      </div>
    </div>
  );
}

export function FirstRunCard({ onOpenHelp, onGoEdit, onDismiss }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.pineSoft}`, borderRadius: 16, padding: 15, marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 16.5, fontWeight: 600, color: C.pineDeep }}>{FIRST_RUN.title}</h2>
        <button
          className="tap"
          onClick={onDismiss}
          aria-label="Piilota ohje"
          style={{ flex: "0 0 auto", width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: C.inkFaint }}>
          <X size={16} />
        </button>
      </div>

      <ol style={{ margin: "10px 0 0", padding: 0, listStyle: "none", counterReset: "fr" }}>
        {FIRST_RUN.lines.map((line, i) => (
          <li key={i} style={{ display: "flex", gap: 9, marginBottom: 8, fontSize: 13.5, lineHeight: 1.55, color: C.inkSoft }}>
            <span
              style={{ flex: "0 0 auto", width: 19, height: 19, borderRadius: "50%", background: C.pineTint, color: C.pineDeep, fontSize: 11.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>
              {i + 1}
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ol>

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button
          className="tap"
          onClick={onGoEdit}
          style={{ flex: "1 1 auto", padding: "11px 12px", borderRadius: 11, background: C.pine, color: "#fff", fontSize: 14, fontWeight: 600 }}>
          Muokkaa liikkeet
        </button>
        <button
          className="tap"
          onClick={onOpenHelp}
          style={{ flex: "1 1 auto", padding: "11px 12px", borderRadius: 11, border: `1px solid ${C.line}`, background: C.surface, color: C.inkSoft, fontSize: 14, fontWeight: 600 }}>
          Lue ohjeet
        </button>
      </div>

      {/* An empty diary is either a new install or a lost one, and this check
          cannot tell them apart — so offer the answer the second case needs. */}
      <button
        className="tap"
        onClick={onGoEdit}
        style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 12.5, fontWeight: 600, color: C.inkFaint }}>
        <RotateCcw size={13} /> Onko sinulla varmuuskopio? Palauta se Muokkaa-välilehdeltä.
      </button>
    </div>
  );
}
