/**
 * CAREER DESK — shared types. The product in one sentence: paste your resume once,
 * then for every job posting get an HONEST deterministic ATS match score with
 * visible keyword gaps, a tailored (never-fabricated) resume, a cover letter,
 * recruiter outreach and an interview prep pack — plus an application tracker.
 *
 * Design rules (learned from what paying users of Jobscan/Teal/Rezi complain about):
 *  - The SCORE is deterministic — computed in code from extracted requirements,
 *    never vibes from a model. Same inputs → same score, with per-term evidence.
 *  - Generation NEVER invents employers, titles, dates, degrees, numbers or
 *    certifications. Rephrase/reorder/emphasize only. Ungroundable claims are
 *    surfaced as warnings, not silently shipped.
 */

/** Structured master resume — parsed once from the user's pasted text/PDF. */
export type ResumeExperience = {
  company: string;
  title: string;
  start: string; // freeform ("Mar 2021")
  end: string; // freeform ("Present")
  location: string; // "" when absent
  bullets: string[];
};

export type ResumeEducation = {
  school: string;
  degree: string; // full line ("BSc Computer Science")
  year: string; // "" when absent
};

export type ResumeDoc = {
  name: string;
  headline: string; // professional title line under the name
  email: string;
  phone: string;
  location: string;
  links: string[]; // linkedin / portfolio / github URLs
  summary: string;
  skills: string[];
  experience: ResumeExperience[];
  education: ResumeEducation[];
  certifications: string[];
  extras: string[]; // awards, languages, volunteering — one line each
};

/** What the job posting actually asks for — extracted by Claude, then matched in code. */
export type JobRequirements = {
  title: string;
  company: string;
  location: string;
  seniority: string; // "junior" | "mid" | "senior" | "lead" | "" when unclear
  required: string[]; // hard requirements (skills, tools, qualifications)
  preferred: string[]; // nice-to-haves
  responsibilities: string[]; // the core duties (used for tailoring)
  keywords: string[]; // extra exact ATS words/phrases worth mirroring
  yearsRequired: number; // 0 when not stated
  education: string; // "" when not stated
  salaryText: string; // exactly as written in the posting, "" when absent
};

/** One scored term with evidence — the visible hit/miss table. */
export type MatchItem = {
  term: string;
  kind: "required" | "preferred" | "keyword";
  hit: boolean;
  evidence: string; // short snippet from the resume that matched ("" when miss)
};

export type MatchReport = {
  score: number; // 0–100, deterministic
  items: MatchItem[];
  requiredHit: number;
  requiredTotal: number;
  preferredHit: number;
  preferredTotal: number;
  keywordHit: number;
  keywordTotal: number;
  titleAligned: boolean;
  gaps: string[]; // missing REQUIRED terms — the punch list
  verdict: string; // one honest sentence, computed from the numbers
};

/** Generated documents, stored per application in `docs` jsonb. */
export type TailoredResume = {
  resume: ResumeDoc;
  changes: string[]; // what was changed and why (transparency)
  warnings: string[]; // anything that couldn't be fully grounded — shown to the user
};

export type OutreachPack = {
  linkedin: string; // short connection/DM message
  emailSubject: string;
  email: string;
};

export type InterviewQuestion = {
  q: string;
  why: string; // why they'll ask it (ties to the JD)
  answerOutline: string; // STAR outline grounded in the user's real experience
};

export type InterviewPack = {
  questions: InterviewQuestion[];
  questionsToAsk: string[]; // smart questions for the interviewer
  salaryNotes: string; // negotiation guidance grounded in the posting (no invented numbers)
};

export type ApplicationDocs = {
  resume?: TailoredResume;
  cover?: string;
  outreach?: OutreachPack;
  interview?: InterviewPack;
};

export type ApplicationStatus = "saved" | "applied" | "interviewing" | "offer" | "rejected";

export const APPLICATION_STATUSES: ApplicationStatus[] = ["saved", "applied", "interviewing", "offer", "rejected"];

/** A tracked application row as the API returns it. */
export type CareerApplication = {
  id: string;
  company: string;
  role: string;
  jdText: string;
  status: ApplicationStatus;
  requirements: JobRequirements | null;
  match: MatchReport | null;
  docs: ApplicationDocs;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type CareerProfile = {
  resume: ResumeDoc;
  resumeText: string;
  updatedAt: string;
};

export type DocKind = "resume" | "cover" | "outreach" | "interview";
export const DOC_KINDS: DocKind[] = ["resume", "cover", "outreach", "interview"];
