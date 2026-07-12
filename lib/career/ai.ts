/**
 * CAREER DESK — the AI layer. Three jobs, each with a hard honesty contract:
 *
 *  1. parseResume     — raw pasted text / PDF → structured ResumeDoc. Extraction
 *                       only: NOTHING is embellished or invented at parse time.
 *  2. extractRequirements — job posting → what it actually asks for. Extraction
 *                       only; the SCORE is then computed deterministically in
 *                       match.ts, never by the model.
 *  3. generate*       — tailored resume / cover letter / outreach / interview
 *                       pack. The generation contract (enforced in every prompt,
 *                       surfaced as `warnings` in the output): NEVER invent
 *                       employers, job titles, dates, degrees, certifications,
 *                       metrics or tools the candidate didn't claim. Rephrase,
 *                       reorder and emphasize only. This is the differentiator —
 *                       fabricated AI resumes are the #1 complaint about the
 *                       incumbent tools and get candidates auto-rejected.
 *
 * Model tiers (cost discipline, lib/models): parsing/extraction = smart (Haiku),
 * document writing = genius (Sonnet), the money document (tailored resume) = max
 * (Opus). All calls have timeouts and bounded retries; failures throw a plain
 * Error whose message is safe to show the user.
 */
import { generateObject } from "ai";
import { z } from "zod";
import { MODELS, hasAnthropic } from "@/lib/models";
import type { InterviewPack, JobRequirements, MatchReport, OutreachPack, ResumeDoc, TailoredResume } from "./types";

/* ── schemas (flat, structured-output friendly) ───────────────────────────── */

const resumeSchema = z.object({
  name: z.string().describe("The candidate's full name, exactly as written."),
  headline: z.string().describe("Their professional title line (e.g. 'Senior Backend Engineer'). Derive from the most recent role if no explicit headline. Never inflate seniority."),
  email: z.string().describe("Email address, '' if absent."),
  phone: z.string().describe("Phone number, '' if absent."),
  location: z.string().describe("City/country line, '' if absent."),
  links: z.array(z.string()).describe("LinkedIn/portfolio/GitHub URLs found in the resume."),
  summary: z.string().describe("Their professional summary. If the resume has one, keep it near-verbatim; if not, write 2 factual sentences strictly from the content — no praise adjectives."),
  skills: z.array(z.string()).describe("Every skill/tool/technology the resume claims, one term each, deduplicated."),
  experience: z.array(
    z.object({
      company: z.string(),
      title: z.string(),
      start: z.string().describe("As written, e.g. 'Mar 2021'. '' if absent."),
      end: z.string().describe("As written, e.g. 'Present'. '' if absent."),
      location: z.string().describe("'' if absent."),
      bullets: z.array(z.string()).describe("Achievement/duty bullets, preserving all numbers exactly as written."),
    })
  ).describe("All roles, most recent first."),
  education: z.array(z.object({ school: z.string(), degree: z.string(), year: z.string().describe("'' if absent.") })),
  certifications: z.array(z.string()),
  extras: z.array(z.string()).describe("Awards, languages, volunteering, publications — one line each. Empty if none."),
});

const requirementsSchema = z.object({
  title: z.string().describe("The job title as posted."),
  company: z.string().describe("Company name, '' if not identifiable."),
  location: z.string().describe("Location/remote line, '' if absent."),
  seniority: z.string().describe("One of: junior, mid, senior, lead, executive — or '' if unclear."),
  required: z.array(z.string()).describe("HARD requirements only — each a short matchable term (a skill, tool, qualification or capability), not a full sentence. E.g. 'TypeScript', 'stakeholder management', 'CPA license'. 5-15 items."),
  preferred: z.array(z.string()).describe("Nice-to-have terms, same short form. 0-10 items."),
  responsibilities: z.array(z.string()).describe("The 4-8 core duties, short phrases (used to tailor the resume)."),
  keywords: z.array(z.string()).describe("Additional exact words/phrases from the posting an ATS would scan for that are NOT already in required/preferred. 0-10 items."),
  yearsRequired: z.number().describe("Minimum years of experience stated, 0 if not stated."),
  education: z.string().describe("Education requirement as stated, '' if none."),
  salaryText: z.string().describe("The salary/compensation EXACTLY as written in the posting, '' if absent. Never estimate."),
});

const tailoredSchema = z.object({
  resume: resumeSchema,
  changes: z.array(z.string()).describe("Each significant change made and why, one line each (e.g. 'Led bullet 2 with the Kubernetes migration — the JD's top requirement')."),
  warnings: z.array(z.string()).describe("Anything you were tempted to add but could NOT ground in the original resume, phrased as advice (e.g. 'The JD requires Terraform — not in your resume, so it was NOT added; mention it only if you genuinely have it'). Empty if none."),
});

const coverSchema = z.object({
  letter: z.string().describe("The complete cover letter body, 220-320 words, plain text paragraphs separated by blank lines. No date/address header, no placeholder brackets."),
});

const outreachSchema = z.object({
  linkedin: z.string().describe("A LinkedIn connection note/DM to the hiring manager or recruiter, max 280 characters, specific to this role, zero clichés."),
  emailSubject: z.string().describe("A concrete, non-clickbait subject line."),
  email: z.string().describe("A 90-140 word outreach email: who they are, the one most relevant proof point, a low-friction ask."),
});

const interviewSchema = z.object({
  questions: z.array(
    z.object({
      q: z.string().describe("A question this specific interview is likely to include."),
      why: z.string().describe("One sentence: why they'll ask it (tie to the JD)."),
      answerOutline: z.string().describe("A STAR-shaped outline built ONLY from the candidate's real experience — name the actual company/project from their resume. 3-5 sentences."),
    })
  ).describe("8-10 questions: mix of role-specific technical/functional and behavioral."),
  questionsToAsk: z.array(z.string()).describe("4-6 sharp questions the candidate should ask, specific to this company/role."),
  salaryNotes: z.string().describe("3-5 sentences of negotiation guidance. Quote the posting's salary text if present; if absent, advise on process (never invent numbers)."),
});

/* ── shared plumbing ──────────────────────────────────────────────────────── */

const TIMEOUT_MS = 90_000;

function requireAi(): void {
  if (!hasAnthropic()) throw new Error("AI is not configured on this server.");
}

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max) : s);

/* ── 1. resume parsing ────────────────────────────────────────────────────── */

const PARSE_SYSTEM =
  "You are a meticulous resume parser. Extract the resume into the structured shape EXACTLY as written — you are a scanner, not a writer. Preserve every number, date, company and title verbatim. Never add, embellish, infer or upgrade anything. If a field is absent, return an empty string/array rather than guessing.";

export async function parseResume(input: { text?: string; pdfBase64?: string }): Promise<ResumeDoc> {
  requireAi();
  const content: ({ type: "text"; text: string } | { type: "file"; data: string; mimeType: string })[] = [];
  if (input.pdfBase64) content.push({ type: "file", data: input.pdfBase64, mimeType: "application/pdf" });
  if (input.text?.trim()) content.push({ type: "text", text: `RESUME TEXT:\n${clip(input.text, 40_000)}` });
  content.push({ type: "text", text: "Parse this resume into the structured shape." });
  try {
    const { object } = await generateObject({
      model: MODELS.smart(),
      schema: resumeSchema,
      system: PARSE_SYSTEM,
      messages: [{ role: "user", content }],
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!object.name.trim() && object.experience.length === 0 && object.skills.length === 0) {
      throw new Error("That doesn't look like a resume — paste the full text of your resume.");
    }
    return object;
  } catch (e) {
    if (e instanceof Error && e.message.includes("look like a resume")) throw e;
    throw new Error("Couldn't read that resume. If you uploaded a PDF, try pasting the text instead.");
  }
}

/* ── 2. job-posting extraction ────────────────────────────────────────────── */

const EXTRACT_SYSTEM =
  "You are a precise job-posting analyst. Extract what the posting ACTUALLY asks for into short matchable terms. Split compound requirements ('React and TypeScript' → two terms). Keep terms short (1-4 words) — they will be string-matched against a resume. Never add requirements the posting doesn't contain; never estimate salary.";

export async function extractRequirements(jdText: string): Promise<JobRequirements> {
  requireAi();
  try {
    const { object } = await generateObject({
      model: MODELS.smart(),
      schema: requirementsSchema,
      system: EXTRACT_SYSTEM,
      prompt: `JOB POSTING:\n${clip(jdText, 30_000)}\n\nExtract the requirements.`,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (object.required.length === 0 && object.responsibilities.length === 0) {
      throw new Error("That doesn't look like a job posting — paste the full job description.");
    }
    return object;
  } catch (e) {
    if (e instanceof Error && e.message.includes("look like a job posting")) throw e;
    throw new Error("Couldn't analyze that job posting. Try pasting the full description text.");
  }
}

/* ── 3. document generation (the honesty contract) ────────────────────────── */

const GROUNDING_RULES = `NON-NEGOTIABLE GROUNDING RULES:
- The ORIGINAL RESUME below is the only source of truth about the candidate.
- NEVER invent or alter employers, job titles, dates, locations, degrees, certifications, metrics, numbers or tools. If the original bullet has no number, the rewritten bullet has no number.
- You may rephrase, reorder, merge, trim and emphasize. You may mirror the job posting's exact terminology ONLY where the resume genuinely evidences that skill (e.g. resume says 'built REST services in Express' → fine to say 'Node.js REST APIs'; resume never mentions Terraform → Terraform must NOT appear).
- Anything the job requires that you could NOT honestly include goes in `+ "`warnings`" + ` as advice, never into the documents.
- Sober professional tone. No buzzword soup, no 'passionate', no 'results-driven'.`;

function jobBlock(req: JobRequirements, match: MatchReport): string {
  return `TARGET JOB: ${req.title}${req.company ? ` at ${req.company}` : ""}${req.location ? ` (${req.location})` : ""}
Salary as posted: ${req.salaryText || "(not stated in the posting)"}
Required: ${req.required.join("; ")}
Preferred: ${req.preferred.join("; ") || "(none)"}
Core responsibilities: ${req.responsibilities.join("; ")}
ATS keywords: ${req.keywords.join("; ") || "(none)"}
Deterministic match score: ${match.score}/100 — matched ${match.requiredHit}/${match.requiredTotal} required. Missing required terms: ${match.gaps.join("; ") || "(none)"}`;
}

function resumeBlock(doc: ResumeDoc, rawText: string): string {
  return `ORIGINAL RESUME (structured):\n${JSON.stringify(doc)}\n\nORIGINAL RESUME (raw text, ground truth for any ambiguity):\n${clip(rawText, 24_000)}`;
}

export async function generateTailoredResume(doc: ResumeDoc, rawText: string, req: JobRequirements, match: MatchReport): Promise<TailoredResume> {
  requireAi();
  try {
    const { object } = await generateObject({
      model: MODELS.max(),
      schema: tailoredSchema,
      system: `You are an elite resume writer working for the CANDIDATE. Rewrite their resume so it presents their REAL experience in the strongest honest form for one specific job: lead each role with the bullets most relevant to the target, mirror the posting's terminology where genuinely evidenced, tighten every bullet to action verb + what + outcome, and order skills so the job's requirements appear first (only ones they actually have). Keep it to the same overall length or shorter.\n${GROUNDING_RULES}`,
      prompt: `${jobBlock(req, match)}\n\n${resumeBlock(doc, rawText)}\n\nProduce the tailored resume, the change log, and any grounding warnings.`,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return object;
  } catch {
    throw new Error("Resume generation failed — please try again.");
  }
}

export async function generateCoverLetter(doc: ResumeDoc, rawText: string, req: JobRequirements, match: MatchReport): Promise<string> {
  requireAi();
  try {
    const { object } = await generateObject({
      model: MODELS.genius(),
      schema: coverSchema,
      system: `You write cover letters that hiring managers actually finish reading: specific, factual, structured as (1) why this role, (2) the 2-3 proof points from the candidate's REAL experience that map hardest onto the job's requirements, (3) a confident close. No flattery padding, no restating the whole resume, no 'I am writing to express'.\n${GROUNDING_RULES}`,
      prompt: `${jobBlock(req, match)}\n\n${resumeBlock(doc, rawText)}\n\nWrite the cover letter.`,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return object.letter;
  } catch {
    throw new Error("Cover letter generation failed — please try again.");
  }
}

export async function generateOutreach(doc: ResumeDoc, rawText: string, req: JobRequirements, match: MatchReport): Promise<OutreachPack> {
  requireAi();
  try {
    const { object } = await generateObject({
      model: MODELS.genius(),
      schema: outreachSchema,
      system: `You write recruiter outreach that gets replies because it is short, specific and asks for something easy. Reference the actual role. One real proof point maximum.\n${GROUNDING_RULES}`,
      prompt: `${jobBlock(req, match)}\n\n${resumeBlock(doc, rawText)}\n\nWrite the LinkedIn message and outreach email.`,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return object;
  } catch {
    throw new Error("Outreach generation failed — please try again.");
  }
}

export async function generateInterviewPack(doc: ResumeDoc, rawText: string, req: JobRequirements, match: MatchReport): Promise<InterviewPack> {
  requireAi();
  try {
    const { object } = await generateObject({
      model: MODELS.genius(),
      schema: interviewSchema,
      system: `You are an interview coach preparing the candidate for one specific interview. Predict the questions THIS job description implies (its stated requirements, its risks, its seniority), then outline honest STAR answers using only the candidate's real experience — name their actual companies and projects. Where their experience is thin against a requirement, the outline should coach how to address the gap honestly, never how to bluff.\n${GROUNDING_RULES}`,
      prompt: `${jobBlock(req, match)}\n\n${resumeBlock(doc, rawText)}\n\nBuild the interview prep pack.`,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return object;
  } catch {
    throw new Error("Interview pack generation failed — please try again.");
  }
}
