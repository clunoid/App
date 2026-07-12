import type { ApplicationDocs, ApplicationStatus, CareerApplication, JobRequirements, MatchReport } from "./types";

/** Map a career_applications row (session-scoped query, RLS enforced) to the API shape. */
export function rowToApplication(r: Record<string, unknown>): CareerApplication {
  return {
    id: String(r.id),
    company: (r.company as string) || "",
    role: (r.role as string) || "",
    jdText: (r.jd_text as string) || "",
    status: ((r.status as string) || "saved") as ApplicationStatus,
    requirements: (r.requirements as JobRequirements | null) ?? null,
    match: (r.match as MatchReport | null) ?? null,
    docs: ((r.docs as ApplicationDocs) || {}) as ApplicationDocs,
    notes: (r.notes as string) || "",
    createdAt: String(r.created_at || ""),
    updatedAt: String(r.updated_at || ""),
  };
}
