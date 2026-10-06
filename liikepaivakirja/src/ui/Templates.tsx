/* ui/Templates — choosing a ready-made programme.
 *
 * Two steps, like every bulk change in this app: pick, then read exactly what
 * would happen, then confirm. In "replace" mode (first run, empty diary) the
 * template becomes the programme; in "merge" mode (Muokkaa) only the exercises
 * not already there are added and nothing existing is touched. The preview is
 * computed with the same pure function that applies it, so it cannot lie.
 */
import { useEffect, useState } from "react";
import { ChevronLeft, X } from "lucide-react";
import { TEMPLATES, applyTemplate, doseLabel, equipLabel, freqLabel, FREQ_DAILY } from "../domain";
import { C } from "../styles/tokens";
import { IconBtn } from "./common";

export function TemplateModal({ mode, exercises, symptoms, onApply, onClose }) {
  const [pick, setPick] = useState(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const tpl = pick ? TEMPLATES.find((t) => t.id === pick) : null;
  const dry = tpl ? applyTemplate({ exercises, symptoms }, tpl, mode) : null;
  const shown = tpl && dry ? (mode === "replace" ? dry.exercises : dry.exercises.slice(exercises.length)) : [];

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(22,36,31,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 12, zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Valmiit pohjat"
        style={{ background: C.surface, borderRadius: 18, width: "100%", maxWidth: 520, maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 16px 10px" }}>
          {tpl && (
            <IconBtn label="Takaisin" onClick={() => setPick(null)}>
              <ChevronLeft size={18} />
            </IconBtn>
          )}
          <h2 style={{ flex: 1, margin: 0, fontSize: 18, fontWeight: 600 }}>{tpl ? tpl.name : "Valmiit pohjat"}</h2>
          <IconBtn label="Sulje" onClick={onClose}><X size={18} /></IconBtn>
        </div>

        <div style={{ padding: "0 16px 16px", overflowY: "auto" }}>
          {!tpl ? (
            <>
              <p style={{ fontSize: 13, color: C.inkSoft, margin: "0 2px 12px", lineHeight: 1.5 }}>
                {mode === "replace"
                  ? "Pohja korvaa esimerkkiohjelman. Kaiken voi muokata jälkikäteen."
                  : "Pohjasta lisätään vain liikkeet, joita ohjelmassa ei vielä ole. Nykyiset liikkeet ja niiden historia pysyvät ennallaan."}
              </p>
              <div style={{ display: "grid", gap: 8 }}>
                {TEMPLATES.filter((t) => mode === "replace" || t.items.length).map((t) => (
                  <button key={t.id} className="tap" onClick={() => setPick(t.id)}
                    style={{ textAlign: "left", padding: "12px 13px", borderRadius: 13, border: `1px solid ${C.line}`, background: C.surface }}>
                    <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>{t.name}</span>
                      {t.items.length > 0 && <span style={{ fontSize: 12.5, color: C.inkFaint, whiteSpace: "nowrap" }}>{t.items.length} liikettä</span>}
                    </span>
                    <span style={{ display: "block", fontSize: 12.5, color: C.inkSoft, marginTop: 2, lineHeight: 1.45 }}>{t.blurb}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, color: C.inkSoft, margin: "0 2px 10px", lineHeight: 1.5 }}>{tpl.blurb}</p>
              {shown.length > 0 ? (
                <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
                  {shown.map((e, i) => (
                    <div key={e.id} style={{ padding: "9px 12px", borderTop: i === 0 ? "none" : `1px solid ${C.line}` }}>
                      <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>{e.name}</div>
                      <div style={{ fontSize: 12.5, color: C.inkSoft, marginTop: 1 }}>
                        {[doseLabel(e.dose, e.unit), e.freq < FREQ_DAILY ? freqLabel(e.freq) : "päivittäin", e.equip ? equipLabel(e.equip) : ""].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 13.5, color: C.inkSoft, margin: "4px 2px" }}>
                  {tpl.items.length ? "Kaikki pohjan liikkeet ovat jo ohjelmassa." : "Ei liikkeitä — lisäät ne itse kirjastosta tai tekstinä."}
                </p>
              )}
              {mode === "merge" && dry && dry.skipped > 0 && shown.length > 0 && (
                <p style={{ fontSize: 12.5, color: C.inkFaint, margin: "8px 2px 0" }}>{dry.skipped} pohjan liikettä on jo ohjelmassa, ne ohitetaan.</p>
              )}
              {mode === "replace" && tpl.symptoms.length > 0 && (
                <p style={{ fontSize: 12.5, color: C.inkSoft, margin: "10px 2px 0", lineHeight: 1.5 }}>
                  Seurattavat oireet: {tpl.symptoms.map((s) => s.name).join(", ")}.
                </p>
              )}
              {tpl.items.length > 0 && (
                <p style={{ fontSize: 12, color: C.inkFaint, margin: "10px 2px 0", lineHeight: 1.5 }}>
                  Tavoitteet ovat tyypillisiä aloitusarvoja, eivät ohjeita. Jos fysioterapeutti tai valmentaja on antanut omat, käytä niitä.
                </p>
              )}
              {(mode === "replace" || shown.length > 0) && (
                <button className="tap" onClick={() => onApply(tpl.id)}
                  style={{ width: "100%", marginTop: 14, padding: "13px", borderRadius: 13, background: C.pine, color: "#fff", fontSize: 15, fontWeight: 600 }}>
                  {mode === "replace" ? "Ota käyttöön" : `Lisää ${shown.length} ${shown.length === 1 ? "liike" : "liikettä"}`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
