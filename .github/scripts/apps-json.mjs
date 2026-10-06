// Writes <site>/apps.json, the list the landing page renders.
//
//   node .github/scripts/apps-json.mjs <site-dir> <app>...
//
// Each card is read from the app's own published index.html, so adding an app
// never means editing the landing page:
//
//   name         <title>, up to the first " — ", " – ", " - ", " | " or " · "
//   description  <meta name="description">, else the rest of the <title>
//   lang         the description's own lang attribute, else <html lang>
//   icon         <link rel="apple-touch-icon">, else <link rel="icon">
//
// The deployed commit goes in as well, so the landing page can answer "did the
// deploy I just ran land?" by looking, the same question BUILD_ID answers
// inside an app.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [site, ...ids] = process.argv.slice(2);
if (!site) {
  console.error("usage: node apps-json.mjs <site-dir> <app>...");
  process.exit(2);
}

const NAMED = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", hellip: "…",
  auml: "ä", ouml: "ö", aring: "å", Auml: "Ä", Ouml: "Ö", Aring: "Å",
};

function decode(s) {
  return s.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e) => {
    if (e[0] !== "#") return NAMED[e] ?? m;
    const cp = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
  });
}

// A quoted attribute value may contain ">", so a tag ends at the first ">"
// outside quotes.
const tags = (h, name) =>
  [...h.matchAll(new RegExp(`<${name}\\b((?:[^>"']|"[^"]*"|'[^']*')*)>`, "gi"))].map((m) => attrs(m[1]));

function attrs(src) {
  const out = {};
  for (const m of src.matchAll(/([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    out[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return out;
}

// Scripts, styles and comments can contain anything, "</head>" included, so
// they go before looking for where the head ends. A browser ends a script at
// the first "</script>" too, so the lazy match agrees with it.
function headOf(html) {
  const bare = html.replace(/<script\b[\s\S]*?<\/script\s*>|<style\b[\s\S]*?<\/style\s*>|<!--[\s\S]*?-->/gi, "");
  const end = bare.search(/<\/head\s*>|<body\b/i);
  return end < 0 ? bare : bare.slice(0, end);
}

// data:, https:, //host and /root references already work from the landing
// page; anything else is relative to the app's own folder.
const resolve = (href, id) => (/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(href) ? href : `${id}/${href.replace(/^\.\//, "")}`);

function card(id) {
  const head = headOf(readFileSync(join(site, id, "index.html"), "utf8"));
  const html = tags(head, "html")[0] ?? {};
  const title = decode(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(head)?.[1] ?? "").replace(/\s+/g, " ").trim();
  const [name, ...rest] = title.split(/\s+[—–|·-]\s+/);

  const meta = tags(head, "meta").find((m) => (m.name ?? "").toLowerCase() === "description" && m.content?.trim());
  const links = tags(head, "link").filter((l) => l.href);
  const rels = (l) => (l.rel ?? "").toLowerCase().split(/\s+/);
  const icon =
    links.find((l) => rels(l).some((r) => r.startsWith("apple-touch-icon"))) ??
    links.find((l) => rels(l).includes("icon"));

  return {
    id,
    name: name || id,
    description: meta ? meta.content.trim() : rest.join(" — "),
    lang: (meta && meta.lang) || html.lang || "",
    icon: icon ? resolve(icon.href, id) : "",
  };
}

function deployedCommit() {
  try {
    const [sha, subject] = execFileSync("git", ["log", "-1", "--format=%H%n%s"], { encoding: "utf8" }).split("\n");
    const { GITHUB_SERVER_URL: server, GITHUB_REPOSITORY: repo } = process.env;
    return { sha, subject, ...(server && repo ? { url: `${server}/${repo}/commit/${sha}` } : {}) };
  } catch {
    return undefined; // not a git checkout: the landing page leaves the line out
  }
}

const data = {
  built: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
  commit: deployedCommit(),
  apps: ids.map(card),
};
writeFileSync(join(site, "apps.json"), JSON.stringify(data, null, 2) + "\n");

for (const a of data.apps) {
  console.log(`listed ${a.id}: ${a.name}${a.description ? "" : " (no description)"}${a.icon ? "" : " (no icon)"}`);
}
