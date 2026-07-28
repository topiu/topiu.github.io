/* ui/Restore — reading a backup back in, and checking one without committing.
 *
 * The daily snapshots have existed since the port with nothing able to read
 * them. This is that half. It lives under Muokkaa next to the backup settings,
 * collapsed by default, because it is the most destructive control in the app
 * and should take a deliberate tap to reach.
 *
 * The design principle is that you see the cost before you pay it. Every
 * candidate — a snapshot or a file — goes through the same two-step flow: pick
 * it, read what changes, then confirm. `diffDatasets` counts the days that would
 * stop existing, which is the number that matters; a day-count delta of zero can
 * still hide one day being swapped for another, so lost days are counted
 * directly rather than inferred from totals.
 *
 * Checking a file is the same flow stopped after step one. That is deliberate:
 * "does my backup actually contain what I think" needed an answer that does not
 * require risking the live data to get it, and making verification a side effect
 * of the restore flow means there is no separate code path to keep honest.
 *
 * Applying goes through App's `applyImport`, which snapshots to `physio-undo`
 * first — so a restore is undoable — and `forceSnapshot()` runs before that, so
 * the state you restored *away* from survives a second restore consuming the
 * undo slot.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, FileCheck2, HardDriveDownload, RotateCcw } from "lucide-react";
import { describeDataset, diffDatasets, humanDate, parseImport, snapshotToDataset } from "../domain";
import { forceSnapshot, listSnapshots, readSnapshot } from "../storage/backup";
import { C } from "../styles/tokens";

type Candidate = {
  kind: "snapshot" | "file";
  label: string;
  detail: string;
  dataset: any;
};

const clock = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `klo ${d.getHours()}.${String(d.getMinutes()).padStart(2, "0")}`;
};

export function RestorePanel({ exercises, symptoms, logs, marks, psfs, questions, onRestore, onUndo, canUndo }) {
  const [open, setOpen] = useState(false);
  const [snaps, setSnaps] = useState<any[] | null>(null);
  const [pick, setPick] = useState<Candidate | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const current = { ex: exercises, sy: symptoms, logs, marks, psfs, questions };

  const load = useCallback(async () => {
    try {
      const dates = await listSnapshots();
      const rows: any[] = [];
      for (const date of dates) {
        const snap = await readSnapshot(date);
        if (!snap) continue;
        const ds = snapshotToDataset(snap.data);
        if (!ds.ok) continue;
        rows.push({ date, at: snap.at, dataset: ds, summary: describeDataset(ds) });
      }
      setSnaps(rows);
    } catch {
      setSnaps([]);
    }
  }, []);

  useEffect(() => {
    if (open && snaps == null) void load();
  }, [open, snaps, load]);

  const onFile = (e: any) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    setError("");
    setDone("");
    const reader = new FileReader();
    reader.onload = () => {
      const res = parseImport(String(reader.result || ""));
      if (!res.ok) {
        setPick(null);
        setError(res.error);
        return;
      }
      setPick({
        kind: "file",
        label: f.name,
        detail: `${(f.size / 1024).toFixed(0)} kt`,
        dataset: res,
      });
    };
    reader.onerror = () => setError("Tiedostoa ei voitu lukea.");
    reader.readAsText(f);
  };

  const apply = async () => {
    if (!pick) return;
    setBusy(true);
    setError("");
    try {
      /* keep the pre-restore state recoverable even after the undo slot is reused */
      await forceSnapshot();
      await onRestore(pick.dataset);
      setDone("Tiedot palautettu.");
      setPick(null);
      setSnaps(null); /* the snapshot list is now stale */
    } catch {
      setError("Palautus ei onnistunut. Tiedot jäivät ennalleen.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SectionHeading>Palautus</SectionHeading>

      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, padding: 14 }}>
        <button
          className="tap"
          onClick={() => setOpen((v) => !v)}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: 10, textAlign: "left" }}
        >
          <span style={{ minWidth: 0 }}>
            <span style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>Palauta tai tarkista varmuuskopio</span>
            <span style={{ display: "block", fontSize: 12, color: C.inkFaint, marginTop: 2, lineHeight: 1.45 }}>
              Näet aina ensin, mitä palautus muuttaisi.
            </span>
          </span>
          {open ? (
            <ChevronUp size={18} style={{ color: C.inkFaint, flex: "0 0 auto" }} />
          ) : (
            <ChevronDown size={18} style={{ color: C.inkFaint, flex: "0 0 auto" }} />
          )}
        </button>

        {open && (
          <div style={{ marginTop: 14, borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
            {canUndo && (
              <button
                className="tap"
                onClick={onUndo}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", marginBottom: 12, padding: "11px", borderRadius: 12, border: `1px solid ${C.amberLine}`, background: C.amberTint, color: C.amber, fontSize: 14, fontWeight: 600 }}
              >
                <RotateCcw size={16} /> Peru viimeisin tuonti tai palautus
              </button>
            )}

            <Label>Laitteen sisäiset kopiot</Label>
            {snaps == null ? (
              <div style={{ fontSize: 13, color: C.inkFaint, padding: "6px 0" }}>Luetaan…</div>
            ) : snaps.length === 0 ? (
              <div style={{ fontSize: 13, color: C.inkFaint, padding: "6px 0", lineHeight: 1.5 }}>
                Ei vielä kopioita. Ensimmäinen syntyy sovelluksen seuraavalla käynnistyksellä.
              </div>
            ) : (
              <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
                {snaps.map((s, i) => {
                  const on = pick && pick.kind === "snapshot" && pick.label === s.date;
                  return (
                    <button
                      key={s.date}
                      className="tap"
                      onClick={() => {
                        setError("");
                        setDone("");
                        setPick(
                          on
                            ? null
                            : {
                                kind: "snapshot",
                                label: s.date,
                                detail: clock(s.at),
                                dataset: s.dataset,
                              }
                        );
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 12px",
                        borderTop: i === 0 ? "none" : `1px solid ${C.line}`,
                        background: on ? C.pineTint : "transparent",
                      }}
                    >
                      <span style={{ minWidth: 0 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>{humanDate(s.date)}</span>
                        {s.at && <span style={{ fontSize: 12, color: C.inkFaint }}> {clock(s.at)}</span>}
                        <span style={{ display: "block", fontSize: 12, color: C.inkSoft, marginTop: 1 }}>
                          {s.summary.days} päivää · {s.summary.exercises} liikettä · {s.summary.psfs} PSFS
                        </span>
                      </span>
                      <HardDriveDownload size={16} style={{ flex: "0 0 auto", color: on ? C.pineDeep : C.inkFaint }} />
                    </button>
                  );
                })}
              </div>
            )}

            <p style={{ fontSize: 11.5, color: C.inkFaint, margin: "8px 2px 0", lineHeight: 1.5 }}>
              Nämä kopiot ovat samassa selaimen tallennustilassa kuin varsinaiset tiedot. Ne suojaavat
              virheelliseltä kirjoitukselta ja väärältä tuonnilta, <b>eivät</b> selaimen tallennustilan
              tyhjentämiseltä tai laitteen vaihtoa. Siihen tarvitaan tiedosto.
            </p>

            <Label>Varmuuskopiotiedosto</Label>
            <input type="file" accept=".json,application/json" ref={fileRef} onChange={onFile} style={{ display: "none" }} />
            <button
              className="tap"
              onClick={() => fileRef.current && fileRef.current.click()}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "12px", borderRadius: 12, border: `1px solid ${C.pine}`, background: C.surface, color: C.pineDeep, fontSize: 14.5, fontWeight: 600 }}
            >
              <FileCheck2 size={17} /> Valitse tiedosto ja tarkista
            </button>
            <p style={{ fontSize: 11.5, color: C.inkFaint, margin: "8px 2px 0", lineHeight: 1.5 }}>
              Tarkistus ei muuta mitään. Tee tämä kerran jokaiselle uudelle varmuuskopiotavalle — kopio,
              jota ei ole koskaan luettu takaisin, on toive eikä varmuuskopio.
            </p>

            {error && (
              <div style={{ marginTop: 12, fontSize: 12.5, fontWeight: 600, color: C.amber, background: C.amberTint, border: `1px solid ${C.amberLine}`, borderRadius: 10, padding: "10px 12px", lineHeight: 1.45 }}>
                {error}
              </div>
            )}
            {done && (
              <div style={{ marginTop: 12, fontSize: 12.5, fontWeight: 600, color: C.pineDeep }}>{done}</div>
            )}

            {pick && <DiffCard current={current} pick={pick} onApply={apply} onCancel={() => setPick(null)} busy={busy} />}
          </div>
        )}
      </div>
    </>
  );
}

function DiffCard({ current, pick, onApply, onCancel, busy }) {
  const d = diffDatasets(current, pick.dataset);
  const rows: [string, number, number, number][] = [
    ["Päiviä", d.current.days, d.incoming.days, d.delta.days],
    ["Liikkeitä", d.current.exercises, d.incoming.exercises, d.delta.exercises],
    ["Oireita", d.current.symptoms, d.incoming.symptoms, d.delta.symptoms],
    ["Merkkipaaluja", d.current.marks, d.incoming.marks, d.delta.marks],
    ["PSFS-arvioita", d.current.psfs, d.incoming.psfs, d.delta.psfs],
  ];

  return (
    <div style={{ marginTop: 14, background: C.surfaceSoft, border: `1px solid ${C.line}`, borderRadius: 12, padding: 12 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>
        {pick.kind === "snapshot" ? `Kopio ${humanDate(pick.label)}` : pick.label}
        {pick.detail && <span style={{ fontWeight: 400, color: C.inkFaint }}> · {pick.detail}</span>}
      </div>
      {d.incoming.first && (
        <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 2 }}>
          Sisältää merkinnät {humanDate(d.incoming.first)} – {humanDate(d.incoming.last)}
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        {rows.map(([label, a, b, delta]) => (
          <div
            key={label}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "4px 0", fontSize: 12.5 }}
          >
            <span style={{ color: C.inkSoft }}>{label}</span>
            <span style={{ fontVariantNumeric: "tabular-nums", color: C.ink }}>
              {a} → <b>{b}</b>{" "}
              <span style={{ color: delta < 0 ? C.amber : delta > 0 ? C.pineDeep : C.inkFaint, fontWeight: 600 }}>
                {delta === 0 ? "±0" : delta > 0 ? `+${delta}` : delta}
              </span>
            </span>
          </div>
        ))}
      </div>

      {d.identical ? (
        <div style={{ fontSize: 12.5, color: C.inkSoft, marginTop: 8, lineHeight: 1.5 }}>
          Sisältö vastaa nykyisiä tietoja. Palautus ei muuttaisi mitään — tämä on hyvä tulos
          tarkistukselle.
        </div>
      ) : d.lostDays.length > 0 ? (
        <div
          style={{ display: "flex", gap: 8, marginTop: 10, background: C.amberTint, border: `1px solid ${C.amberLine}`, borderRadius: 10, padding: "9px 11px" }}
        >
          <AlertTriangle size={16} style={{ flex: "0 0 auto", color: C.amber, marginTop: 1 }} />
          <div style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.5 }}>
            <b>
              {d.lostDays.length} päivän merkinnät poistuisivat
            </b>{" "}
            — vanhin {humanDate(d.lostDays[0])}, uusin {humanDate(d.lostDays[d.lostDays.length - 1])}. Vie
            nykyiset tiedot tiedostoksi ensin, jos et ole varma.
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: C.inkSoft, marginTop: 8, lineHeight: 1.5 }}>
          Yhtään nykyistä päivää ei poistuisi.
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <button
          className="tap"
          onClick={onApply}
          disabled={busy}
          style={{ flex: 1, padding: "12px", borderRadius: 12, background: d.lostDays.length > 0 ? C.amber : C.pine, color: "#fff", fontSize: 14.5, fontWeight: 600, opacity: busy ? 0.7 : 1 }}
        >
          {busy ? "Palautetaan…" : "Palauta"}
        </button>
        <button
          className="tap"
          onClick={onCancel}
          disabled={busy}
          style={{ flex: 1, padding: "12px", borderRadius: 12, border: `1px solid ${C.line}`, background: C.surface, color: C.inkSoft, fontSize: 14.5, fontWeight: 600, opacity: busy ? 0.5 : 1 }}
        >
          Peruuta
        </button>
      </div>
    </div>
  );
}

function Label({ children }) {
  return (
    <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: C.inkSoft, fontWeight: 700, margin: "16px 2px 7px" }}>
      {children}
    </div>
  );
}

function SectionHeading({ children }) {
  return (
    <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: C.inkSoft, fontWeight: 700, margin: "22px 2px 9px" }}>
      {children}
    </div>
  );
}
