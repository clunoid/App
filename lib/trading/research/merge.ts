/**
 * Merge chunked research outputs into the canonical files:
 *   RESEARCH_PAIRS="XAUUSD,USOIL" RESEARCH_OUT=part1 npx tsx lib/trading/research/run.ts
 *   RESEARCH_PAIRS="SPX500,NAS100" RESEARCH_OUT=part2 npx tsx lib/trading/research/run.ts
 *   npx tsx lib/trading/research/merge.ts part1 part2
 * Reports/playbooks are reassembled in PAIRS (watchlist) order and the part
 * files are deleted — the canonical reports.json/playbooks.json remain the only
 * artifacts. Refuses to write unless every PAIRS market is present exactly once
 * across the parts (a partial desk must never ship silently).
 */
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PAIRS, type PairPlaybook, type ValidationReport } from "../types";
import { DEFAULT_GATES } from "../validate";

const HERE = dirname(fileURLToPath(import.meta.url));

const parts = process.argv.slice(2);
if (!parts.length) {
  console.error("usage: npx tsx lib/trading/research/merge.ts <part> [<part>…]");
  process.exit(1);
}

const reports: ValidationReport[] = [];
const playbooks: PairPlaybook[] = [];
for (const part of parts) {
  const r = JSON.parse(readFileSync(join(HERE, `reports.${part}.json`), "utf8")) as { reports: ValidationReport[] };
  const p = JSON.parse(readFileSync(join(HERE, `playbooks.${part}.json`), "utf8")) as { playbooks: PairPlaybook[] };
  reports.push(...r.reports);
  playbooks.push(...p.playbooks);
}

const seen = playbooks.map((p) => p.pair);
const missing = PAIRS.filter((p) => !seen.includes(p));
const dupes = seen.filter((p, i) => seen.indexOf(p) !== i);
if (missing.length || dupes.length) {
  console.error(`refusing to merge: missing=[${missing.join(",")}] duplicated=[${dupes.join(",")}]`);
  process.exit(1);
}

const order = new Map(PAIRS.map((p, i) => [p, i]));
reports.sort((a, b) => order.get(a.pair)! - order.get(b.pair)!);
playbooks.sort((a, b) => order.get(a.pair)! - order.get(b.pair)!);

writeFileSync(join(HERE, "reports.json"), JSON.stringify({ generatedAt: new Date().toISOString(), gates: DEFAULT_GATES, reports }, null, 1));
writeFileSync(join(HERE, "playbooks.json"), JSON.stringify({ generatedAt: new Date().toISOString(), playbooks }, null, 1));
for (const part of parts) {
  unlinkSync(join(HERE, `reports.${part}.json`));
  unlinkSync(join(HERE, `playbooks.${part}.json`));
}
console.log(`merged ${parts.length} parts → ${reports.length} reports, ${playbooks.filter((p) => p.champions.length).length}/${PAIRS.length} markets tradeable.`);
