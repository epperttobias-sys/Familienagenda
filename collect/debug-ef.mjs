const r = await fetch("https://www.wildnispark.ch?id=49&mod_action=rss", { headers: { "User-Agent": "Familienagenda/1.0" } });
const t = await r.text(); console.log("RSS", r.status, t.length); console.log(t.slice(0, 3000));
