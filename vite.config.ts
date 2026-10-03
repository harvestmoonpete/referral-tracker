import { defineConfig } from "vite";
export default defineConfig({
  base: process.env.PAGES === "true" ? "/referral-tracker/" : "/",
  server: { proxy: { "/api": "http://localhost:3000" } },
});
