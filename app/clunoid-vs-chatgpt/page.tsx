import { FeaturePage } from "@/components/marketing/FeaturePage";
import { buildMeta, PAGES } from "@/lib/marketing/content";

const page = PAGES["clunoid-vs-chatgpt"];
export const metadata = buildMeta(page);

export default function Page() {
  return <FeaturePage page={page} />;
}
