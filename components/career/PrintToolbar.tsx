"use client";

/** The print-view toolbar — hidden in the actual print/PDF via @media print. */
export function PrintToolbar({ label }: { label: string }) {
  return (
    <>
      <style>{`@media print { .career-print-toolbar { display: none !important; } @page { margin: 0.55in; } }`}</style>
      <div className="career-print-toolbar" style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: "#0b0e14", color: "#eef2f7", fontSize: 13, fontFamily: "system-ui, sans-serif" }}>
        <span style={{ opacity: 0.75 }}>{label} — use your browser&apos;s dialog to save as PDF (ATS-safe: single column, real text, standard fonts).</span>
        <button
          onClick={() => window.print()}
          style={{ marginLeft: "auto", background: "#7aa5ff", color: "#0b0e14", border: 0, borderRadius: 8, padding: "7px 14px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
        >
          Print / Save as PDF
        </button>
      </div>
    </>
  );
}
