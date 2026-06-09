import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#18201F",
        navy: "#071B3A",
        gold: "#C9972B",
        steel: "#E8EEF2",
        moss: "#1F6F5B",
        mint: "#DDF3EA",
        wheat: "#F4E7C5",
        clay: "#B45F43",
        paper: "#F8F6F0"
      },
      boxShadow: {
        soft: "0 18px 45px rgba(24, 32, 31, 0.10)",
        panel: "0 24px 70px rgba(7, 27, 58, 0.14)"
      }
    }
  },
  plugins: []
};

export default config;
