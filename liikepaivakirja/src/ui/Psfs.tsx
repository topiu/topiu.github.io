/* ui/Psfs — the PSFS card on Tänään.
 *
 * Kept deliberately quiet. The daily screen has to stay under half a minute, and
 * this is a fortnightly assessment, so when nothing is due the card collapses to
 * a single line showing the last mean. It only opens itself when `psfsDue` says
 * the interval has elapsed, or when the selected day already has an entry.
 *
 * Activity management lives inside the card rather than under Muokkaa. There are
 * at most five activities and they change every few months, so a separate tab
 * section would be a trip for nothing — and the wording of an activity only
 * makes sense next to the scale it is scored on.
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  PSFS_MAX,
  PSFS_MAX_ACTIVITIES,
  PSFS_MIN_ACTIVITIES,
  psfsActivities,
  psfsBandLabel,
  psfsChange,
  psfsDaysSince,
  psfsDue,
  psfsEntry,
  psfsMean,
} from "../domain";
import { C } from "../styles/tokens";
import { Card, MiniBtn, SectionLabel } from "./common";

export function PsfsCard({
  psfs,
  dateKey,
  todayKey,
  isToday,
  setScore,
  addActivity,
  renameActivity,
  retireActivity,
  forgetActivity,
}) {
  const acts = psfsActivities(psfs);
  const entry = psfsEntry(psfs, dateKey);
  const due = psfsDue(psfs, todayKey);
  const [open, setOpen] = useState(!!entry || (due && isToday) || acts.length === 0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const mean = psfsMean(entry);
  const change = psfsChange(psfs);
  const since = psfsDaysSince(psfs, todayKey);

  const submit = () => {
    const n = draft.trim();
    if (!n) return;
    addActivity(n);
    setDraft("");
  };

  /* ---- nothing set up yet: explain once, then get out of the way ---- */
  if (!acts.length) {
    return (
      <>
        <SectionLabel>Toimintakyky</SectionLabel>
        <Card>
          <div style={{ fontSize: 13.5, color: C.inkSoft, lineHeight: 1.55 }}>
            Nimeä {PSFS_MIN_ACTIVITIES}–{PSFS_MAX_ACTIVITIES} arkista asiaa, joita vaiva haittaa juuri nyt —
            esimerkiksi <i>sukkien pukeminen</i>, <i>istuminen tunnin</i> tai <i>portaat alas</i>. Arvioit ne
            asteikolla 0–{PSFS_MAX} kahden viikon välein. Fysioterapeutti tunnistaa mittarin nimellä PSFS.
          </div>
          <NewActivity value={draft} setValue={setDraft} onAdd={submit} />
        </Card>
      </>
    );
  }

  /* ---- collapsed: one line, no work to do ---- */
  if (!open) {
    return (
      <>
        <SectionLabel>Toimintakyky</SectionLabel>
        <Card style={{ padding: 12 }}>
          <button
            className="tap"
            onClick={() => setOpen(true)}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: 10, textAlign: "left" }}
          >
            <span style={{ minWidth: 0 }}>
              <span style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>PSFS</span>
              {change ? (
                <span style={{ fontSize: 13, color: C.inkSoft }}>
                  {" "}
                  {change.last.mean}/{PSFS_MAX} · {change.delta > 0 ? "+" : ""}
                  {change.delta} alusta
                </span>
              ) : (
                <span style={{ fontSize: 13, color: C.inkSoft }}> ei vielä arvioitu</span>
              )}
              <span style={{ display: "block", fontSize: 12, color: C.inkFaint, marginTop: 2 }}>
                {since == null ? "Ensimmäinen arvio odottaa" : `Edellinen arvio ${since} pv sitten`}
              </span>
            </span>
            <ChevronDown size={18} style={{ color: C.inkFaint, flex: "0 0 auto" }} />
          </button>
        </Card>
      </>
    );
  }

  return (
    <>
      <SectionLabel>Toimintakyky</SectionLabel>
      <Card style={{ padding: 12 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600 }}>PSFS · 0–{PSFS_MAX}</div>
            <div style={{ fontSize: 12, color: C.inkFaint, marginTop: 1 }}>
              0 = en pysty lainkaan · {PSFS_MAX} = kuten ennen vaivaa
            </div>
          </div>
          <div style={{ display: "flex", gap: 2, flex: "0 0 auto" }}>
            <MiniBtn label="Muokkaa toimintoja" onClick={() => setEditing((v) => !v)}>
              {editing ? <X size={16} /> : <Pencil size={15} />}
            </MiniBtn>
            <MiniBtn label="Pienennä" onClick={() => setOpen(false)}>
              <ChevronUp size={17} />
            </MiniBtn>
          </div>
        </div>

        {due && isToday && !entry && (
          <div
            style={{ background: C.amberTint, border: `1px solid ${C.amberLine}`, borderRadius: 10, padding: "8px 10px", fontSize: 12.5, color: C.ink, marginBottom: 10, lineHeight: 1.45 }}
          >
            Arvio on ajankohtainen{since != null ? ` — edellisestä ${since} päivää` : ""}. Pisteytä kaikki
            toiminnot samalla istumalla, niin luvut ovat vertailukelpoisia.
          </div>
        )}

        {acts.map((a) => (
          <div key={a.id} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
              {editing ? (
                <>
                  <input
                    value={a.name}
                    onChange={(e) => renameActivity(a.id, e.target.value)}
                    style={{ flex: 1, minWidth: 0, border: `1px solid ${C.line}`, borderRadius: 9, background: C.surface, fontSize: 14, padding: "7px 10px", color: C.ink, outline: "none" }}
                  />
                  <MiniBtn label={`Päätä seuranta: ${a.name}`} onClick={() => retireActivity(a.id, true)}>
                    <X size={16} />
                  </MiniBtn>
                  <MiniBtn danger label={`Poista kokonaan: ${a.name}`} onClick={() => forgetActivity(a.id)}>
                    <Trash2 size={15} />
                  </MiniBtn>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 500 }}>{a.name}</span>
                  <span
                    style={{ flex: "0 0 auto", fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: entry && entry[a.id] != null ? C.pineDeep : C.inkFaint }}
                  >
                    {entry && entry[a.id] != null ? `${entry[a.id]}/${PSFS_MAX}` : "–"}
                  </span>
                </>
              )}
            </div>
            {!editing && (
              <ScoreRow
                value={entry ? entry[a.id] : undefined}
                onPick={(v) => setScore(a.id, entry && entry[a.id] === v ? null : v)}
                label={a.name}
              />
            )}
          </div>
        ))}

        {editing && (
          <>
            {psfsActivities(psfs).length < PSFS_MAX_ACTIVITIES ? (
              <NewActivity value={draft} setValue={setDraft} onAdd={submit} />
            ) : (
              <div style={{ fontSize: 12, color: C.inkFaint, marginTop: 8 }}>
                Enintään {PSFS_MAX_ACTIVITIES} toimintoa kerrallaan. Päätä jonkin seuranta, jos haluat vaihtaa.
              </div>
            )}
            <div style={{ fontSize: 11.5, color: C.inkFaint, marginTop: 8, lineHeight: 1.5 }}>
              <b>Päätä seuranta</b> säilyttää aiemmat pisteet raportissa. <b>Poista kokonaan</b> pyyhkii myös
              historian — käytä vain kirjoitusvirheeseen.
            </div>
          </>
        )}

        {!editing && mean && (
          <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 4, paddingTop: 10, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: C.inkSoft, fontWeight: 600 }}>Keskiarvo</span>
            <span style={{ fontSize: 20, fontWeight: 600, color: C.pineDeep, fontVariantNumeric: "tabular-nums" }}>
              {mean.mean}
            </span>
            <span style={{ fontSize: 12.5, color: C.inkFaint }}>
              / {PSFS_MAX} · {mean.n}/{acts.length} pisteytetty
            </span>
          </div>
        )}

        {!editing && change && (
          <div style={{ fontSize: 12.5, color: C.inkSoft, marginTop: 6, lineHeight: 1.5 }}>
            Ensimmäisestä arviosta {change.delta > 0 ? "+" : ""}
            {change.delta} pistettä — {psfsBandLabel(change.band, change.delta)}.
          </div>
        )}
      </Card>
    </>
  );
}

/* 0–10 in one row; the buttons flex so the scale fits a narrow phone without
   wrapping, because a wrapped scale reads as two scales */
function ScoreRow({ value, onPick, label }) {
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {Array.from({ length: PSFS_MAX + 1 }, (_, v) => {
        const on = value === v;
        return (
          <button
            key={v}
            className="tap"
            aria-label={`${label}: ${v}`}
            aria-pressed={on}
            onClick={() => onPick(v)}
            style={{
              flex: "1 1 0",
              minWidth: 0,
              height: 32,
              borderRadius: 8,
              border: on ? `1px solid ${C.pine}` : `1px solid ${C.line}`,
              background: on ? C.pine : C.surface,
              color: on ? "#fff" : C.inkSoft,
              fontSize: 12.5,
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
              transition: "background .14s, color .14s",
            }}
          >
            {v}
          </button>
        );
      })}
    </div>
  );
}

function NewActivity({ value, setValue, onAdd }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.line}` }}>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onAdd()}
        placeholder="esim. sukkien pukeminen"
        style={{ flex: 1, minWidth: 0, border: `1px solid ${C.line}`, borderRadius: 10, background: C.surface, fontSize: 15, padding: "10px 12px", color: C.ink, outline: "none" }}
      />
      <button
        className="tap"
        onClick={onAdd}
        aria-label="Lisää toiminto"
        style={{ flex: "0 0 auto", width: 42, height: 42, borderRadius: 10, background: C.pine, display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <Plus size={20} color="#fff" strokeWidth={2.5} />
      </button>
    </div>
  );
}
