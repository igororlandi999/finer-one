// src/services/producao.fixtures.js
// Envelopes de resposta com o SHAPE REAL de produção, sanitizados.
//
// ─── PORQUE ISTO EXISTE (C7F.3F) ────────────────────────────────────────────────────
// A C7F.3A descobriu que os mocks dos testes produziam um envelope que o backend nunca
// emitiu: `meta.geradoEm` no topo. Os testes passavam a verde a confirmar que o código
// lia aquilo que o próprio teste tinha acabado de escrever — circular, e por isso cego.
// A camada de frescura ficou meses partida em produção sem uma única asserção a
// protestar.
//
// Estes fixtures existem para quebrar esse círculo: são cópias do que o backend
// DEVOLVE, observadas em 2026-08-22, não do que se imagina que devolva.
//
// ─── SANITIZAÇÃO ────────────────────────────────────────────────────────────────────
// Nada aqui identifica ninguém. Foram REMOVIDOS: nomes de pessoas e empresas reais,
// CNPJ/CPF (`contato.numeroDocumento`), links de pagamento (`linkBoleto`,
// `linkQRCodePix`) e quaisquer identificadores que não sejam necessários ao contrato.
// Os IDs que ficam são inventados e curtos. Os VALORES financeiros são fictícios.
//
// O que NÃO foi alterado, porque é precisamente o que se quer testar: os NOMES dos
// campos, o aninhamento, os tipos, e a estrutura dos envelopes (`data`, `meta`,
// `debug`). Nunca acrescentar aqui um campo que produção não forneça.

/* ── Linhas ───────────────────────────────────────────────────────────────────────── */

/** Pedido de venda, como o Bling v3 o devolve através do Apps Script. */
export const PEDIDO = {
  id: 1001,
  numero: 1,
  data: "2026-07-10",
  total: 1500,
  situacao: { id: 9, valor: 1 },
  contato: { id: 2001, nome: "Cliente A" },
  itens: [{ produto: { id: 3001 }, codigo: "SKU-1", descricao: "Produto A", quantidade: 10, valor: 150 }],
  totalProdutos: 1500,
  dataSaida: "2026-07-10",
  numeroLoja: "",
  desconto: 0,
  frete: 0,
  outrasDespesas: 0,
  notaFiscalId: 4001,
  // Marcador acrescentado pelo rebuild (não vem do Bling): indica hidratação feita.
  dreDetalheInspecionado: true,
};

/** Conta a pagar. */
export const DESPESA = {
  id: 5001,
  situacao: 2,
  vencimento: "2026-07-15",
  valor: 200,
  dataEmissao: "2026-07-15",
  vencimentoOriginal: "2026-07-15",
  numeroDocumento: "",
  historico: "",
  saldo: 0,
  categoriaId: 6001,
  contato: { id: 2002, nome: "Fornecedor A" },
  formaPagamento: { id: 7001, nome: "Pix" },
  categoriaNome: "Fretes e seguros",
};

/** Conta a receber. `contato.numeroDocumento` (CNPJ) foi removido de propósito. */
export const RECEBIVEL = {
  id: 8001,
  idOrigem: 8000,
  situacao: 1,
  vencimento: "2026-08-28",
  valor: 480,
  dataEmissao: "2026-07-20",
  idTransacao: "",
  contato: { id: 2001, nome: "Cliente A", tipo: "J" },
  formaPagamento: { id: 7001, codigoFiscal: 20, nome: "Pix" },
  contaContabil: { id: 9001 },
  origem: { id: 8000, numero: "1", dataEmissao: "2026-07-20", situacao: 1, tipoOrigem: "venda", valor: 480 },
  numeroDocumento: "000000001",
  vencimentoOriginal: "2026-08-28",
  competencia: "2026-07-20",
  historico: "Ref. ao pedido de venda nº 1",
  saldo: 480,
  borderos: [],
  categoria: { id: 6002, nome: "Vendas de mercadorias" },
  portador: { id: 9001 },
  vendedor: { id: 0 },
  ocorrencia: { tipo: 1 },
  categoriaId: 6002,
  categoriaNome: "Vendas de mercadorias",
  detalheCarregado: true,
};

/* ── Envelopes ────────────────────────────────────────────────────────────────────── */

const META = (geradoEm, parcial) => ({
  geradoEm,
  totalPedidos: 1,
  totalNovos: 0,
  totalAtualizados: 1,
  totalPreservados: 0,
  parcial,
});

/** Envelope ATUAL (Versão 10 do Web App em diante): `data` + `meta`. */
export const envelopePedidos = ({ geradoEm = "2026-08-22T15:21:55.483Z", parcial = false, linhas = [PEDIDO] } = {}) => ({
  data: linhas,
  meta: META(geradoEm, parcial),
});

export const envelopeDespesas = ({ geradoEm = "2026-08-22T15:23:31.106Z", parcial = false, linhas = [DESPESA] } = {}) => ({
  data: linhas,
  meta: { geradoEm, hidratadosNestaExecucao: 0, reaproveitados: 1, parcial },
});

/** Recebíveis trazem SEMPRE um bloco `debug` a mais — o front ignora chaves extras. */
export const envelopeRecebiveis = ({ geradoEm = "2026-08-22T15:32:06.571Z", parcial = false, linhas = [RECEBIVEL], fonte = "snapshot" } = {}) => ({
  data: linhas,
  meta: { geradoEm, totalTitulos: linhas.length, parcial },
  debug: {
    totalItens: linhas.length,
    situacoesDistintas: { 1: linhas.length },
    periodoConsultado: "completo (sem filtro de data, como em despesas)",
    fonte,
    snapshotMeta: { geradoEm, totalTitulos: linhas.length, parcial },
  },
});

/**
 * Envelope LEGADO dos recebíveis (Versão 9 e anteriores): sem `meta` no topo, com a
 * data apenas em `debug.snapshotMeta.geradoEm`. É o shape que existiu em produção e
 * que o `lerGeradoEm` da C7F.3A passou a tolerar — fica aqui para que a tolerância
 * continue a ser testada mesmo depois de produção ter avançado.
 */
export const envelopeRecebiveisLegado = ({ geradoEm = "2026-07-21T01:42:51.487Z", parcial = false, linhas = [RECEBIVEL] } = {}) => ({
  data: linhas,
  debug: {
    totalItens: linhas.length,
    fonte: "snapshot",
    snapshotMeta: { geradoEm, totalTitulos: linhas.length, parcial },
  },
});

/** Ausência estrutural de snapshot de recebíveis. `data` vazio NÃO é zero real aqui. */
export const envelopeRecebiveisVazio = () => ({
  data: [],
  debug: { totalItens: 0, fonte: "snapshot-vazio", snapshotMeta: null },
});

/** Envelope SEM metadata nenhuma — pedidos e despesas até à Versão 9 inclusive. */
export const envelopeSemMeta = (linhas) => ({ data: linhas });

/** Documento de ajustes manuais. Valores fictícios; nenhum dado real de CMV. */
export const envelopeAjustesManuais = ({ companyId = "overcel", meses = { "2026-06": { cmv: { value: 1000, updatedAt: "2026-08-21T22:03:05.600Z", note: "CMV mensal confirmado" } } } } = {}) => ({
  data: { companyId, updatedAt: "2026-08-21T22:03:05.600Z", months: meses },
  debug: {
    fonte: "documento",
    totalMeses: Object.keys(meses).length,
    totalArquivos: 1,
    documentoMeta: { name: "finer_one_ajustes_manuais_overcel.json", lastUpdated: "2026-08-21T22:03:07.550Z" },
  },
});

/** Ausência do documento de ajustes manuais, no protocolo do backend. */
export const envelopeAjustesManuaisVazio = () => ({
  data: null,
  debug: { fonte: "documento-vazio" },
});
