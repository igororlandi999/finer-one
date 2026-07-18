import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `base` é necessário porque o site é servido em
// https://igororlandi999.github.io/finer-one/ — sem isto,
// os assets ficam com caminhos absolutos (/assets/...) e dão 404.
export default defineConfig({
  base: "/finer-one/",
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
