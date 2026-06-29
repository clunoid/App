import { FeaturePage } from "@/components/marketing/FeaturePage";
import { buildMeta, PAGES } from "@/lib/marketing/content";

const page = PAGES["bar-chart-race-examples"];
export const metadata = buildMeta(page);

export default function Page() {
  return <FeaturePage page={page} />;
}
