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
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      // Chữ Inter dạng biến thiên: đậm nhạt theo nấc 450 / 550 / 650 cho gọn mắt ở cỡ 13px.
      fontWeight: {
        normal: "450",
        medium: "550",
        semibold: "650",
      },
      colors: {
        // Design tokens trang quản trị — tông trắng–đen trung tính: khung gần đen, nội dung trắng, viền xám rất nhạt.
        // brand = màu thao tác chính (nút đen).
        brand: { DEFAULT: "#1a1a1a", deep: "#000000", 2: "#303030", soft: "#a6a6a6", sand: "#e3e3e3", cream: "#ffffff" },
        // Khung tối (thanh bên + viền quanh khung nội dung).
        chrome: { DEFAULT: "#0a0a0a", raised: "#383838", active: "#262626", line: "#2e2e2e", text: "#dcdcdc", muted: "#a6a6a6" },
        // Liên kết.
        accent: { DEFAULT: "#005bd3", dark: "#004299", soft: "#eaf4ff" },
        ink: { DEFAULT: "#101010", 2: "#303030" },
        muted2: "#616161",
        subtle: "#707070",
        faint: "#8a8a8a",
        line: { DEFAULT: "#e3e3e3", 2: "#f1f1f1", 3: "#dbdbdb" },
        surface: { DEFAULT: "#f7f7f7", 2: "#fafafa", active: "#ebebeb" },
        canvas: "#ffffff",
        danger: { DEFAULT: "#c70a24", soft: "#fee8eb", line: "#f7b9c0" },
        warn: { DEFAULT: "#5e4200", soft: "#ffe6b5", line: "#f5c56b" },
        ok: { DEFAULT: "#0f4d00", soft: "#b9f886", line: "#8fdc5a", solid: "#2f8f1f" },
        info: { DEFAULT: "#00527c", soft: "#e0f0ff", line: "#a8d4f5" },

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
      },
      boxShadow: {
        card: "0 1px 0 rgba(0,0,0,.03)",
        btn: "0 1px 0 rgba(0,0,0,.05)",
        dropdown: "0 12px 32px rgba(0,0,0,.16), 0 0 0 1px rgba(0,0,0,.06)",
        drawer: "-16px 0 48px rgba(0,0,0,.18)",
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
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "none" },
        },
        "drawer-in": {
          from: { transform: "translateX(24px)", opacity: "0" },
          to: { transform: "none", opacity: "1" },
        },
        "bar-in": {
          from: { transform: "translateY(-100%)" },
          to: { transform: "none" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        hin: "hin .25s ease",
        "drawer-in": "drawer-in .25s ease",
        "bar-in": "bar-in .2s ease",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config

export default config
