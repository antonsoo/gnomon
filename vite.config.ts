import { defineConfig } from "vite";
import { contentSecurityPolicy } from "./vite.csp";

export default defineConfig({
  base: "/gnomon/",
  plugins: [contentSecurityPolicy()],
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
