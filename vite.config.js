import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolveBase } from "./vite.base.mjs";

// `base` é necessário porque o site é servido num SUBCAMINHO —
// https://igororlandi999.github.io/finer-one/ — e sem isto os assets
// ficam com caminhos absolutos (/assets/...) e dão 404.
//
// Deixou de ser fixo (R-32): a migração para uma origem própria serve na RAIZ, e aí o
// `base` tem de ser `/`. Quem serve na raiz declara-o por `VITE_BASE=/`; sem a variável,
// o valor é o do GitHub Pages e nada muda. A resolução vive em `vite.base.mjs`, que a
// verificação de pré-deploy também importa — para não haver duas fontes de verdade.
export default defineConfig({
  base: resolveBase(process.env),
  plugins: [react()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        // Separa as libs pesadas em chunks proprios: elimina o aviso de
        // chunk unico >500 kB e melhora o cache entre deploys (o hash do
        // chunk do Recharts so muda quando a lib mudar).
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          // Grafo do Recharts (inclui d3-* e victory-vendor de que ele depende).
          if (/recharts|victory-vendor|[\\/]d3-|internmap/.test(id)) return "recharts";
          // React runtime (barras exigidas para nao capturar lucide-react).
          if (/[\\/]react[\\/]|[\\/]react-dom[\\/]|[\\/]scheduler[\\/]/.test(id)) return "react";
          return undefined; // restante (lucide, lodash, ...) fica no chunk principal
        },
      },
    },
  },
});
