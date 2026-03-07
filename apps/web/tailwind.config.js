/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Poppins", "sans-serif"],
        body: ["Work Sans", "sans-serif"]
      },
      colors: {
        canvas: "#f2f5f7",
        panel: "#ffffff",
        ink: "#1f2933",
        muted: "#627d98",
        accent: "#0b7285",
        success: "#2b8a3e",
        warn: "#e8590c"
      },
      boxShadow: {
        panel: "0 12px 30px rgba(15, 23, 42, 0.08)"
      }
    }
  },
  plugins: []
};
