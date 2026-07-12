import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/requireUser";
import { isAdmin } from "@/lib/billing/meter";
import type { ApplicationDocs, ResumeDoc } from "@/lib/career/types";
import { PrintToolbar } from "@/components/career/PrintToolbar";

/**
 * ATS-SAFE print view — the export path. Browsers' "Save as PDF" from this page
 * produces a clean, parseable resume: single column, real selectable text,
 * standard section headings, standard fonts, no tables/columns/graphics/photos
 * (the things that actually break ATS parsers). ?doc=cover prints the cover
 * letter instead. Server-gated exactly like the APIs (session + allow-list),
 * and RLS scopes the row to the owner regardless.
 */

export const metadata = { title: "Print · Career Desk", robots: { index: false, follow: false } };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ doc?: string }> };

export default async function CareerPrintPage({ params, searchParams }: Props) {
  const user = await requireUser();
  if (!user || !isAdmin(user)) notFound();
  const { id } = await params;
  const { doc } = await searchParams;

  const supabase = await getSupabaseServer();
  const { data: app } = await supabase.from("career_applications").select("role, company, docs").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!app) notFound();
  const docs = (app.docs || {}) as ApplicationDocs;

  const wantCover = doc === "cover";
  if (wantCover && !docs.cover) notFound();
  if (!wantCover && !docs.resume) notFound();

  return (
    <main style={{ background: "#fff", minHeight: "100dvh" }}>
      <PrintToolbar label={wantCover ? "Cover letter" : "Tailored resume"} />
      <div style={{ maxWidth: "8.5in", margin: "0 auto", padding: "0.7in 0.8in", fontFamily: "Arial, Helvetica, sans-serif", color: "#111", fontSize: "10.6pt", lineHeight: 1.42 }}>
        {wantCover ? <CoverSheet text={docs.cover!} /> : <ResumeSheet r={docs.resume!.resume} />}
      </div>
    </main>
  );
}

function Rule() {
  return <hr style={{ border: 0, borderTop: "1.2px solid #222", margin: "4px 0 8px" }} />;
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: "10.2pt", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>{children}</div>
      <Rule />
    </div>
  );
}

function ResumeSheet({ r }: { r: ResumeDoc }) {
  const contact = [r.email, r.phone, r.location].filter(Boolean).join("  |  ");
  return (
    <>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "17pt", fontWeight: 700, letterSpacing: "0.02em" }}>{r.name}</div>
        {r.headline && <div style={{ fontSize: "11pt", marginTop: 2 }}>{r.headline}</div>}
        {(contact || r.links.length > 0) && (
          <div style={{ fontSize: "9.4pt", marginTop: 4, color: "#333" }}>{[contact, ...r.links].filter(Boolean).join("  |  ")}</div>
        )}
      </div>

      {r.summary && (
        <>
          <Heading>Summary</Heading>
          <p style={{ margin: 0 }}>{r.summary}</p>
        </>
      )}

      {r.skills.length > 0 && (
        <>
          <Heading>Skills</Heading>
          <p style={{ margin: 0 }}>{r.skills.join("  ·  ")}</p>
        </>
      )}

      {r.experience.length > 0 && (
        <>
          <Heading>Experience</Heading>
          {r.experience.map((e, i) => (
            <div key={i} style={{ marginBottom: 10, breakInside: "avoid" }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700 }}>{e.title}, <span style={{ fontWeight: 400 }}>{e.company}</span></span>
                <span style={{ color: "#333" }}>{[e.start, e.end].filter(Boolean).join(" – ")}{e.location ? ` | ${e.location}` : ""}</span>
              </div>
              <ul style={{ margin: "3px 0 0", paddingLeft: 18 }}>
                {e.bullets.map((b, j) => (
                  <li key={j} style={{ marginBottom: 2 }}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}

      {r.education.length > 0 && (
        <>
          <Heading>Education</Heading>
          {r.education.map((e, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap" }}>
              <span><span style={{ fontWeight: 700 }}>{e.degree}</span>, {e.school}</span>
              <span style={{ color: "#333" }}>{e.year}</span>
            </div>
          ))}
        </>
      )}

      {r.certifications.length > 0 && (
        <>
          <Heading>Certifications</Heading>
          <p style={{ margin: 0 }}>{r.certifications.join("  ·  ")}</p>
        </>
      )}

      {r.extras.length > 0 && (
        <>
          <Heading>Additional</Heading>
          {r.extras.map((x, i) => (
            <div key={i}>{x}</div>
          ))}
        </>
      )}
    </>
  );
}

function CoverSheet({ text }: { text: string }) {
  return <div style={{ whiteSpace: "pre-wrap", fontSize: "11pt", lineHeight: 1.55 }}>{text}</div>;
}
