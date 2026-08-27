#!/usr/bin/env node
/* READ-ONLY: descarrega os 3 snapshots + ajustes manuais para ficheiros locais de
 * análise. Só GET. Não imprime a query string nem a base completa. */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
function lerBase() {
  for (const f of [".env.local", ".env"]) {
    try {
      const t = readFileSync(join(RAIZ, f), "utf8");
      const l = t.split(/\r?\n/).find((x) => x.trim().startsWith("VITE_API_BASE_URL="));
      if (l) { const v = l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, ""); if (v) return v; }
    } catch { /* segue */ }
  }
  return process.env.VITE_API_BASE_URL || "";
}
const BASE = lerBase().replace(/\/+$/, "");
const OUT = process.argv[2];
if (!BASE) { console.error("sem base"); process.exit(2); }
if (!OUT) { console.error("uso: node _dumpSnapshots.mjs <dir-saida>"); process.exit(2); }

const alvos = [
  ["pedidos", ""],
  ["despesas", "?recurso=despesas"],
  ["recebiveis", "?recurso=recebiveis"],
  ["ajustes-manuais", "?recurso=ajustes-manuais"],
];
for (const [nome, qs] of alvos) {
  const r = await fetch(BASE + "/pedidos/vendas" + qs, { redirect: "follow" });
  const txt = await r.text();
  writeFileSync(join(OUT, nome + ".json"), txt);
  let n = "?";
  try { const j = JSON.parse(txt); n = Array.isArray(j.data) ? j.data.length : (j.data ? "obj" : "-"); } catch { n = "JSON INVALIDO"; }
  console.log(nome.padEnd(16), "HTTP", r.status, "registos:", n, "bytes:", txt.length);
}
