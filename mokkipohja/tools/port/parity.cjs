// Parity check: the old single-file Mökkipohja vs the new Vite build.
//
//   node parity.cjs <old.html> <distDir> <outDir>
//
// Both run the same scripted session in fresh browser contexts with the same
// seeded storage and the same seeded Math.random, so ids generated during the
// session match too. After every step the rendered DOM, the stored data and any
// canvas output are captured; the run fails on the first difference.
const { chromium } = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright");
const http = require("http"), fs = require("fs"), path = require("path");

const [OLD, DIST, OUT] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split("?")[0]);
  let file = null;
  if (u === "/old/" || u === "/old/index.html") file = OLD;
  else if (u.startsWith("/mokkipohja/")) {
    file = path.join(DIST, u.slice("/mokkipohja/".length) || "index.html");
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  }
  if (!file || !fs.existsSync(file)) { res.writeHead(404); return res.end("nf"); }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
  res.end(fs.readFileSync(file));
});

const SEED_RANDOM = `(() => { let a = 0x9e3779b9; Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();`;

// a cabin with every kind of thing: L room with a gable ceiling, a free wall,
// doors, windows, furniture of several groups, and a shed-roofed annex
const L = [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 3000 }, { x: 3000, y: 3000 }, { x: 3000, y: 6000 }, { x: 0, y: 6000 }];
const R = [{ x: 8000, y: 0 }, { x: 12000, y: 0 }, { x: 12000, y: 4000 }, { x: 8000, y: 4000 }];
const seedDoc = {
  id: "P1", name: "Seed", wallT: 150, image: null, items: [], openings: [],
  rooms: [
    { id: "RA", name: "Tupa", points: L, ceiling: { mode: "gable", h: 2400, eaveH: 2000, ridgeH: 3600, axis: "x", ridge: 0.5 }, autoWalls: null },
    { id: "RB", name: "Sauna", points: R, ceiling: { mode: "shed", h: 2400, eaveH: 2000, ridgeH: 2900, axis: "y", ridge: 0.5 }, autoWalls: null },
  ],
  walls: [
    { id: "W1", x1: 0, y1: 0, x2: 6000, y2: 0, t: 150 }, { id: "W2", x1: 6000, y1: 0, x2: 6000, y2: 3000, t: 150 },
    { id: "W3", x1: 0, y1: 0, x2: 0, y2: 6000, t: 150 }, { id: "W4", x1: -3000, y1: 8000, x2: 3000, y2: 8000, t: 150 },
  ],
};
seedDoc.openings = [
  { id: "O1", wallId: "W1", off: 1000, w: 1200, kind: "window", flip: false, side: 1 },
  { id: "O2", wallId: "W3", off: 2500, w: 900, kind: "door", flip: false, side: 1 },
  { id: "O3", wallId: "W2", off: 800, w: 1000, kind: "window", flip: false, side: 1 },
];

async function session(browser, url, label) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: false });
  await ctx.addInitScript(SEED_RANDOM);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
  const steps = [];
  page.setDefaultTimeout(5000);
  const step = async (name, fn) => {
    try { await fn(); } catch (e) {
      steps.push({ name: name + " (failed)", dom: "", store: {}, canvases: [], err: String(e.message).split("\n")[0] });
      return;
    }
    await snap(name);
  };
  const settle = (ms = 900) => page.waitForTimeout(ms);
  const snap = async (name, extra = {}) => {
    const s = await page.evaluate(() => {
      const store = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        store[k] = localStorage.getItem(k).replace(/"(updated|saved)":\s*\d+/g, '"$1":0');
      }
      const canvases = [...document.querySelectorAll("canvas")].map((c) => { try { return c.width + "x" + c.height + ":" + c.toDataURL().length + ":" + c.toDataURL().slice(-80); } catch (e) { return "tainted"; } });
      return { dom: document.getElementById("root").innerHTML, store, canvases };
    });
    steps.push({ name, ...s, ...extra });
  };
  const click = (sel, opts) => page.locator(sel).first().click(opts);
  const text = (t) => page.getByText(t, { exact: true }).first();
  const tool = (name) => page.getByRole("button", { name: new RegExp("^" + name + "$", "i") }).first();

  await page.goto(url); await settle(700);
  await snap("empty start");
  await step("starter room", async () => { await text("Start with a 5 × 7 m room").click(); await settle(1200); });
  await step("seeded cabin, fit", async () => {
    await page.evaluate((d) => {
      localStorage.clear();
      localStorage.setItem("mokkipohja:plans:index", JSON.stringify([{ id: d.id, name: d.name, updated: 1 }]));
      localStorage.setItem("mokkipohja:plan:" + d.id, JSON.stringify(d));
    }, seedDoc);
    await page.reload(); await settle(800);
    await text("FIT").click(); await settle(300);
  });
  await step("furniture sheet", async () => { await tool("FURNITURE").click(); await settle(400); });
  await step("placed sofa", async () => { await page.getByText(/^Sofa$/).first().click(); await settle(300); await page.mouse.click(120, 380); await settle(1000); });
  await step("tap room", async () => { await tool("SELECT").click(); await settle(200); await page.mouse.click(200, 600); await settle(300); });
  await step("dragged", async () => { await page.mouse.move(120, 380); await page.mouse.down(); await page.mouse.move(160, 420, { steps: 6 }); await page.mouse.up(); await settle(1000); });
  await step("undo", async () => { await text("Undo").click(); await settle(1000); });
  await step("drew wall", async () => { await tool("WALL").click(); await settle(200); await page.mouse.click(60, 700); await settle(150); await page.mouse.click(300, 700); await settle(150); await page.mouse.click(300, 700); await settle(900); });
  await step("section tool", async () => { await tool("SECTION").click(); await settle(500); });
  await step("section view", async () => { await page.mouse.click(40, 500); await page.mouse.click(350, 500); await settle(800); });
  await step("section closed", async () => { await page.getByText("✕", { exact: true }).last().click(); await settle(400); });
  await step("3D orbit", async () => { await tool("3D").click(); await settle(1500); });
  await step("3D orbit dragged", async () => { await page.mouse.move(200, 400); await page.mouse.down(); await page.mouse.move(260, 430, { steps: 5 }); await page.mouse.up(); await settle(500); });
  await step("3D walk", async () => { await text("Walk").click(); await settle(800); });
  await step("3D closed", async () => { await page.getByText("✕", { exact: true }).last().click(); await settle(400); });
  await step("export sheet", async () => { await tool("EXPORT").click(); await settle(1200); });
  await step("reloaded", async () => { await page.reload(); await settle(900); });
  await step("plan sheet", async () => { await page.getByText(/▾$/).first().click(); await settle(400); });
  await step("finnish", async () => { await page.getByText("Suomi", { exact: true }).first().click(); await settle(900); });
  let backup = null;
  await step("backup", async () => {
    const save = page.getByText(/^(Save backup|Tallenna varmuuskopio)$/).first();
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 5000 }), save.click()]);
    backup = fs.readFileSync(await dl.path(), "utf8").replace(/"saved":\s*"[^"]+"/, '"saved":""').replace(/\\"updated\\":\d+/g, '\\"updated\\":0');
  });
  if (steps.length) steps[steps.length - 1].backup = backup;
  await ctx.close();
  return { steps, errors };
}

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const a = await session(browser, `http://127.0.0.1:${port}/old/`, "old");
  const b = await session(browser, `http://127.0.0.1:${port}/mokkipohja/`, "new");
  await browser.close(); server.close();

  fs.writeFileSync(path.join(OUT, "all-new.json"), JSON.stringify(b.steps));
  let diffs = 0;
  for (let i = 0; i < Math.max(a.steps.length, b.steps.length); i++) {
    const x = a.steps[i], y = b.steps[i];
    if (!x || !y) { console.log(`step ${i}: missing in ${x ? "new" : "old"}`); diffs++; continue; }
    const parts = ["dom", "canvases", "backup"].filter((k) => JSON.stringify(x[k]) !== JSON.stringify(y[k]));
    if (JSON.stringify(x.store) !== JSON.stringify(y.store)) parts.push("store");
    console.log(`${parts.length ? "DIFF" : "same"}  ${x.name}${parts.length ? "  [" + parts.join(", ") + "]" : ""}  (dom ${x.dom.length} chars, ${Object.keys(x.store).length} keys, ${x.canvases.length} canvases)`);
    if (parts.length) {
      diffs++;
      fs.writeFileSync(path.join(OUT, `step${i}-old.json`), JSON.stringify(x, null, 1));
      fs.writeFileSync(path.join(OUT, `step${i}-new.json`), JSON.stringify(y, null, 1));
    }
  }
  console.log("errors old:", a.errors, " new:", b.errors);
  console.log(diffs ? `${diffs} step(s) differ` : `PARITY: all ${a.steps.length} steps identical`);
  process.exit(diffs ? 1 : 0);
})();
