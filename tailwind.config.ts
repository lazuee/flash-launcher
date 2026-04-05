import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  safelist: ["dark"],
  prefix: "",
  content: ["./src/**/*.{html,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        app: {
          primary: "var(--bg-primary)",
          secondary: "var(--bg-secondary)",
          text: {
            primary: "var(--text-primary)",
            secondary: "var(--text-secondary)",
          },
        },
      },
    },
  },
};

export default config;