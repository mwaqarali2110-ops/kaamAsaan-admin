/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#10233f",
        solar: "#f7b500",
        "solar-soft": "#fff5cf",
        leaf: "#218858",
        canvas: "#fbfaf6",
      },
      boxShadow: {
        soft: "0 12px 30px rgba(16, 35, 63, 0.08)",
      },
    },
  },
  plugins: [],
};
