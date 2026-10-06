import type { Config } from "tailwindcss"

const config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
    "*.{js,ts,jsx,tsx,mdx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: "1rem",
        sm: "1.5rem",
        lg: "2rem",
      },
      screens: {
        "2xl": "1280px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-be-vietnam)", "system-ui", "sans-serif"],
        serif: ["var(--font-literata)", "Georgia", "serif"],
      },
      colors: {
        // Design tokens Hồn Sừng Việt (xem README handoff)
        navy: { DEFAULT: "#0f2a4a", deep: "#0b2140" },
        gold: { DEFAULT: "#b08d57", dark: "#8f6f3f", soft: "#f6efe2" },
        champagne: "#e7d3a8",
        ink: { DEFAULT: "#1d2939", 2: "#344054" },
        muted2: "#5b6676",
        subtle: "#6b7686",
        faint: "#8a94a3",
        line: { DEFAULT: "#e6e9ee", 2: "#eef1f5", 3: "#c3cbd6" },
        surface: { DEFAULT: "#f3f5f8", 2: "#f7f9fb", active: "#eef2f7" },
        danger: { DEFAULT: "#b42318", soft: "#fbe9e6", line: "#efc5bd" },
        warn: { DEFAULT: "#8a5a12", soft: "#fbf1dc", line: "#ecd29a" },
        ok: { DEFAULT: "#2f5d3c", soft: "#e7f0e8", line: "#bcd3c0", solid: "#3f7a50" },

        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        card: "14px",
        hero: "20px",
      },
      boxShadow: {
        card: "0 14px 34px rgba(15,42,74,.12)",
        dropdown: "0 18px 44px rgba(15,42,74,.16)",
        drawer: "-16px 0 48px rgba(31,26,21,.18)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        hin: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "none" },
        },
        "drawer-in": {
          from: { transform: "translateX(24px)", opacity: "0" },
          to: { transform: "none", opacity: "1" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        hin: "hin .35s ease",
        "drawer-in": "drawer-in .25s ease",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config

export default config
