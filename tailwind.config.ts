import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Claude-inspired warm dark palette
        base: "#1F1E1C",      // app background
        surface: "#262624",   // raised panels
        "surface-2": "#30302C",
        border: "#3A3A35",
        ink: "#F4F2EC",       // primary warm off-white text
        "ink-muted": "#A6A199",
        "ink-faint": "#736F68",
        clay: "#D97757",      // Isaac / brand accent (Claude "book cloth")
        "clay-soft": "#E0937A",
        spark: "#7FB5FF",     // Isaac speaking (light blue)
        "spark-soft": "#B3D4FF",
        ok: "#7FB069",
        bad: "#D86B6B",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
      },
      boxShadow: {
        glow: "0 0 60px -10px rgba(217, 119, 87, 0.45)",
        "glow-blue": "0 0 90px -6px rgba(127, 181, 255, 0.6)",
        soft: "0 8px 40px -12px rgba(0,0,0,0.5)",
      },
      keyframes: {
        breathe: {
          "0%, 100%": { transform: "scale(1)", opacity: "0.9" },
          "50%": { transform: "scale(1.06)", opacity: "1" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
      },
      animation: {
        breathe: "breathe 4s ease-in-out infinite",
        "fade-up": "fade-up 0.5s ease-out both",
        float: "float 5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
