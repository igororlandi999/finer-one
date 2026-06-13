import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `base` é necessário porque o site é servido em
// https://igororlandi999.github.io/finer-one/ — sem isto,
// os assets ficam com caminhos absolutos (/assets/...) e dão 404.
export default defineConfig({
  base: "/finer-one/",
  plugins: [react()],
  server: { port: 5173 },
});
