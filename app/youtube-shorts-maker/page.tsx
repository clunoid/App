import { FeaturePage } from "@/components/marketing/FeaturePage";
import { buildMeta, PAGES } from "@/lib/marketing/content";

const page = PAGES["youtube-shorts-maker"];
export const metadata = buildMeta(page);

export default function Page() {
  return <FeaturePage page={page} />;
}
