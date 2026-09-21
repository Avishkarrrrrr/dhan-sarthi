import type { Config } from "tailwindcss";

/**
 * Design tokens.
 *
 * The palette stays inside IDBI's green, but with enough range to build depth
 * with — a single brand green flattens every surface into the same plane. The
 * added steps are for layering (deeper for grounds, lighter for glass), not
 * for decoration.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          green: "#0B7A4B",
          deep: "#064E36",
          // Darkest ground, for immersive surfaces like the committee room.
          abyss: "#032A1E",
          accent: "#12B886",
          glow: "#3DE0A8",
          light: "#E6F4EE",
        },
        surface: "#F5F7F6",
        ink: "#0E1B14",
        // Signal colours for agent tilts and verdicts.
        signal: {
          up: "#12B886",
          down: "#E5484D",
          flat: "#8A9A92",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        phone: "0 30px 60px -20px rgba(6,78,54,0.45)",
        soft: "0 6px 20px -8px rgba(14,27,20,0.18)",
        lift: "0 18px 40px -16px rgba(6,78,54,0.35)",
        glow: "0 0 24px -4px rgba(18,184,134,0.45)",
        "inner-top": "inset 0 1px 0 0 rgba(255,255,255,0.08)",
      },
      backgroundImage: {
        "brand-sheen": "linear-gradient(135deg,#0B7A4B 0%,#12B886 50%,#064E36 100%)",
        "glass-edge": "linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.02))",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "rise-in": {
          "0%": { opacity: "0", transform: "translateY(14px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        // Sweeps a highlight across a surface while it is working.
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        // Expanding ring, for an agent that is still deliberating.
        "pulse-ring": {
          "0%": { transform: "scale(0.85)", opacity: "0.7" },
          "70%": { transform: "scale(1.5)", opacity: "0" },
          "100%": { transform: "scale(1.5)", opacity: "0" },
        },
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-5px)" },
        },
        "gradient-drift": {
          "0%,100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.3s ease-out",
        "rise-in": "rise-in 0.45s cubic-bezier(0.22,1,0.36,1) both",
        shimmer: "shimmer 2.2s linear infinite",
        "pulse-ring": "pulse-ring 1.8s cubic-bezier(0.4,0,0.6,1) infinite",
        float: "float 4s ease-in-out infinite",
        "gradient-drift": "gradient-drift 12s ease infinite",
      },
    },
  },
  plugins: [],
};

export default config;
