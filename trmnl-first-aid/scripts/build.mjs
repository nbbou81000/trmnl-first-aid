// Build script for the "First Aid Cards" TRMNL plugin.
// 1. Downloads every image listed in data/cards.json from Wikimedia Commons
//    (only once: images already in docs/img/manifest.json are skipped).
// 2. Converts them for e-ink: white background, grayscale, trimmed, contrast-stretched.
// 3. Writes one polling file per language: docs/cards-en.json, -de, -fr, -es.
// 4. Writes a public gallery with full image attribution: docs/index.html.

import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DOCS = path.join(ROOT, "docs");
const IMG_DIR = path.join(DOCS, "img");
const BASE = (process.env.PAGES_BASE || "https://nbbou81000.github.io/trmnl-first-aid").replace(/\/$/, "");
const UA = "trmnl-first-aid/1.0 (https://github.com/nbbou81000/trmnl-first-aid; nb.bouteiller@gmail.com)";
const LANGS = ["en", "de", "fr", "es"];
const FORCE = process.env.FORCE_IMAGES === "true";

const readJson = async (p, fallback) => {
  try { return JSON.parse(await fs.readFile(p, "utf8")); } catch { return fallback; }
};

const slug = (name) =>
  name.replace(/\.[a-z0-9]+$/i, "").normalize("NFKD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 80);

const stripHtml = (html = "") =>
  html.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;|&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchRetry(url, opts = {}, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...opts, headers: { "User-Agent": UA, ...(opts.headers || {}) } });
      if (res.ok) return res;
      if (res.status === 404) throw new Error(`404 ${url}`);
      console.warn(`HTTP ${res.status} on ${url}, retry ${i + 1}`);
    } catch (e) {
      if (String(e.message).startsWith("404")) throw e;
      console.warn(`Network error on ${url}: ${e.message}`);
    }
    await sleep(2000 * (i + 1));
  }
  throw new Error(`Failed after ${tries} tries: ${url}`);
}

async function commonsInfo(titles) {
  const out = {};
  for (let i = 0; i < titles.length; i += 40) {
    const batch = titles.slice(i, i + 40);
    const params = new URLSearchParams({
      action: "query", format: "json", prop: "imageinfo",
      iiprop: "url|extmetadata|size", iiurlwidth: "1000",
      titles: batch.map((t) => "File:" + t).join("|"),
    });
    const data = await (await fetchRetry("https://commons.wikimedia.org/w/api.php?" + params)).json();
    const norm = {};
    for (const n of data.query?.normalized || []) norm[n.to] = n.from;
    for (const page of Object.values(data.query?.pages || {})) {
      const original = (norm[page.title] || page.title).replace(/^File:/, "");
      if (!page.imageinfo) { console.warn(`Not found on Commons: ${original}`); continue; }
      const ii = page.imageinfo[0];
      const em = ii.extmetadata || {};
      out[original] = {
        thumb: ii.thumburl || ii.url,
        page: ii.descriptionurl,
        license: stripHtml(em.LicenseShortName?.value) || "see source",
        artist: stripHtml(em.Artist?.value) || "Unknown author",
      };
    }
  }
  return out;
}

async function toEink(buffer, outPath) {
  // White background for transparent SVG/PNG, grayscale, trim margins, fit for TRMNL X and OG.
  const flat = await sharp(buffer, { density: 200 })
    .flatten({ background: "#ffffff" })
    .grayscale()
    .png()
    .toBuffer();
  let img = sharp(flat);
  try { img = sharp(await img.trim({ background: "#ffffff", threshold: 12 }).toBuffer()); } catch { img = sharp(flat); }
  await img
    .resize({ width: 960, height: 720, fit: "inside", withoutEnlargement: true })
    .normalise()
    .extend({ top: 8, bottom: 8, left: 8, right: 8, background: "#ffffff" })
    .png({ compressionLevel: 9, palette: true, colours: 64 })
    .toFile(outPath);
}

function shortCredit(meta) {
  if (meta.local) return `${meta.artist}, ${meta.license}`;
  let artist = meta.artist
    .replace(/^Original\s*:\s*/i, "")
    .replace(/^Image created by\s+(User:)?/i, "")
    .split(/\s+(derivative work|Derivative work|Vectorized by|Vectorisation|Author info)\b/)[0]
    .replace(/^(Own work|Travail personnel)\b.*$/i, "")
    .replace(/[\s,]+$/, "").trim() || meta.artist;
  if (artist.length > 38) artist = artist.slice(0, 36).trim() + "…";
  return `${artist}, ${meta.license}, Wikimedia Commons`;
}

const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function main() {
  const cards = await readJson(path.join(ROOT, "data/cards.json"));
  const numbers = await readJson(path.join(ROOT, "data/numbers.json"));
  const ui = await readJson(path.join(ROOT, "data/ui.json"));
  await fs.mkdir(IMG_DIR, { recursive: true });

  // ---- Images -----------------------------------------------------------
  const manifestPath = path.join(IMG_DIR, "manifest.json");
  const manifest = FORCE ? {} : await readJson(manifestPath, {});
  const wanted = [...new Set(cards.flatMap((c) => c.imgs || []))];
  // Forget images no longer referenced by any card.
  for (const name of Object.keys(manifest)) {
    if (!wanted.includes(name)) {
      await fs.rm(path.join(IMG_DIR, manifest[name].file), { force: true });
      delete manifest[name];
      console.log(`  removed ${name}`);
    }
  }
  // Local images: public domain figures extracted from U.S. government manuals (data/images).
  const localMeta = await readJson(path.join(ROOT, "data/local-images.json"), {});
  for (const name of wanted.filter((n) => n.startsWith("local:") && !manifest[n])) {
    const src = name.slice(6);
    const meta = localMeta[src];
    if (!meta) { console.warn(`  No entry in data/local-images.json for ${src}`); continue; }
    const file = "local-" + slug(src) + ".png";
    try {
      await toEink(await fs.readFile(path.join(ROOT, "data/images", src)), path.join(IMG_DIR, file));
      manifest[name] = { file, page: meta.page, license: meta.license, artist: meta.source, local: true };
      console.log(`  ok  ${src}`);
    } catch (e) { console.warn(`  FAILED ${src}: ${e.message}`); }
  }
  const missing = wanted.filter((n) => !manifest[n] && !n.startsWith("local:"));
  console.log(`${wanted.length} images referenced, ${missing.length} to download from Commons.`);

  if (missing.length) {
    const info = await commonsInfo(missing);
    for (const name of missing) {
      const meta = info[name];
      if (!meta) continue;
      const file = slug(name) + ".png";
      try {
        const buf = Buffer.from(await (await fetchRetry(meta.thumb)).arrayBuffer());
        await toEink(buf, path.join(IMG_DIR, file));
        manifest[name] = { file, page: meta.page, license: meta.license, artist: meta.artist };
        console.log(`  ok  ${name}`);
      } catch (e) {
        console.warn(`  FAILED ${name}: ${e.message}`);
      }
      await sleep(400);
    }
  }
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 1));

  // ---- Polling files, one per language -----------------------------------
  const nums = Object.fromEntries(
    Object.entries(numbers).map(([k, v]) => [k, v.poison ? { ems: v.ems, poison: v.poison } : { ems: v.ems }])
  );
  for (const lang of LANGS) {
    const out = {
      lang,
      ui: ui[lang],
      numbers: nums,
      updated: new Date().toISOString().slice(0, 10),
      img_base: `${BASE}/img/`,
      cards: cards.map((c) => ({
        id: c.id,
        cat: c.cat,
        t: c[lang].t,
        w: c[lang].w,
        s: c[lang].s,
        imgs: (c.imgs || []).filter((n) => manifest[n]).map((n) => ({
          f: manifest[n].file,
          c: shortCredit(manifest[n]),
        })),
      })),
    };
    await fs.writeFile(path.join(DOCS, `cards-${lang}.json`), JSON.stringify(out));
    console.log(`cards-${lang}.json: ${out.cards.length} cards`);
  }

  // ---- Gallery with full attribution -------------------------------------
  const blocks = cards.map((c) => {
    const imgs = (c.imgs || []).filter((n) => manifest[n]).map((n) => {
      const m = manifest[n];
      return `<figure><img loading="lazy" src="img/${m.file}" alt="${escapeHtml(c.en.t)}"><figcaption><a href="${m.page}">${escapeHtml(n.replace(/^local:/, ""))}</a><br>${escapeHtml(m.artist)} · ${escapeHtml(m.license)}</figcaption></figure>`;
    }).join("");
    const langs = LANGS.map((l) => `<details${l === "en" ? " open" : ""}><summary>${l.toUpperCase()} · ${escapeHtml(c[l].t.replace("{EMS}", "911"))}</summary><p class="w">${escapeHtml(c[l].w)}</p><ol>${c[l].s.map((s) => `<li>${escapeHtml(s.replace(/\{EMS\}/g, "911").replace(/\{POISON\}/g, "1-800-222-1222"))}</li>`).join("")}</ol></details>`).join("");
    return `<article id="${c.id}"><header><span class="cat">${c.cat}</span><code>${c.id}</code></header>${langs}<div class="imgs">${imgs || '<p class="none">Text-only card</p>'}</div></article>`;
  }).join("\n");

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>First Aid Cards for TRMNL — catalog and credits</title>
<style>
:root{--fg:#111;--bg:#fafaf7;--mute:#666;--line:#ddd}
@media(prefers-color-scheme:dark){:root{--fg:#eee;--bg:#161616;--mute:#999;--line:#333}}
body{margin:0;font:16px/1.5 system-ui,sans-serif;color:var(--fg);background:var(--bg)}
main{max-width:1100px;margin:auto;padding:24px}
h1{font-size:28px;margin:0 0 4px}.lead{color:var(--mute);margin:0 0 24px}
article{border-top:1px solid var(--line);padding:20px 0}
header{display:flex;gap:12px;align-items:center;margin-bottom:8px}
.cat{font-size:12px;text-transform:uppercase;letter-spacing:.08em;border:1px solid var(--line);padding:2px 8px;border-radius:99px}
code{color:var(--mute)}summary{cursor:pointer;font-weight:600}.w{color:var(--mute);margin:4px 0}
.imgs{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-top:12px}
figure{margin:0}figure img{width:100%;height:160px;object-fit:contain;background:#fff;border:1px solid var(--line)}
figcaption{font-size:12px;color:var(--mute);word-break:break-word}a{color:inherit}.none{color:var(--mute);font-style:italic}
</style></head><body><main>
<h1>First Aid Cards for TRMNL</h1>
<p class="lead">${cards.length} cards in English, German, French and Spanish, based on the 2025 American Heart Association guidelines and American Red Cross guidance. Not a substitute for first aid training. Illustrations from U.S. Army and FEMA training manuals (public domain) and from Wikimedia Commons, credited below with their licenses.</p>
${blocks}
</main></body></html>`;
  await fs.writeFile(path.join(DOCS, "index.html"), html);
  await fs.writeFile(path.join(DOCS, ".nojekyll"), "");
  console.log("Gallery written.");
}

main().catch((e) => { console.error(e); process.exit(1); });
