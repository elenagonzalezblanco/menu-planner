import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  server: {
    host: true,
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    target: "esnext",
    rollupOptions: {
      output: {
        manualChunks(id) {
          // React core — cached long-term, rarely changes
          if (id.includes("/react-dom/") || id.includes("/react/") || id.includes("/scheduler/")) {
            return "vendor-react";
          }
          // Radix UI primitives
          if (id.includes("@radix-ui/")) {
            return "vendor-radix";
          }
          // TanStack Query
          if (id.includes("@tanstack/")) {
            return "vendor-query";
          }
          // DnD Kit — only loaded with Menu page
          if (id.includes("@dnd-kit/")) {
            return "vendor-dnd";
          }
          // Lucide icons
          if (id.includes("lucide-react")) {
            return "vendor-icons";
          }
        },
      },
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom", "wouter", "@tanstack/react-query", "lucide-react"],
  },
});
