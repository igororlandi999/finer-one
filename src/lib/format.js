const eurFmt = new Intl.NumberFormat("pt-PT", {
  style: "currency", currency: "EUR",
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const eurCompactFmt = new Intl.NumberFormat("pt-PT", {
  style: "currency", currency: "EUR",
  notation: "compact", minimumFractionDigits: 0, maximumFractionDigits: 1,
});

export const formatEUR        = (v) => eurFmt.format(v ?? 0);
export const formatEURCompact = (v) => eurCompactFmt.format(v ?? 0);
export const formatNumber     = (v) =>
  new Intl.NumberFormat("pt-PT").format(v ?? 0);
