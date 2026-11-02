import type { Config } from "tailwindcss";

// Bảng màu lấy đúng từ giao diện VBA (cTeal, cTealD, cBg, cLine, cInk, cMute, cPass, cFail, cInput)
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        teal: { DEFAULT: "#1693B5", dark: "#0E6F8A", xl: "#F2F9FB", soft: "#D6EEF5" },
        page: "#EEF3F6",
        line: "#DBE3E8",
        ink: "#1E2A33",
        mute: "#4A5A66",
        pass: { DEFAULT: "#2E9E5B", bg: "#E3F4EA" },
        fail: { DEFAULT: "#D64545", bg: "#FBE6E6" },
        prog: { bg: "#E5EEFB" },
        warn: "#B77A00",
        input: "#FFFBE6",
      },
      fontFamily: { sans: ['"Be Vietnam Pro"', '"Segoe UI"', "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
export default config;
