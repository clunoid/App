import type { Metadata } from "next";
import { VlabConsole } from "@/components/vlab/VlabConsole";

/**
 * /vlab — the prompt→3D-animated-short QUALITY PILOT (admin-only). Built after
 * the research verdict that exact Zack-D-Films quality (human Blender artists)
 * cannot be guaranteed by any 2026 AI pipeline; this exists so the owner can
 * judge the closest honest approximation on a few dollars of API spend before
 * deciding whether to build the full feature. Access is enforced in every
 * /api/vlab/* route (session + admin allow-list); absent from nav and sitemap.
 */
export const metadata: Metadata = {
  title: "VLAB Pilot · Clunoid",
  robots: { index: false, follow: false },
};

export default function VlabPage() {
  return (
    <main>
      <VlabConsole />
    </main>
  );
}
