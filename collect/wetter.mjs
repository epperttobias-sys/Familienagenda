// Holt die Wettervorhersage (Open-Meteo, ohne Schlüssel) für alle Gemeinden
import { readFileSync, writeFileSync } from "node:fs";
const G = JSON.parse(readFileSync(new URL("./gemeinden.json", import.meta.url)));
const codes = Object.keys(G).filter(c => G[c].lat);
const url = "https://api.open-meteo.com/v1/forecast?latitude=" + codes.map(c => G[c].lat).join(",") +
  "&longitude=" + codes.map(c => G[c].lon).join(",") +
  "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Europe%2FZurich&forecast_days=16";
try {
  const r = await fetch(url); if (!r.ok) throw new Error(r.status);
  let j = await r.json(); if (!Array.isArray(j)) j = [j];
  const g = {};
  codes.forEach((c, i) => { const d = j[i].daily; g[c] = { lat: G[c].lat, lon: G[c].lon, d: d.time, c: d.weather_code, tx: d.temperature_2m_max.map(Math.round), tn: d.temperature_2m_min.map(Math.round), p: d.precipitation_probability_max }; });
  writeFileSync("site/wetter.js", "window.WETTER=" + JSON.stringify({ stand: new Date().toISOString(), g }) + ";\n");
  console.log("Wetter für", codes.length, "Gemeinden");
} catch (e) { console.log("Wetter nicht erreichbar:", e.message); }
