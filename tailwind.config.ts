import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";

const config: Config = {
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        display: ["var(--font-outfit)", "sans-serif"],
      },
      colors: {
        brand: {
          bg: "#05070f",
          card: "rgba(13, 18, 36, 0.7)",
          border: "rgba(255, 255, 255, 0.08)",
          accent: "#4f46e5", // Electric indigo
          glow: "#c084fc",   // Glowing violet
          teal: "#0d9488",   // Premium teal
        }
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
      }
    }
  },
  plugins: [forms]
};

export default config;
