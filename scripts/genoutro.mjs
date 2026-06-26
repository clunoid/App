// One-time: pre-record Isaac's brief stat-battle outro line into public/stat-outro.mp3
// (used for ALL stat outros, so we never call TTS per video). Run again only to re-record.
import { writeFileSync } from "node:fs";
const text = "Made on clunoid dot com. Make your own.";
const res = await fetch("https://www.clunoid.com/api/tts", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ text }),
});
console.log("TTS status", res.status);
if (!res.ok) process.exit(1);
const j = await res.json();
if (!j.audio) { console.error("no audio in response"); process.exit(1); }
const buf = Buffer.from(j.audio, "base64");
writeFileSync(new URL("../public/stat-outro.mp3", import.meta.url), buf);
console.log("wrote public/stat-outro.mp3:", buf.length, "bytes");
