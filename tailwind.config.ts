import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "var(--paper)",
        surface: "var(--surface)",
        raise: "var(--raise)",
        ink: "var(--ink)",
        soft: "var(--soft)",
        faint: "var(--faint)",
        line: "var(--line)",
        "line-strong": "var(--line-strong)",
        hl: "var(--hl)",
        "hl-ink": "var(--hl-ink)",
        "hl-soft": "var(--hl-soft)",
        pen: "var(--pen)",
        "pen-soft": "var(--pen-soft)",
        red: "var(--red)",
        "red-soft": "var(--red-soft)",
        n: {
          50: "var(--n-50)",
          100: "var(--n-100)",
          200: "var(--n-200)",
          300: "var(--n-300)",
          400: "var(--n-400)",
          500: "var(--n-500)",
          600: "var(--n-600)",
          700: "var(--n-700)",
          800: "var(--n-800)",
          900: "var(--n-900)",
          950: "var(--n-950)",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        hand: ["var(--font-hand)", "cursive"],
      },
      fontSize: {
        // modular scale ~1.25, body floor 16px
        "2xs": ["0.694rem", { lineHeight: "1.4" }],
        xs: ["0.8rem", { lineHeight: "1.5" }],
        sm: ["0.875rem", { lineHeight: "1.55" }],
        base: ["1rem", { lineHeight: "1.7" }],
        lg: ["1.25rem", { lineHeight: "1.55" }],
        xl: ["1.563rem", { lineHeight: "1.35" }],
        "2xl": ["1.953rem", { lineHeight: "1.25" }],
        "3xl": ["2.441rem", { lineHeight: "1.15" }],
        "4xl": ["3.052rem", { lineHeight: "1.08" }],
        "5xl": ["3.815rem", { lineHeight: "1.04" }],
      },
      borderRadius: {
        sm: "6px",
        DEFAULT: "10px",
        lg: "14px",
        xl: "20px",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        lift: "var(--shadow-lift)",
        sticky: "var(--shadow-sticky)",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      transitionDuration: {
        fast: "150ms",
        base: "250ms",
        slow: "400ms",
      },
      maxWidth: {
        content: "72rem",
        prose: "42rem",
      },
    },
  },
  plugins: [],
};

export default config;
