/* domain/reportview — turns a report model into markup, as strings.
 *
 * One source of truth on purpose. The same `reportBodyHTML` output is injected
 * into the on-screen preview, printed, and written into the downloadable .html
 * file, so what you see is exactly what the physiotherapist gets. Rendering the
 * preview as JSX and the file as a template would be two renderers to keep in
 * step, and they would drift.
 *
 * Strings rather than React also means the whole page is testable in the domain
 * layer with no DOM, and the downloadable file has no dependencies at all — it
 * opens on any machine, forever, with styling intact.
 *
 * Design brief: this is a clinical document, not an app screen. Black on white,
 * hairline rules, tabular numbers, A4 with real margins, no brand colour blocks
 * that cost someone else's toner. It should look like something that gets filed.
 */

import { humanDate } from "./dates";
import { FREQ_DAILY } from "./freq";
import { PSFS_INTERVAL_DAYS, PSFS_MAX, PSFS_MDC_SINGLE, PSFS_MID, psfsBandLabel } from "./psfs";

const esc = (v) =>
  String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/* preserve typed line breaks inside notes and questions */
const escMultiline = (v) => esc(v).replace(/\r?\n/g, "<br>");

const shortKey = (k) => {
  const [, m, d] = k.split("-");
  return `${Number(d)}.${Number(m)}.`;
};

const signed = (n) => (n > 0 ? `+${n}` : String(n));

export const reportCSS = `
.rpt { --ink:#111; --soft:#555; --faint:#777; --rule:#c9cfcc; --band:#f2f5f3;
  color:var(--ink); background:#fff; font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.rpt * { box-sizing:border-box; }
.rpt .sheet { max-width:186mm; margin:0 auto; padding:2mm 0 6mm; }
.rpt h1 { font-size:19px; font-weight:650; margin:0; letter-spacing:-0.01em; }
.rpt h2 { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.1em;
  margin:16px 0 6px; padding-bottom:3px; border-bottom:1px solid var(--rule); }
.rpt .head { display:flex; justify-content:space-between; align-items:flex-end; gap:12px;
  border-bottom:2px solid var(--ink); padding-bottom:7px; }
.rpt .head .meta { text-align:right; font-size:11px; color:var(--faint); white-space:nowrap; }
.rpt .range { font-size:12.5px; color:var(--soft); margin-top:2px; }
.rpt .kpis { display:flex; flex-wrap:wrap; gap:0; margin:10px 0 0; border:1px solid var(--rule); }
.rpt .kpi { flex:1 1 25%; min-width:88px; padding:8px 10px; border-right:1px solid var(--rule); }
.rpt .kpi:last-child { border-right:0; }
.rpt .kpi b { display:block; font-size:20px; font-weight:600; font-variant-numeric:tabular-nums; line-height:1.15; }
.rpt .kpi span { display:block; font-size:10.5px; color:var(--faint); text-transform:uppercase; letter-spacing:0.05em; margin-top:2px; }
.rpt table { width:100%; border-collapse:collapse; font-size:12.5px; }
.rpt th { text-align:left; font-size:10.5px; text-transform:uppercase; letter-spacing:0.05em;
  color:var(--faint); font-weight:700; padding:4px 6px 4px 0; border-bottom:1px solid var(--rule); }
.rpt td { padding:4px 6px 4px 0; border-bottom:1px solid #e8ebe9; vertical-align:top; }
.rpt th.n, .rpt td.n { text-align:right; padding-right:0; font-variant-numeric:tabular-nums; white-space:nowrap; }
.rpt tr { break-inside:avoid; page-break-inside:avoid; }
.rpt .sub { font-size:11px; color:var(--faint); }
.rpt .q { border:1px solid var(--ink); padding:9px 11px; margin-top:6px; }
.rpt .bar { display:inline-block; width:38px; height:6px; background:var(--band); vertical-align:1px; margin-right:5px; }
.rpt .bar i { display:block; height:100%; background:#444; }
.rpt ul.list { margin:4px 0 0; padding:0; list-style:none; }
.rpt ul.list li { padding:3px 0; border-bottom:1px solid #e8ebe9; display:flex; gap:9px; break-inside:avoid; }
.rpt ul.list li time { flex:0 0 44px; color:var(--faint); font-variant-numeric:tabular-nums; font-size:11.5px; }
.rpt .note { white-space:normal; }
.rpt .method { margin-top:18px; padding-top:7px; border-top:1px solid var(--rule); font-size:10.5px; color:var(--faint); line-height:1.5; }
.rpt .method p { margin:0 0 3px; }
.rpt .empty { color:var(--faint); font-size:12px; padding:3px 0; }
.rpt section { break-inside:auto; }
.rpt h2 { break-after:avoid; page-break-after:avoid; }
@page { size:A4 portrait; margin:14mm; }
@media print { .rpt .sheet { max-width:none; padding:0; } }
`;

function kpis(m) {
  const items = [];
  items.push([m.adherence.pct == null ? "–" : `${m.adherence.pct} %`, "Ohjelman toteutuma"]);
  items.push([`${m.adherence.trainedDays}/${m.spanDays}`, "Harjoituspäiviä"]);
  items.push([`${m.symptomFreeDays}/${m.spanDays}`, "Oireettomia päiviä"]);
  if (m.psfs && m.psfs.change) {
    items.push([signed(m.psfs.change.delta), `PSFS-muutos (${m.psfs.change.last.mean}/${PSFS_MAX})`]);
  } else if (m.psfs && m.psfs.series.length) {
    items.push([`${m.psfs.series[m.psfs.series.length - 1].mean}`, `PSFS-keskiarvo / ${PSFS_MAX}`]);
  }
  return `<div class="kpis">${items
    .map(([v, l]) => `<div class="kpi"><b>${esc(v)}</b><span>${esc(l)}</span></div>`)
    .join("")}</div>`;
}

function exerciseTable(m) {
  if (!m.exercises.length) return `<p class="empty">Ei aktiivisia liikkeitä.</p>`;
  const rows = m.exercises
    .map((e) => {
      const p = e.completePct == null ? 0 : e.completePct;
      const bar = `<span class="bar"><i style="width:${Math.min(100, p)}%"></i></span>`;
      const unit = e.unit === "min" ? "min" : "sarjaa";
      const presc = [e.dose, e.freq < FREQ_DAILY ? e.freqText : ""].filter(Boolean).join(" · ");
      return `<tr>
        <td>${esc(e.name)}${presc ? `<div class="sub">${esc(presc)}</div>` : ""}${
        e.since ? `<div class="sub">mukana ${esc(shortKey(e.since))} alkaen</div>` : ""
      }</td>
        <td class="n">${bar}${e.completePct == null ? "–" : `${e.completePct} %`}</td>
        <td class="n">${e.daysComplete}/${e.target}</td>
        <td class="n">${e.unitsDone}/${e.unitsGoal} ${esc(unit)}</td>
        <td class="n">${e.over || ""}</td>
      </tr>`;
    })
    .join("");
  return `<table>
    <thead><tr>
      <th>Liike</th><th class="n">Toteutuma</th><th class="n">Kerrat</th>
      <th class="n">Määrä</th><th class="n">Yli annoksen</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>${m.archivedExercises ? `<p class="sub">Lisäksi ${m.archivedExercises} arkistoitua liikettä, jotka eivät ole mukana luvuissa.</p>` : ""}`;
}

function symptomTable(m) {
  if (!m.symptoms.length) return `<p class="empty">Ei seurattavia oireita.</p>`;
  const rows = m.symptoms
    .map(
      (s) => `<tr>
        <td>${esc(s.name)}${
        s.qualities.length
          ? `<div class="sub">${esc(s.qualities.map((q) => `${q.label} ${q.n}×`).join(", "))}</div>`
          : ""
      }</td>
        <td class="n">${s.days}</td>
        <td class="n">${s.pct == null ? "–" : `${s.pct} %`}</td>
        <td class="n">${s.meanSeverity == null ? "–" : s.meanSeverity}</td>
        <td class="n">${esc(s.worstLabel || "–")}</td>
      </tr>`
    )
    .join("");
  return `<table>
    <thead><tr>
      <th>Oire</th><th class="n">Päiviä</th><th class="n">Osuus</th>
      <th class="n">Voimakkuus ka.</th><th class="n">Pahin</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/* A one-pager cannot carry a column per fortnight forever. Past this many
   assessments the grid keeps the baseline — the delta is measured from it — plus
   the most recent ones, and says so. Per-activity change figures come from the
   full series in report.ts, so trimming the display never changes a number. */
const PSFS_MAX_COLUMNS = 8;

function psfsSection(m) {
  const p = m.psfs;
  if (!p) return "";
  const all = p.series;
  const trimmed = all.length > PSFS_MAX_COLUMNS;
  const shown = trimmed ? [all[0], ...all.slice(-(PSFS_MAX_COLUMNS - 1))] : all;
  const dates = shown.map((e) => e.date);
  const head = dates.map((d) => `<th class="n">${esc(shortKey(d))}</th>`).join("");
  const rows = p.activities
    .map((a) => {
      const cells = shown
        .map((e) => {
          const v = e.scores[a.id];
          return `<td class="n">${typeof v === "number" ? v : "–"}</td>`;
        })
        .join("");
      const flag = a.beyondNoise ? ` <span class="sub">(≥ ${PSFS_MDC_SINGLE})</span>` : "";
      return `<tr><td>${esc(a.name)}${a.retired ? ` <span class="sub">(päättynyt)</span>` : ""}</td>${cells}<td class="n">${signed(
        a.delta
      )}${flag}</td></tr>`;
    })
    .join("");
  const meanRow = `<tr><td><b>Keskiarvo</b></td>${shown
    .map((e) => `<td class="n"><b>${e.mean}</b></td>`)
    .join("")}<td class="n"><b>${p.change ? signed(p.change.delta) : "–"}</b></td></tr>`;

  const verdict = p.change
    ? `<p class="sub">Muutos ensimmäisestä arviosta ${esc(humanDate(p.change.first.date))} viimeisimpään ${esc(
        humanDate(p.change.last.date)
      )}: ${signed(p.change.delta)} pistettä — ${esc(psfsBandLabel(p.change.band, p.change.delta))}.</p>`
    : `<p class="sub">Vain yksi arvio tehty. Muutosta voi tulkita vasta toisesta arviosta alkaen.</p>`;

  return `<section><h2>Toimintakyky — PSFS</h2>
    <table><thead><tr><th>Toiminto</th>${head}<th class="n">Muutos</th></tr></thead>
    <tbody>${rows}${meanRow}</tbody></table>
    ${verdict}
    ${
      trimmed
        ? `<p class="sub">Sarakkeissa ensimmäinen ja ${PSFS_MAX_COLUMNS - 1} viimeisintä arviota; arvioita on tehty yhteensä ${all.length}. Muutosluvut on laskettu koko sarjasta.</p>`
        : ""
    }</section>`;
}

function markList(items, emptyText) {
  if (!items.length) return `<p class="empty">${esc(emptyText)}</p>`;
  return `<ul class="list">${items
    .map((i) => `<li><time>${esc(shortKey(i.date))}</time><span>${escMultiline(i.text)}</span></li>`)
    .join("")}</ul>`;
}

/* ------------------------------------------------------------------ */
/*  Body — injected into the preview and into the standalone file       */
/* ------------------------------------------------------------------ */
export function reportBodyHTML(m, opts = {} as any) {
  const questions = (opts.questions || "").trim();
  const title = opts.title || "Liikepäiväkirja — yhteenveto";
  const gen = new Date(m.generatedAt);
  const genStr = `${gen.getDate()}.${gen.getMonth() + 1}.${gen.getFullYear()}`;

  const rangeLine = `${humanDate(m.from)} – ${humanDate(m.to)} · ${m.spanDays} päivää${
    m.truncated ? ` (koko kirjatun jakson pituus)` : ""
  }`;

  return `<div class="sheet">
  <div class="head">
    <div>
      <h1>${esc(title)}</h1>
      <div class="range">${esc(rangeLine)}</div>
    </div>
    <div class="meta">Tulostettu ${esc(genStr)}<br>Itse raportoitua seurantaa</div>
  </div>

  ${kpis(m)}

  ${
    questions
      ? `<section><h2>Kysymykset ja huomiot</h2><div class="q">${escMultiline(questions)}</div></section>`
      : ""
  }

  ${psfsSection(m)}

  <section><h2>Harjoittelu</h2>${exerciseTable(m)}</section>

  <section><h2>Oireet</h2>${symptomTable(m)}
    ${
      m.steps
        ? `<p class="sub">Askeleet keskimäärin ${m.steps.mean.toLocaleString("fi-FI")} / vrk (${m.steps.days} päivältä dataa).</p>`
        : ""
    }
  </section>

  ${
    m.doseChanges.length
      ? `<section><h2>Annosmuutokset</h2>${markList(m.doseChanges, "")}</section>`
      : ""
  }

  ${
    m.milestones.length
      ? `<section><h2>Merkkipaalut</h2>${markList(m.milestones, "")}</section>`
      : ""
  }

  ${
    m.notes.length
      ? `<section><h2>Muistiinpanot</h2>${markList(m.notes, "")}${
          m.notesTotal > m.notes.length
            ? `<p class="sub">Näytetään ${m.notes.length} uusinta ${m.notesTotal} merkinnästä.</p>`
            : ""
        }</section>`
      : ""
  }

  <div class="method">
    <p><b>Miten luvut on laskettu.</b> Toteutuma vertaa tehtyä määrää siihen annokseen, joka oli voimassa kyseisenä päivänä — annoksen muuttaminen ei muuta historiaa. Liikkeen jakso alkaa päivästä, jona se ensimmäisen kerran kirjattiin, ei jakson alusta. <b>Kerrat</b> on toteutuneet kerrat suhteessa siihen, montako kertaa ohjeistus edellytti tällä jaksolla; päivittäisillä liikkeillä se on jakson päivien määrä, harvemmilla viikkotavoite jaksoon suhteutettuna.</p>
    <p><b>PSFS</b> (Patient-Specific Functional Scale): henkilön itse nimeämät toiminnot, asteikko 0 = en pysty lainkaan … ${PSFS_MAX} = pystyn kuten ennen vaivaa. Arvio ${PSFS_INTERVAL_DAYS} päivän välein. Keskiarvon merkittävän muutoksen raja-arvot ${PSFS_MID.small} (pieni), ${PSFS_MID.medium} (kohtalainen) ja ${PSFS_MID.large} (suuri); yksittäisen toiminnon pienin luotettavasti havaittava muutos on noin ${PSFS_MDC_SINGLE} pistettä.</p>
    <p>Kaikki tiedot ovat henkilön itsensä kirjaamia. Tämä ei ole diagnoosi eikä hoitosuositus.</p>
  </div>
</div>`;
}

/* ------------------------------------------------------------------ */
/*  Standalone file — no dependencies, opens anywhere, prints the same  */
/* ------------------------------------------------------------------ */
export function reportDocument(m, opts = {} as any) {
  const title = opts.title || "Liikepäiväkirja — yhteenveto";
  return `<!doctype html>
<html lang="fi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} ${esc(m.from)} – ${esc(m.to)}</title>
<style>
html,body { margin:0; padding:0; background:#fff; }
body { padding:16px; }
@media print { body { padding:0; } }
${reportCSS}
</style>
</head>
<body>
<div class="rpt">${reportBodyHTML(m, opts)}</div>
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/*  Plain text — for pasting into a message or an email                */
/* ------------------------------------------------------------------ */
export function reportText(m, opts = {} as any) {
  const L = [];
  const questions = (opts.questions || "").trim();
  L.push(opts.title || "LIIKEPÄIVÄKIRJA — YHTEENVETO");
  L.push(`${humanDate(m.from)} – ${humanDate(m.to)} (${m.spanDays} pv)`);
  L.push("");
  L.push(`Ohjelman toteutuma: ${m.adherence.pct == null ? "–" : m.adherence.pct + " %"}`);
  L.push(`Harjoituspäiviä: ${m.adherence.trainedDays}/${m.spanDays}`);
  L.push(`Oireettomia päiviä: ${m.symptomFreeDays}/${m.spanDays}`);

  if (questions) {
    L.push("");
    L.push("KYSYMYKSET JA HUOMIOT");
    L.push(questions);
  }

  if (m.psfs) {
    L.push("");
    L.push(`TOIMINTAKYKY (PSFS, 0–${PSFS_MAX})`);
    m.psfs.activities.forEach((a) => {
      L.push(`- ${a.name}: ${a.firstScore} (${shortKey(a.firstDate)}) → ${a.lastScore} (${shortKey(a.lastDate)}), ${signed(a.delta)}`);
    });
    if (m.psfs.change) {
      L.push(
        `  Keskiarvo ${m.psfs.change.first.mean} → ${m.psfs.change.last.mean}, ${signed(
          m.psfs.change.delta
        )} — ${psfsBandLabel(m.psfs.change.band, m.psfs.change.delta)}`
      );
    }
  }

  L.push("");
  L.push("HARJOITTELU");
  m.exercises.forEach((e) => {
    const d = e.dose ? ` (${e.dose})` : "";
    const f = e.freq < FREQ_DAILY ? `, ${e.freqText}` : "";
    L.push(`- ${e.name}${d}${f}: ${e.completePct == null ? "–" : e.completePct + " %"}, ${e.daysComplete}/${e.target} kertaa${e.over ? `, yli annoksen ${e.over} pv` : ""}`);
  });

  L.push("");
  L.push("OIREET");
  if (!m.symptoms.length) L.push("- ei seurattavia oireita");
  m.symptoms.forEach((s) => {
    L.push(`- ${s.name}: ${s.days} pv${s.pct == null ? "" : ` (${s.pct} %)`}${s.meanSeverity == null ? "" : `, voimakkuus ka. ${s.meanSeverity}`}`);
  });

  if (m.doseChanges.length) {
    L.push("");
    L.push("ANNOSMUUTOKSET");
    m.doseChanges.forEach((d) => L.push(`- ${shortKey(d.date)} ${d.text}`));
  }
  if (m.milestones.length) {
    L.push("");
    L.push("MERKKIPAALUT");
    m.milestones.forEach((d) => L.push(`- ${shortKey(d.date)} ${d.text}`));
  }
  if (m.notes.length) {
    L.push("");
    L.push("MUISTIINPANOT");
    m.notes.forEach((d) => L.push(`- ${shortKey(d.date)} ${d.text.replace(/\r?\n/g, " ")}`));
  }

  L.push("");
  L.push("Itse raportoitua seurantaa. Toteutuma on laskettu kunakin päivänä voimassa olleeseen annokseen.");
  return L.join("\n");
}
