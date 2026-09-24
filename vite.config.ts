import { defineConfig } from "vite";

export default defineConfig({
  base: "/gnomon/",
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
