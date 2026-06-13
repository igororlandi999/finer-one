/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Sidebar = Azul Profundo da identidade
        sidebar: {
          DEFAULT: "#0F172A",
          hover:   "#1E293B",
          active:  "#10B981",
          border:  "rgba(255,255,255,0.08)",
          muted:   "#94A3B8",
        },
        // Brand = Verde Sucesso oficial (ações primárias, crescimento, lucro)
        brand: {
          50:  "#ECFDF5",
          100: "#D1FAE5",
          200: "#A7F3D0",
          300: "#6EE7B7",
          400: "#34D399",
          500: "#10B981",  // ← cor oficial
          600: "#059669",
          700: "#047857",
          800: "#065F46",
          900: "#064E3B",
        },
        // Azul Institucional (cards premium / banners corporativos)
        finerblue: {
          DEFAULT: "#12344D",
          deep:    "#0F172A",
        },
        // Roxo Inovação (IA, recursos inteligentes)
        ai: {
          50:  "#F5F3FF",
          100: "#EDE9FE",
          500: "#7C3AED",  // ← cor oficial
          600: "#6D28D9",
          700: "#5B21B6",
        },
        // Dourado Premium (Enterprise, destaque, valor)
        premium: {
          50:  "#FFFBEB",
          100: "#FEF3C7",
          500: "#F59E0B",  // ← cor oficial
          600: "#D97706",
          700: "#B45309",
        },
        // Fundo claro oficial
        canvas: "#F1F5F9",
      },
      fontFamily: {
        sans: ["Montserrat", "Inter", "system-ui", "sans-serif"],
      },
      borderRadius: { card: "12px" },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,0.04), 0 1px 3px rgba(15,23,42,0.06)",
      },
    },
  },
  plugins: [],
};
