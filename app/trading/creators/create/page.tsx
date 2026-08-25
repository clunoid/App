import type { Metadata } from "next";
import { CreatePost } from "@/components/creators/CreatePost";

export const metadata: Metadata = {
  title: "Create a post — record, talk over it, edit",
  description:
    "Everything a Clunoid creator needs to make one video: run the Smart Recovery Differ bot on simulated money, record the screen, add a voice over, and edit it.",
  robots: { index: false, follow: false },
};

export default function CreatePostPage() {
  return <CreatePost />;
}
