import type { JobRequirements, MatchItem, MatchReport, ResumeDoc } from "./types";

/**
 * The DETERMINISTIC matcher. Claude extracts what the job asks for (analyze.ts);
 * THIS code decides what matched and computes the score — so the number is
 * reproducible, explainable and honest (the same resume + posting always score
 * identically, and every point lost has a visible reason). No model output is
 * ever trusted as a score.
 *
 * Matching is word-boundary based on a normalized haystack, with a curated
 * equivalence table for the most common tech/business aliases (js↔javascript,
 * k8s↔kubernetes…). Weights: required 62%, preferred 18%, keywords 14%,
 * title alignment 6% — required gaps are what actually reject candidates.
 */

/* ── normalization ────────────────────────────────────────────────────────── */

const norm = (s: string) =>
  (s || "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9+#./ -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Common alias groups — matching ANY member counts as matching the term. */
const ALIAS_GROUPS: string[][] = [
  ["javascript", "js", "ecmascript"],
  ["typescript", "ts"],
  ["node.js", "nodejs", "node"],
  ["react", "react.js", "reactjs"],
  ["next.js", "nextjs", "next"],
  ["vue", "vue.js", "vuejs"],
  ["angular", "angularjs"],
  ["postgresql", "postgres", "psql"],
  ["mysql", "sql"],
  ["mongodb", "mongo"],
  ["kubernetes", "k8s"],
  ["docker", "containers", "containerization"],
  ["amazon web services", "aws"],
  ["google cloud", "gcp", "google cloud platform"],
  ["microsoft azure", "azure"],
  ["ci/cd", "cicd", "continuous integration", "continuous delivery", "continuous deployment"],
  ["machine learning", "ml"],
  ["artificial intelligence", "ai"],
  ["large language models", "llm", "llms"],
  ["natural language processing", "nlp"],
  ["user experience", "ux"],
  ["user interface", "ui"],
  ["search engine optimization", "seo"],
  ["search engine marketing", "sem"],
  ["customer relationship management", "crm"],
  ["enterprise resource planning", "erp"],
  ["profit and loss", "p&l", "pnl"],
  ["key performance indicators", "kpi", "kpis"],
  ["objectives and key results", "okr", "okrs"],
  ["business to business", "b2b"],
  ["business to consumer", "b2c"],
  ["software as a service", "saas"],
  ["quality assurance", "qa"],
  ["test driven development", "tdd"],
  ["object oriented programming", "oop", "object-oriented"],
  ["representational state transfer", "rest", "restful", "rest api", "rest apis"],
  ["graphql", "graph ql"],
  ["c#", "csharp", "c sharp"],
  ["c++", "cpp", "c plus plus"],
  ["golang", "go"],
  ["ruby on rails", "rails"],
  ["scikit-learn", "sklearn"],
  ["pytorch", "torch"],
  ["microsoft excel", "excel", "spreadsheets"],
  ["microsoft office", "ms office"],
  ["power bi", "powerbi"],
  ["google analytics", "ga4"],
  ["project management", "program management"],
  ["agile", "scrum", "kanban"],
  ["stakeholder management", "stakeholder engagement", "stakeholders"],
  ["communication", "communication skills", "communicator"],
  ["leadership", "leading teams", "team leadership", "led teams"],
  ["problem solving", "problem-solving", "analytical skills", "analytical"],
  ["collaboration", "cross-functional", "cross functional", "teamwork"],
  ["bachelor's degree", "bachelors degree", "bachelor degree", "bsc", "ba", "bs", "undergraduate degree"],
  ["master's degree", "masters degree", "master degree", "msc", "ma", "ms", "mba"],
];

const ALIASES = new Map<string, string[]>();
for (const group of ALIAS_GROUPS) for (const term of group) ALIASES.set(term, group);

/** All spellings that should count as a hit for `term`. */
function variants(term: string): string[] {
  const t = norm(term);
  const out = new Set<string>([t]);
  for (const v of ALIASES.get(t) ?? []) out.add(norm(v));
  // singular/plural tolerance for simple nouns
  if (t.endsWith("s") && t.length > 3) out.add(t.slice(0, -1));
  else if (t.length > 2) out.add(t + "s");
  return [...out];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Word-boundary test that tolerates the +,#,.,/ characters real skills contain. */
function contains(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const re = new RegExp(`(^|[^a-z0-9+#])${escapeRe(needle)}($|[^a-z0-9+#])`, "i");
  return re.test(haystack);
}

/** Single token with light stemming: 'mentoring engineers' should hit a resume
 *  that says 'Mentored 3 junior engineers' — same lexical family, so an ATS
 *  keyword scan (and an honest score) counts it. */
function tokenHit(hay: string, token: string): boolean {
  if (contains(hay, token)) return true;
  // short technical tokens (api, kpi, okr, sql) — plural tolerance only
  if (token.length <= 4) return contains(hay, token + "s") || contains(hay, token + "es");
  if (token.length >= 5) {
    const stem = token.replace(/(ing|ed|es|s)$/, "");
    if (stem.length >= 4) {
      const re = new RegExp(`(^|[^a-z0-9+#])${escapeRe(stem)}[a-z]{0,3}($|[^a-z0-9+#])`, "i");
      if (re.test(hay)) return true;
    }
  }
  return false;
}

/** Filler words that carry no matching signal inside multi-word terms. */
const STOP = new Set(["with", "and", "or", "of", "in", "on", "for", "to", "the", "a", "an", "using", "skills", "skill", "experience", "knowledge", "strong", "excellent", "solid", "expert", "level", "professional", "proficiency", "ability", "working"]);

const contentTokens = (term: string): string[] => norm(term).split(" ").filter((w) => w.length > 1 && !STOP.has(w));

/** Full matching rule for one term against one normalized string: exact phrase or
 *  alias first; otherwise EVERY content token must appear (with stemming) — so
 *  'AWS certification' hits a resume holding 'AWS Certified Solutions Architect'
 *  under a 'CERTIFICATIONS' section, while 'customer-facing features' does NOT
 *  hit on 'features' alone. Deterministic, purely lexical (like a real ATS). */
function termHits(hay: string, term: string): boolean {
  if (variants(term).some((v) => contains(hay, v))) return true;
  const tokens = contentTokens(term);
  if (tokens.length < 2) return tokens.length === 1 ? tokenHit(hay, tokens[0]) : false;
  return tokens.every((t) => tokenHit(hay, t));
}

/* ── evidence ─────────────────────────────────────────────────────────────── */

/** Short human-readable snippet for the hit table: the line where the term (or
 *  most of its tokens) actually lives. */
function snippet(rawLines: string[], term: string): string {
  let best = "";
  let bestScore = 0;
  const vs = variants(term);
  const tokens = contentTokens(term);
  for (const line of rawLines) {
    const n = norm(line);
    if (vs.some((v) => contains(n, v))) return clipLine(line); // exact phrase — perfect evidence
    const hits = tokens.filter((t) => tokenHit(n, t)).length;
    if (hits > bestScore) {
      bestScore = hits;
      best = clipLine(line);
    }
  }
  return best;
}

function clipLine(line: string): string {
  const trimmed = line.trim().replace(/\s+/g, " ");
  return trimmed.length > 110 ? trimmed.slice(0, 107) + "…" : trimmed;
}

/* ── the matcher ──────────────────────────────────────────────────────────── */

/** Flatten the resume into searchable text + its raw lines (for evidence). */
function resumeCorpus(doc: ResumeDoc, rawText: string): { hay: string; lines: string[] } {
  const lines: string[] = [];
  lines.push(doc.headline, doc.summary, ...doc.skills, ...doc.certifications, ...doc.extras);
  for (const e of doc.experience) lines.push(`${e.title} — ${e.company}`, ...e.bullets);
  for (const e of doc.education) lines.push(`${e.degree} — ${e.school} ${e.year}`);
  for (const raw of (rawText || "").split(/\n+/)) if (raw.trim()) lines.push(raw);
  const clean = lines.filter(Boolean);
  return { hay: norm(clean.join(" \n ")), lines: clean };
}

const dedupeNorm = (terms: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of terms) {
    const key = norm(t);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(t.trim());
  }
  return out;
};

export function matchResume(doc: ResumeDoc, rawText: string, req: JobRequirements): MatchReport {
  const { hay, lines } = resumeCorpus(doc, rawText);

  const scoreSet = (terms: string[], kind: MatchItem["kind"]): MatchItem[] =>
    dedupeNorm(terms).map((term) => {
      const hit = termHits(hay, term);
      return { term, kind, hit, evidence: hit ? snippet(lines, term) : "" };
    });

  // keywords that duplicate required/preferred terms are dropped (no double counting)
  const rp = new Set([...req.required, ...req.preferred].map(norm));
  const extraKeywords = req.keywords.filter((k) => !rp.has(norm(k)));

  const items = [
    ...scoreSet(req.required, "required"),
    ...scoreSet(req.preferred, "preferred"),
    ...scoreSet(extraKeywords, "keyword"),
  ];

  const count = (kind: MatchItem["kind"]) => {
    const of = items.filter((i) => i.kind === kind);
    return { hit: of.filter((i) => i.hit).length, total: of.length };
  };
  const r = count("required");
  const p = count("preferred");
  const k = count("keyword");

  // title alignment: significant words of the JD title found in headline/titles
  const titleWords = norm(req.title)
    .split(" ")
    .filter((w) => w.length > 3 && !["with", "and", "for", "the", "senior", "junior", "lead", "staff", "principal"].includes(w));
  const titleHay = norm([doc.headline, ...doc.experience.map((e) => e.title)].join(" \n "));
  const titleAligned = titleWords.length > 0 && titleWords.filter((w) => contains(titleHay, w)).length >= Math.ceil(titleWords.length / 2);

  // weights; buckets with no terms redistribute to the ones that exist
  const buckets: { frac: number; weight: number }[] = [];
  if (r.total) buckets.push({ frac: r.hit / r.total, weight: 62 });
  if (p.total) buckets.push({ frac: p.hit / p.total, weight: 18 });
  if (k.total) buckets.push({ frac: k.hit / k.total, weight: 14 });
  buckets.push({ frac: titleAligned ? 1 : 0, weight: 6 });
  const weightSum = buckets.reduce((s, b) => s + b.weight, 0);
  const score = Math.round(buckets.reduce((s, b) => s + b.frac * (b.weight / weightSum) * 100, 0));

  const gaps = items.filter((i) => i.kind === "required" && !i.hit).map((i) => i.term);

  const verdict =
    score >= 80
      ? "Strong match — worth applying with the tailored resume."
      : score >= 60
        ? `Decent match — closing ${gaps.length ? `the ${gaps.length} required gap${gaps.length === 1 ? "" : "s"}` : "the keyword gaps"} would make it strong.`
        : score >= 40
          ? "Partial match — apply only if you can honestly evidence the missing requirements."
          : "Weak match — your profile doesn't currently evidence most of what this role requires.";

  return {
    score,
    items,
    requiredHit: r.hit,
    requiredTotal: r.total,
    preferredHit: p.hit,
    preferredTotal: p.total,
    keywordHit: k.hit,
    keywordTotal: k.total,
    titleAligned,
    gaps,
    verdict,
  };
}
