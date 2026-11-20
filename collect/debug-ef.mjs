const r = await fetch("https://www.wildnispark.ch?id=49&mod_action=rss", { headers: { "User-Agent": "Familienagenda/1.0" } });
const t = await r.text(); const i = t.indexOf("<item"); console.log("RSS", r.status, (t.match(/<item/g) || []).length); console.log(t.slice(i, i + 2500).replace(/\s+/g, " "));
