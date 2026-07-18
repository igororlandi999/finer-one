// src/utils/csvExport.js
// Exportação CSV client-side, sem bibliotecas, pensada para Excel pt-PT:
// BOM UTF-8 (acentos corretos), separador ";", linhas CRLF e decimais com vírgula.
// Regra do produto: só dados reais passam por aqui — mock nunca é exportado.

export function downloadCsv(filename, headers, rows) {
  const esc = (v) => {
    const s = String(v ?? "");
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const line = (cells) => cells.map(esc).join(";");
  const csv = "\uFEFF" + [line(headers), ...rows.map(line)].join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Valor monetário para CSV: vírgula decimal, sem símbolo nem separador de milhar.
// O cabeçalho da coluna indica a moeda (ex.: "Valor (€)").
export function csvMoney(n) {
  return (Number(n) || 0).toFixed(2).replace(".", ",");
}