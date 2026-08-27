const eurFmt = new Intl.NumberFormat("pt-PT", {
  style: "currency", currency: "EUR",
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const eurCompactFmt = new Intl.NumberFormat("pt-PT", {
  style: "currency", currency: "EUR",
  notation: "compact", minimumFractionDigits: 0, maximumFractionDigits: 1,
});

/* @deprecated — NÃO USAR EM CÓDIGO NOVO. Use `lib/currency.js`.
 *
 * Estes dois fixam pt-PT e EUR. Foram o formatador original, de quando a aplicação só
 * era demonstrada com uma fixture portuguesa; sobreviveram à mudança da empresa ativa
 * para o Brasil e passaram a afirmar euros sobre valores em reais em cada página que os
 * importava. Toda a aplicação foi migrada em 24/08/2026 e `moedaCentralizada.test.js`
 * impede que alguém os volte a importar.
 *
 * Ficam exportados por uma razão só: `formatNumber` vive neste ficheiro e ainda é usado,
 * e há testes que verificam explicitamente que um formatador fixo em EUR produz euros —
 * é o contraste que dá sentido ao guarda. Quando o multiempresa existir, isto sai. */
export const formatEUR        = (v) => eurFmt.format(v ?? 0);
export const formatEURCompact = (v) => eurCompactFmt.format(v ?? 0);
export const formatNumber     = (v) =>
  new Intl.NumberFormat("pt-PT").format(v ?? 0);
