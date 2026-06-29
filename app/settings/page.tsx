import type { Metadata } from "next";
import { VoiceSettings } from "@/components/settings/VoiceSettings";

export const metadata: Metadata = {
  title: "Settings",
  description: "Choose your Clunoid host voice and preferences.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/settings" },
};

export default function SettingsPage() {
  return (
    <main className="stage-bg min-h-[100dvh]">
      <VoiceSettings />
    </main>
  );
}
