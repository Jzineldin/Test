import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b1220",
        slate950: "#020617",
      },
    },
  },
  plugins: [],
};

export default config;
