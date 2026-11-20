const UA = { "User-Agent": "Familienagenda/1.0 (privates Familienprojekt, Test)" };
const get = async u => { const r = await fetch(u, { headers: UA }); console.log("GET", r.status, u); return r.text(); };
const main = await get("https://www.forum-magazin.ch/agenda/");
const f = main.indexOf("<form"); const fe = main.indexOf("</form>", f);
const form = main.slice(f, fe);
console.log("FORM", form.slice(0, 300));
for (const m of form.matchAll(/<(select|input)[^>]*name="([^"]*)"[^>]*>/g)) console.log("FELD", m[0].slice(0, 200));
const cat = form.indexOf('name="category'); console.log(form.slice(cat, cat + 1500).replace(/\s+/g, " "));
for (const u of ["https://www.forum-magazin.ch/agenda/?parish=embrach", "https://www.forum-magazin.ch/embrach/agenda/"]) {
  const h = await get(u); const a = h.split(/<article/).length - 1; console.log("articles", a, "teaser--agenda", h.split("teaser--agenda").length - 1);
  const i = h.indexOf("/embrach/agenda/2026"); console.log(h.slice(i - 800, i + 900).replace(/\s+/g, " "));
}
