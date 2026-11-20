// Monatlich: Websites der Kitas und Horte nach pädagogischen Ansätzen durchsuchen (Montessori, Reggio, ...).
// Liest site/familie.js, schreibt site/paedagogik.js: { "code|Name": ["montessori", ...] }
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync("site/familie.js", "utf8").replace(/^[^=]*=\s*/, "").replace(/;\s*$/, "");
const F = JSON.parse(src);
const UA = { "User-Agent": "Mozilla/5.0 (compatible; FamilienZuerichBot/1.0; +https://epperttobias-sys.github.io/fuer-familien-in-zuerich/)", "Accept-Language": "de-CH,de;q=0.9,en;q=0.5" };

// Ansatz: [Schlüssel, Muster für Text, Muster für Namen]
const AP = [
  ["montessori", /montessori/g],
  ["reggio", /reggio/g],
  ["pikler", /pikler/g],
  ["waldorf", /waldorf|rudolf steiner|steinerp[aä]dagog/g],
  ["natur", /waldkita|wald-kita|waldkinder|naturkita|natur-kita|waldtag|waldkrippe|waldspielgruppe|naturp[aä]dagog|waldp[aä]dagog|wald- und naturp/g],
  ["bilingual", /bilingu|zweisprachig|english[- ]speaking|englischsprachig|deutsch[- ](und[- ])?englisch|german[- ]english|english[- ]german|deutsch\/englisch|englisch\/deutsch/g],
];
const SUB = /p[aä]dagog|paedagog|konzept|philosoph|leitbild|ueber-uns|uber-uns|über-uns|about|unser-angebot|angebot|werte|haltung/i;

const strip = h => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").toLowerCase();
async function get(u) {
  const r = await fetch(u, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const ct = r.headers.get("content-type") || "";
  if (!/html/i.test(ct)) throw new Error("kein HTML");
  return { html: (await r.text()).slice(0, 800000), url: r.url };
}
const robotsCache = new Map();
async function allowed(u) {
  const o = new URL(u).origin;
  if (!robotsCache.has(o)) {
    let dis = [];
    try {
      const r = await fetch(o + "/robots.txt", { headers: UA, signal: AbortSignal.timeout(10000) });
      if (r.ok) { let on = false;
        for (const l of (await r.text()).split(/\r?\n/)) { const m = l.match(/^\s*(user-agent|disallow)\s*:\s*(.*)$/i); if (!m) continue;
          if (m[1].toLowerCase() === "user-agent") on = m[2].trim() === "*"; else if (on && m[2].trim()) dis.push(m[2].trim()); } }
    } catch {}
    robotsCache.set(o, dis);
  }
  const p = new URL(u).pathname;
  return !robotsCache.get(o).some(d => d === "/" ? true : p.startsWith(d));
}
function count(t) { const r = {}; for (const [k, re] of AP) { const n = (t.match(re) || []).length; if (n) r[k] = n; } return r; }

async function one(it) {
  const res = { key: it.key, n: it.n, w: it.w, hits: {}, pages: 0 };
  const add = c => { for (const k in c) res.hits[k] = (res.hits[k] || 0) + c[k]; };
  add(count(it.n.toLowerCase()));
  if (!it.w) return res;
  try {
    if (!(await allowed(it.w))) { res.err = "robots"; return res; }
    const { html, url } = await get(it.w); res.pages++;
    add(count(strip(html)));
    const base = new URL(url), seen = new Set([base.href]), subs = [];
    for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      let h; try { h = new URL(m[1], base); } catch { continue; }
      if (h.hostname !== base.hostname || seen.has(h.href) || /\.(pdf|jpe?g|png|docx?)$/i.test(h.pathname)) continue;
      if (SUB.test(h.pathname) || SUB.test(strip(m[2]))) { seen.add(h.href); subs.push(h.href); }
    }
    for (const s of subs.slice(0, 4)) {
      try { if (!(await allowed(s))) continue; const { html: h2 } = await get(s); res.pages++; add(count(strip(h2))); } catch {}
    }
  } catch (e) { res.err = String(e.message || e).slice(0, 60); }
  return res;
}

const items = [];
for (const [code, list] of Object.entries(F.gemeinden)) for (const x of list) if (x.k === "kita") items.push({ key: code + "|" + x.n, n: x.n, w: x.w || "" });
// gleiche Website nur einmal holen
const byW = new Map();
for (const it of items) if (it.w) { if (!byW.has(it.w)) byW.set(it.w, []); byW.get(it.w).push(it); }
const uniq = [...byW.values()].map(a => a[0]);
console.log(items.length, "Kitas,", uniq.length, "Websites");
const done = new Map(); let i = 0;
await Promise.all(Array.from({ length: 6 }, async () => { while (i < uniq.length) { const it = uniq[i++]; done.set(it.w, await one(it)); } }));

const out = {}, raw = [];
for (const it of items) {
  const r = it.w ? done.get(it.w) : await one(it);
  const own = count(it.n.toLowerCase());
  const hits = { ...(r ? r.hits : {}) };
  for (const k in own) hits[k] = Math.max(hits[k] || 0, 3);
  // Eine Erwähnung kann ein Nebensatz sein ("im Gegensatz zu Montessori"); verlangt werden 2 Treffer oder der Name
  const tags = Object.keys(hits).filter(k => own[k] || hits[k] >= 2);
  raw.push({ key: it.key, w: it.w, hits, pages: r ? r.pages : 0, err: r && r.err });
  if (tags.length) out[it.key] = tags;
}
writeFileSync("data/paedagogik-raw.json", JSON.stringify(raw, null, 1));
writeFileSync("site/paedagogik.js", "// Pädagogische Ansätze laut Websites der Kitas, monatlich automatisch erkannt\nwindow.PAEDAGOGIK=" + JSON.stringify({ stand: new Date().toISOString().slice(0, 10), k: out }) + ";\n");
const cnt = {}; Object.values(out).flat().forEach(t => cnt[t] = (cnt[t] || 0) + 1);
console.log("Erkannt:", cnt, "Fehler:", raw.filter(r => r.err).length);
