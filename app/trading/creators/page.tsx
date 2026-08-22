import type { Metadata } from "next";
import { CreatorsHub } from "@/components/creators/CreatorsHub";

export const metadata: Metadata = {
  title: "Creator Program — get paid to clip and post",
  description:
    "Make short videos about Clunoid, post them on your own social accounts, and get paid monthly for the reach you bring.",
  alternates: { canonical: "/trading/creators" },
  openGraph: {
    type: "website",
    url: "/trading/creators",
    title: "Creator Program · Clunoid Trading",
    description: "Clip, post, and get paid monthly for promoting Clunoid.",
  },
};

export default function CreatorsPage() {
  return <CreatorsHub />;
}
