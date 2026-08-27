/****************************************************************************************
 * RecebiveisBackend.gs  —  Finer One / Contas a Receber (Fase 1B — Normalização real)
 * --------------------------------------------------------------------------------------
 * Serve CONTAS A RECEBER reais (Bling v3) no MESMO contrato dos demais recursos:
 * { "data": [ ... ] } — com um bloco extra "debug" (o front ignora chaves extras).
 *
 * ESPELHO do DespesasBackend.gs. Cole NO MESMO projeto Apps Script. REUTILIZA do
 * Code.gs: blingGet_, jsonOut_, safeLog_, formatDateISO_, PAGE_LIMIT, MAX_PAGES,
 * DETAIL_THROTTLE_MS, REBUILD_TIME_BUDGET_MS, LockService.
 * REUTILIZA do DespesasBackend.gs (mesmo projeto, escopo global):
 *   resolverContatoNome_  e  buildFormasPagamentoMap_.
 *
 * NÃO altera pedidos/vendas, NÃO altera recurso=despesas, NÃO toca no proxy/front.
 *
 * FASE 1B — decisões validadas pelo diagnóstico (runDiagnosticarRecebiveis /
 * runInspecionarRecebivelBruto / runTestRecebivelDetalhe):
 *   - A LISTAGEM já entrega: id, idOrigem, situacao (numérica; códigos 1 e 2),
 *     vencimento, valor, dataEmissao, contato{id,nome,numeroDocumento,tipo},
 *     formaPagamento{id,codigoFiscal}, contaContabil{id},
 *     origem{id,numero,dataEmissao,situacao,tipoOrigem,valor}.
 *     Nada disso é mais descartado na normalização.
 *   - Campos EXCLUSIVOS do detalhe (/contas/receber/{id}): borderos, categoria.id,
 *     competencia, historico, numeroDocumento, ocorrencia.tipo, portador.id, saldo,
 *     vencimentoOriginal, vendedor.id. Existem no contrato normalizado desde a
 *     listagem (como null) e são complementados no rebuild.
 *   - MERGE listagem × detalhe: valor PREENCHIDO do detalhe vence; detalhe vazio
 *     NUNCA sobrescreve valor válido da listagem (aplicarDetalhe_).
 *   - Marcador de hidratação: flag interna "detalheCarregado" (o marcador antigo,
 *     dataEmissao != null, deixou de servir porque dataEmissao agora vem da listagem).
 *     Snapshots antigos são reconhecidos por heurística transicional
 *     (anteriorTemDetalhe_) e migrados de shape sem novas chamadas.
 *   - Compatibilidade: categoriaId/categoriaNome continuam na RAIZ como aliases
 *     sincronizados de categoria.id/categoria.nome (contrato anterior preservado;
 *     mudanças apenas aditivas).
 *
 * IMPORTANTE — situacao: esta fase segue SEM assumir significado dos códigos (1/2).
 * A normalização repassa o valor cru e o bloco debug lista as situações distintas.
 ****************************************************************************************/

var RECEBIVEIS_SNAPSHOT_FILE_NAME = 'finer_one_recebiveis_snapshot.json';

/* ====================================================================================
 * MINIMIZAÇÃO DE DADOS NA RESPOSTA PÚBLICA.
 *
 * O Web App está publicado com access: ANYONE_ANONYMOUS e é consumido através de um
 * proxy público cujo URL viaja no bundle do front. Na prática, tudo o que este doGet
 * devolve é legível por quem tiver o endereço.
 *
 * Medido no snapshot de 2026-08-23 (1390 títulos, 279 contactos distintos):
 *   contato.numeroDocumento preenchido em 1389 títulos — 481 CPF de pessoa singular
 *   e 908 CNPJ. CPF é dado pessoal; não tem de estar num endpoint anónimo.
 *
 * O front NÃO usa este campo: normalizeReceivable (blingDataService.js) só transporta
 * contato.id e contato.nome. As fixtures de produção já o removem de propósito. Ou
 * seja, é sobre-exposição pura — sai da resposta sem custo funcional nenhum.
 *
 * O que fica: o snapshot no Drive continua intacto (é privado da conta que implanta),
 * e o campo continua a ser recolhido pelo rebuild. Redige-se à SAÍDA, no único sítio
 * por onde os dados se tornam públicos.
 *
 * idTransacao, linkQRCodePix e linkBoleto vêm hoje sempre vazios (0/1390), mas são
 * links de pagamento por construção: saem também, para que uma mudança do lado do
 * Bling não os publique sem ninguém reparar.
 *
 * PURA: sem rede, sem Drive, sem relógio. Não muta a entrada. */
var CAMPOS_NAO_PUBLICOS_RECEBIVEL = ['idTransacao', 'linkQRCodePix', 'linkBoleto'];

/* O contacto é o único objeto do título que carrega dados pessoais, por isso é o único
 * que se redige por ALLOW-LIST em vez de deny-list. A diferença só se paga no futuro:
 * uma deny-list publica por omissão qualquer campo novo que o Bling comece a devolver
 * (telefone, email, morada), e ninguém dá por isso; a allow-list deixa-o cair. Hoje as
 * duas dão exatamente o mesmo resultado — normalizeContaReceberBasico_ já só guarda
 * id/nome/numeroDocumento/tipo — e é por isso que a troca é gratuita.
 *
 * `nome` FICA: o separador Clientes identifica o cliente por nome e não há substituto.
 * É uma exposição assumida, não um esquecimento. */
var CAMPOS_PUBLICOS_CONTATO_RECEBIVEL = ['id', 'nome', 'tipo'];

function redigirRecebivelPublico_(item) {
  if (!item || typeof item !== 'object') return item;
  var out = {};
  for (var k in item) {
    if (!Object.prototype.hasOwnProperty.call(item, k)) continue;
    if (CAMPOS_NAO_PUBLICOS_RECEBIVEL.indexOf(k) !== -1) continue;
    out[k] = item[k];
  }
  if (item.contato && typeof item.contato === 'object') {
    var c = {};
    for (var i = 0; i < CAMPOS_PUBLICOS_CONTATO_RECEBIVEL.length; i++) {
      var ck = CAMPOS_PUBLICOS_CONTATO_RECEBIVEL[i];
      if (Object.prototype.hasOwnProperty.call(item.contato, ck)) c[ck] = item.contato[ck];
    }
    out.contato = c;
  }
  return out;
}

function redigirRecebiveisPublicos_(data) {
  if (!data || !data.length) return data || [];
  var out = [];
  for (var i = 0; i < data.length; i++) out.push(redigirRecebivelPublico_(data[i]));
  return out;
}

/* ====================================================================================
 * Entrada: serve recebíveis (snapshot pronto ou fallback ao vivo sem nomes).
 * Resposta: { data: [...], debug: { totalItens, situacoesDistintas, fonte, ... } }
 * ==================================================================================== */
function serveRecebiveis_(p) {
  var snap = readRecebiveisSnapshot_();
  // Existência ESTRUTURAL do snapshot: data é um array (mesmo vazio) => é um snapshot
  // real e servível. length 0 é dado real de zero títulos, não ausência.
  if (snap && Array.isArray(snap.data)) {
    safeLog_('Servindo recebiveis do snapshot. Titulos: ' + snap.data.length +
             (snap.meta ? (' | gerado ' + snap.meta.geradoEm + (snap.meta.parcial ? ' (parcial)' : '')) : ''));
    /* Redige à saída: o debug é calculado sobre os mesmos dados públicos, para que
     * os contadores nunca descrevam um conjunto diferente do que foi entregue. */
    var publico = redigirRecebiveisPublicos_(snap.data);
    return jsonOut_({ data: publico, meta: snap.meta || null, debug: debugRecebiveis_(publico, 'snapshot', snap.meta) });
  }

  // Snapshot AUSENTE, inválido ou ilegível (readRecebiveisSnapshot_ devolveu null, ou
  // sem data-array). ENDURECIDO: NAO consulta o Bling. Devolve data:[] com fonte
  // "snapshot-vazio". O front distingue esta fonte de "snapshot" e trata como AUSENCIA
  // (receivables:undefined => lado Clientes usa mock + selo Demo), nunca como zero real.
  safeLog_('Recebiveis: snapshot ausente/invalido. Retornando data:[] fonte snapshot-vazio (sem consultar o Bling).');
  return jsonOut_({ data: [], debug: debugRecebiveis_([], 'snapshot-vazio', null) });
}

/* Bloco de validação: situações distintas, total e período coberto (sem assumir enum). */
function debugRecebiveis_(data, fonte, meta) {
  var dist = {};
  var minVenc = null, maxVenc = null;
  for (var i = 0; i < data.length; i++) {
    var t = data[i];
    var s = (t && t.situacao != null) ? String(t.situacao) : 'null';
    dist[s] = (dist[s] || 0) + 1;
    if (t && t.vencimento) {
      if (!minVenc || t.vencimento < minVenc) minVenc = t.vencimento;
      if (!maxVenc || t.vencimento > maxVenc) maxVenc = t.vencimento;
    }
  }
  return {
    totalItens: data.length,
    situacoesDistintas: dist,
    periodoConsultado: 'completo (sem filtro de data, como em despesas)',
    vencimentoMin: minVenc,
    vencimentoMax: maxVenc,
    fonte: fonte,
    snapshotMeta: meta || null
  };
}

/* ====================================================================================
 * Listagem paginada de /contas/receber (SEM filtro de data — mesmo padrao de despesas:
 * nomes de parametro de data deste endpoint nao confirmados, nao chutamos).
 * ==================================================================================== */
function fetchContasReceberLista_(opts) {
  var sondarFim = !!(opts && opts.sondarFim);
  var todos = [];
  var pagina = 1;
  var paginasLidas = 0;
  var ultimoLote = 0;
  while (pagina <= MAX_PAGES) {
    var res = blingGet_('/contas/receber', { pagina: pagina, limite: PAGE_LIMIT });
    var lote = loteDaListagem_(res, '/contas/receber');
    paginasLidas++;
    ultimoLote = lote.length;
    safeLog_('contas/receber pagina ' + pagina + ': ' + lote.length + ' titulos.');
    for (var i = 0; i < lote.length; i++) todos.push(lote[i]);
    if (lote.length < PAGE_LIMIT) break;
    pagina++;
  }
  /* Propriedades ADITIVAS no array (mesmo padrao de pedidos e despesas): a listagem de
   * /contas/receber tambem nao tem filtro de data e cresce monotonicamente, portanto o
   * teto MAX_PAGES e atingivel por acumulacao. Sem isto, um snapshot truncado chegava
   * ao frontend indistinguivel de um completo. */
  todos.paginasLidas = paginasLidas;
  todos.truncado = paginacaoTruncada_(paginasLidas, ultimoLote, PAGE_LIMIT, MAX_PAGES);
  if (todos.truncado) {
    safeLog_('ATENCAO: listagem de contas a receber TRUNCADA no teto MAX_PAGES (' + MAX_PAGES +
      ' paginas x ' + PAGE_LIMIT + '). Existem titulos por ler; o snapshot sera marcado parcial.');
  }

  /* SONDA DE PAGINA +1 — ver terminacaoPrematura_ (Code.gs) e o gemeo em
   * fetchContasPagarLista_. Aqui pesa MAIS: sao 1390 titulos em 14 paginas, contra 301
   * em 4 das despesas, portanto ha 14 oportunidades por noite de uma pagina vir curta
   * por acidente — e o rebuild de recebiveis SUBSTITUI o snapshot inteiro.
   *
   * Custo: +1 request num rebuild de 14 paginas (+7%). So no rebuild; o caminho de
   * leitura nao paga nada. */
  todos.terminacaoPrematura = false;
  if (sondarFim && !todos.truncado) {
    var sonda = loteDaListagem_(
      blingGet_('/contas/receber', { pagina: pagina + 1, limite: PAGE_LIMIT }),
      '/contas/receber'
    );
    todos.terminacaoPrematura = terminacaoPrematura_(ultimoLote, PAGE_LIMIT, sonda.length);
    if (todos.terminacaoPrematura) {
      safeLog_('ALERTA: paginacao de /contas/receber terminou CEDO. Ultima pagina trouxe ' +
        ultimoLote + ' de ' + PAGE_LIMIT + ', mas a pagina ' + (pagina + 1) + ' tem ' +
        sonda.length + ' titulos. Listagem recolhida (' + todos.length + ') esta INCOMPLETA.');
    }
  }
  return todos;
}

/* ====================================================================================
 * Auxiliares de merge seguro (Fase 1B).
 * "Preenchido" = diferente de null, undefined e string vazia (0 conta como preenchido).
 * ==================================================================================== */
function valorPreenchido_(v) {
  return v !== null && v !== undefined && v !== '';
}

// Devolve o candidato quando preenchido; caso contrario, preserva o valor atual.
function escolherPreenchido_(candidato, atual) {
  return valorPreenchido_(candidato) ? candidato : atual;
}

/* ====================================================================================
 * Forma base do contrato normalizado (listagem + campos exclusivos do detalhe).
 * Campos do detalhe nascem null e sao complementados pelo rebuild.
 * "detalheCarregado" e flag INTERNA de hidratacao (o front ignora chaves extras).
 * ==================================================================================== */
function baseContaReceber_() {
  return {
    // ---- Disponiveis na LISTAGEM ----
    id: null,
    idOrigem: null,
    situacao: null,            // CRU: sem assumir significado (codigos 1/2 observados)
    vencimento: null,
    valor: 0,                  // regra explicita pre-existente: Number(...) || 0
    dataEmissao: null,
    idTransacao: null,
    linkQRCodePix: null,
    linkBoleto: null,
    contato: { id: null, nome: null, numeroDocumento: null, tipo: null },
    formaPagamento: { id: null, codigoFiscal: null, nome: null },
    contaContabil: { id: null },
    origem: { id: null, numero: null, dataEmissao: null, situacao: null, tipoOrigem: null, valor: null },
    // ---- Exclusivos do DETALHE (null ate o rebuild hidratar) ----
    numeroDocumento: null,
    vencimentoOriginal: null,
    competencia: null,
    historico: null,
    saldo: null,
    borderos: null,
    categoria: { id: null, nome: null },
    portador: { id: null },
    vendedor: { id: null },
    ocorrencia: { tipo: null },
    // ---- Aliases de compatibilidade com o contrato anterior (sincronizados) ----
    categoriaId: null,
    categoriaNome: null,
    // ---- Controle interno de hidratacao ----
    detalheCarregado: false
  };
}

/* ====================================================================================
 * Normalizacao a partir SO da listagem. Preserva TUDO que a listagem entrega, com
 * acesso defensivo. Ausencia vira null (nao inventamos valores nem substituimos por
 * zero, exceto "valor", que mantem a regra explicita pre-existente Number(...) || 0).
 * ==================================================================================== */
function normalizeContaReceberBasico_(raw) {
  var out = baseContaReceber_();
  if (!raw) return out;

  out.id = (raw.id != null) ? raw.id : null;
  out.idOrigem = (raw.idOrigem != null) ? raw.idOrigem : null;
  out.situacao = (raw.situacao != null) ? raw.situacao : null; // CRU: sem assumir significado
  out.vencimento = raw.vencimento ? formatDateISO_(raw.vencimento) : null;
  out.valor = Number(raw.valor) || 0;
  out.dataEmissao = raw.dataEmissao ? formatDateISO_(raw.dataEmissao) : null;
  out.idTransacao = (raw.idTransacao != null) ? raw.idTransacao : null;
  out.linkQRCodePix = (raw.linkQRCodePix != null) ? raw.linkQRCodePix : null;
  out.linkBoleto = (raw.linkBoleto != null) ? raw.linkBoleto : null;

  if (raw.contato) {
    out.contato.id = (raw.contato.id != null) ? raw.contato.id : null;
    out.contato.nome = (raw.contato.nome != null && raw.contato.nome !== '') ? raw.contato.nome : null;
    out.contato.numeroDocumento = (raw.contato.numeroDocumento != null && raw.contato.numeroDocumento !== '')
      ? raw.contato.numeroDocumento : null;
    out.contato.tipo = (raw.contato.tipo != null && raw.contato.tipo !== '') ? raw.contato.tipo : null;
  }

  if (raw.formaPagamento) {
    out.formaPagamento.id = (raw.formaPagamento.id != null) ? raw.formaPagamento.id : null;
    out.formaPagamento.codigoFiscal = (raw.formaPagamento.codigoFiscal != null)
      ? raw.formaPagamento.codigoFiscal : null;
    // nome nao vem na listagem: segue resolvido pelo mapa existente no rebuild.
  }

  if (raw.contaContabil) {
    out.contaContabil.id = (raw.contaContabil.id != null) ? raw.contaContabil.id : null;
  }

  if (raw.origem) {
    out.origem.id = (raw.origem.id != null) ? raw.origem.id : null;
    out.origem.numero = (raw.origem.numero != null) ? raw.origem.numero : null;
    out.origem.dataEmissao = raw.origem.dataEmissao ? formatDateISO_(raw.origem.dataEmissao) : null;
    out.origem.situacao = (raw.origem.situacao != null) ? raw.origem.situacao : null;
    out.origem.tipoOrigem = (raw.origem.tipoOrigem != null) ? raw.origem.tipoOrigem : null;
    out.origem.valor = (raw.origem.valor != null) ? Number(raw.origem.valor) : null; // ausencia NAO vira 0
  }

  return out;
}

/* ====================================================================================
 * aplicarDetalhe_(item, det) — mescla o DETALHE cru sobre o item normalizado.
 * Regra: valor PREENCHIDO do detalhe vence; detalhe vazio preserva a listagem.
 * Nao faz chamadas; apenas mescla o que o rebuild ja buscou.
 * ==================================================================================== */
function aplicarDetalhe_(item, det) {
  if (!det) return item;

  // Campos tambem presentes na listagem (detalhe preenchido tem prioridade).
  if (det.situacao != null) item.situacao = det.situacao;
  if (det.valor != null) item.valor = Number(det.valor) || 0;
  item.vencimento = escolherPreenchido_(det.vencimento ? formatDateISO_(det.vencimento) : null, item.vencimento);
  item.dataEmissao = escolherPreenchido_(det.dataEmissao ? formatDateISO_(det.dataEmissao) : null, item.dataEmissao);
  item.idOrigem = escolherPreenchido_((det.idOrigem != null) ? det.idOrigem : null, item.idOrigem);
  item.idTransacao = escolherPreenchido_((det.idTransacao != null) ? det.idTransacao : null, item.idTransacao);
  item.linkQRCodePix = escolherPreenchido_((det.linkQRCodePix != null) ? det.linkQRCodePix : null, item.linkQRCodePix);
  item.linkBoleto = escolherPreenchido_((det.linkBoleto != null) ? det.linkBoleto : null, item.linkBoleto);

  // Exclusivos do detalhe.
  item.numeroDocumento = escolherPreenchido_((det.numeroDocumento != null) ? det.numeroDocumento : null, item.numeroDocumento);
  item.vencimentoOriginal = escolherPreenchido_(det.vencimentoOriginal ? formatDateISO_(det.vencimentoOriginal) : null, item.vencimentoOriginal);
  item.competencia = escolherPreenchido_(det.competencia ? formatDateISO_(det.competencia) : null, item.competencia);
  item.historico = escolherPreenchido_((det.historico != null) ? det.historico : null, item.historico);
  if (det.saldo != null) item.saldo = Number(det.saldo); // ausencia NAO vira 0
  if (Array.isArray(det.borderos)) item.borderos = det.borderos;

  if (det.categoria && det.categoria.id != null) item.categoria.id = det.categoria.id;
  if (det.portador && det.portador.id != null) item.portador.id = det.portador.id;
  if (det.vendedor && det.vendedor.id != null) item.vendedor.id = det.vendedor.id;
  if (det.ocorrencia && det.ocorrencia.tipo != null) item.ocorrencia.tipo = det.ocorrencia.tipo;

  // Estruturas internas: complementa sem apagar o que a listagem trouxe.
  if (det.contato) {
    item.contato.id = escolherPreenchido_((det.contato.id != null) ? det.contato.id : null, item.contato.id);
    item.contato.nome = escolherPreenchido_((det.contato.nome != null) ? det.contato.nome : null, item.contato.nome);
    item.contato.numeroDocumento = escolherPreenchido_(
      (det.contato.numeroDocumento != null) ? det.contato.numeroDocumento : null, item.contato.numeroDocumento);
    item.contato.tipo = escolherPreenchido_((det.contato.tipo != null) ? det.contato.tipo : null, item.contato.tipo);
  }
  if (det.formaPagamento) {
    item.formaPagamento.id = escolherPreenchido_(
      (det.formaPagamento.id != null) ? det.formaPagamento.id : null, item.formaPagamento.id);
    item.formaPagamento.codigoFiscal = escolherPreenchido_(
      (det.formaPagamento.codigoFiscal != null) ? det.formaPagamento.codigoFiscal : null, item.formaPagamento.codigoFiscal);
  }
  if (det.contaContabil && det.contaContabil.id != null) {
    item.contaContabil.id = det.contaContabil.id;
  }
  if (det.origem) {
    item.origem.id = escolherPreenchido_((det.origem.id != null) ? det.origem.id : null, item.origem.id);
    item.origem.numero = escolherPreenchido_((det.origem.numero != null) ? det.origem.numero : null, item.origem.numero);
    item.origem.dataEmissao = escolherPreenchido_(
      det.origem.dataEmissao ? formatDateISO_(det.origem.dataEmissao) : null, item.origem.dataEmissao);
    item.origem.situacao = escolherPreenchido_((det.origem.situacao != null) ? det.origem.situacao : null, item.origem.situacao);
    item.origem.tipoOrigem = escolherPreenchido_((det.origem.tipoOrigem != null) ? det.origem.tipoOrigem : null, item.origem.tipoOrigem);
    if (det.origem.valor != null) item.origem.valor = Number(det.origem.valor);
  }

  sincronizarAliasesCategoria_(item);
  item.detalheCarregado = true;
  return item;
}

/* ====================================================================================
 * copiarDetalheDeAnterior_(item, ant) — reaproveita, SEM novas chamadas, os campos de
 * origem "detalhe" gravados no snapshot anterior. Preenche apenas o que falta no item
 * fresco da listagem (a listagem fresca sempre vence quando preenchida).
 * Aceita o shape ANTIGO do snapshot (categoriaId/categoriaNome na raiz).
 * ==================================================================================== */
function copiarDetalheDeAnterior_(item, ant) {
  if (!ant) return item;

  item.numeroDocumento = escolherPreenchido_(item.numeroDocumento, (ant.numeroDocumento != null) ? ant.numeroDocumento : null);
  item.vencimentoOriginal = escolherPreenchido_(item.vencimentoOriginal, (ant.vencimentoOriginal != null) ? ant.vencimentoOriginal : null);
  item.competencia = escolherPreenchido_(item.competencia, (ant.competencia != null) ? ant.competencia : null);
  item.historico = escolherPreenchido_(item.historico, (ant.historico != null) ? ant.historico : null);
  if (item.saldo == null && ant.saldo != null) item.saldo = Number(ant.saldo);
  if (item.borderos == null && Array.isArray(ant.borderos)) item.borderos = ant.borderos;

  // Categoria: shape novo (ant.categoria) com fallback para o shape antigo (raiz).
  var antCategoriaId = (ant.categoria && ant.categoria.id != null) ? ant.categoria.id
    : ((ant.categoriaId != null) ? ant.categoriaId : null);
  var antCategoriaNome = (ant.categoria && ant.categoria.nome != null) ? ant.categoria.nome
    : ((ant.categoriaNome != null) ? ant.categoriaNome : null);
  item.categoria.id = escolherPreenchido_(item.categoria.id, antCategoriaId);
  item.categoria.nome = escolherPreenchido_(item.categoria.nome, antCategoriaNome);

  if (ant.portador && ant.portador.id != null && item.portador.id == null) item.portador.id = ant.portador.id;
  if (ant.vendedor && ant.vendedor.id != null && item.vendedor.id == null) item.vendedor.id = ant.vendedor.id;
  if (ant.ocorrencia && ant.ocorrencia.tipo != null && item.ocorrencia.tipo == null) item.ocorrencia.tipo = ant.ocorrencia.tipo;

  if (ant.contato) {
    item.contato.nome = escolherPreenchido_(item.contato.nome, (ant.contato.nome != null) ? ant.contato.nome : null);
    item.contato.numeroDocumento = escolherPreenchido_(item.contato.numeroDocumento,
      (ant.contato.numeroDocumento != null) ? ant.contato.numeroDocumento : null);
    item.contato.tipo = escolherPreenchido_(item.contato.tipo, (ant.contato.tipo != null) ? ant.contato.tipo : null);
  }
  if (ant.formaPagamento) {
    item.formaPagamento.nome = escolherPreenchido_(item.formaPagamento.nome,
      (ant.formaPagamento.nome != null) ? ant.formaPagamento.nome : null);
    item.formaPagamento.codigoFiscal = escolherPreenchido_(item.formaPagamento.codigoFiscal,
      (ant.formaPagamento.codigoFiscal != null) ? ant.formaPagamento.codigoFiscal : null);
  }
  if (ant.contaContabil && ant.contaContabil.id != null && item.contaContabil.id == null) {
    item.contaContabil.id = ant.contaContabil.id;
  }
  if (ant.origem) {
    item.origem.id = escolherPreenchido_(item.origem.id, (ant.origem.id != null) ? ant.origem.id : null);
    item.origem.numero = escolherPreenchido_(item.origem.numero, (ant.origem.numero != null) ? ant.origem.numero : null);
    item.origem.dataEmissao = escolherPreenchido_(item.origem.dataEmissao,
      (ant.origem.dataEmissao != null) ? ant.origem.dataEmissao : null);
    item.origem.situacao = escolherPreenchido_(item.origem.situacao,
      (ant.origem.situacao != null) ? ant.origem.situacao : null);
    item.origem.tipoOrigem = escolherPreenchido_(item.origem.tipoOrigem,
      (ant.origem.tipoOrigem != null) ? ant.origem.tipoOrigem : null);
    if (item.origem.valor == null && ant.origem.valor != null) item.origem.valor = Number(ant.origem.valor);
  }

  item.dataEmissao = escolherPreenchido_(item.dataEmissao, (ant.dataEmissao != null) ? ant.dataEmissao : null);
  item.idTransacao = escolherPreenchido_(item.idTransacao, (ant.idTransacao != null) ? ant.idTransacao : null);
  item.linkQRCodePix = escolherPreenchido_(item.linkQRCodePix, (ant.linkQRCodePix != null) ? ant.linkQRCodePix : null);
  item.linkBoleto = escolherPreenchido_(item.linkBoleto, (ant.linkBoleto != null) ? ant.linkBoleto : null);

  sincronizarAliasesCategoria_(item);
  return item;
}

/* Mantem os aliases de compatibilidade (raiz) espelhando categoria.{id,nome}. */
function sincronizarAliasesCategoria_(item) {
  item.categoriaId = (item.categoria && item.categoria.id != null) ? item.categoria.id : null;
  item.categoriaNome = (item.categoria && item.categoria.nome != null) ? item.categoria.nome : null;
}

/* Reconhece titulo hidratado no snapshot anterior. O marcador oficial e a flag
 * detalheCarregado; a heuristica cobre snapshots ANTIGOS (gerados antes desta fase),
 * cujo marcador era dataEmissao — que agora vem da listagem e deixou de servir. */
function anteriorTemDetalhe_(pa) {
  if (!pa) return false;
  if (pa.detalheCarregado === true) return true;
  return pa.saldo != null ||
         valorPreenchido_(pa.historico) ||
         valorPreenchido_(pa.vencimentoOriginal) ||
         valorPreenchido_(pa.numeroDocumento);
}

/* ====================================================================================
 * Detalhe de uma conta a receber — /contas/receber/{id}
 * ==================================================================================== */
function fetchContaReceberDetalhe_(id) {
  var res = blingGet_('/contas/receber/' + encodeURIComponent(id), null);
  return (res && res.data) ? res.data : null;
}

/* ====================================================================================
 * Mapa categoriaId -> nome via /categorias/receitas-despesas (nome proprio para nao
 * colidir com funcoes existentes do lado das despesas).
 * ==================================================================================== */
function buildCategoriasMapRecebiveis_() {
  var map = {};
  try {
    var pagina = 1;
    var paginasLidas = 0;
    var ultimoLote = 0;
    while (pagina <= MAX_PAGES) {
      var res = blingGet_('/categorias/receitas-despesas', { pagina: pagina, limite: PAGE_LIMIT });
      var lote = (res && res.data) ? res.data : [];
      paginasLidas++;
      ultimoLote = lote.length;
      for (var i = 0; i < lote.length; i++) {
        var c = lote[i];
        if (c && c.id != null) map[String(c.id)] = c.descricao || c.nome || null;
      }
      if (lote.length < PAGE_LIMIT) break;
      pagina++;
    }
    if (paginacaoTruncada_(paginasLidas, ultimoLote, PAGE_LIMIT, MAX_PAGES)) {
      map[MAPA_INCOMPLETO_] = true;
      safeLog_('ATENCAO: mapa de categorias (recebiveis) TRUNCADO no teto MAX_PAGES.');
    }
  } catch (e) {
    map[MAPA_INCOMPLETO_] = true;
    safeLog_('Aviso: nao foi possivel listar categorias (' + (e && e.message ? e.message : e) + ').');
  }
  return map;
}

/* ====================================================================================
 * REBUILD do snapshot de recebiveis — hidrata detalhe + resolve nomes. Incremental.
 * Mesmo fluxo de chamadas, throttle e orcamento de tempo da versao anterior.
 * Reutiliza resolverContatoNome_ e buildFormasPagamentoMap_ do DespesasBackend.gs.
 * ==================================================================================== */
function rebuildRecebiveisSnapshot_() {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    safeLog_('Rebuild de recebiveis ja em andamento. Abortando.');
    return { ok: false, motivo: 'lock' };
  }

  var inicio = Date.now();
  try {
    var lista = fetchContasReceberLista_({ sondarFim: true });
    /* CUSTO DA LISTAGEM, medido — o teto de escala deixa de ser invisivel.
     *
     * `/contas/receber` e listado INTEGRALMENTE (nao ha filtro de data confirmado) e a
     * listagem recomeca na pagina 1 em cada execucao: nao ha cursor de continuacao.
     * Medido em 2026-08-23: 14 paginas em ~27 s (~1,9 s/pagina) de um orcamento de
     * REBUILD_TIME_BUDGET_MS. A ~5-6x o volume atual a listagem sozinha consome o
     * orcamento e o rebuild deixa de convergir — e faz-lo em silencio, porque a
     * hidratacao limita-se a partir a `parcial` e o snapshot sai com nomes por resolver.
     *
     * Isto MEDE, nao decide. Nao ha limiar aqui e nao se aborta por lentidao: o numero
     * fica na meta e no log, ao lado do orcamento, para que a aproximacao ao teto seja
     * observavel ANTES de o atingir. Corrigir o teto exige um cursor de continuacao —
     * uma mudanca de replace para merge nesta fonte, com consequencias proprias sobre
     * titulos apagados no ERP, e por isso uma decisao de arquitetura por tomar. */
    var listagemMs = Date.now() - inicio;
    safeLog_('Rebuild recebiveis | titulos na listagem: ' + lista.length +
      ' | paginas: ' + lista.paginasLidas +
      ' | listagem levou ' + Math.round(listagemMs / 1000) + 's de um orcamento de ' +
      Math.round(REBUILD_TIME_BUDGET_MS / 1000) + 's.');

    /* TERMINACAO PREMATURA: a sonda de pagina +1 provou que ha titulos por ler.
     * ABORTAMOS SEM GRAVAR — ver o gemeo em rebuildDespesasSnapshot_. A guarda de
     * listagem vazia nao apanha este caso: uma listagem truncada NAO vem vazia, e por
     * isso passaria a substituir 1390 titulos por uma fracao deles.
     *
     * Vem ANTES de qualquer chamada de hidratacao: nao ha razao para gastar orcamento
     * de tempo e requests a enriquecer uma listagem que ja se sabe incompleta. */
    if (lista.terminacaoPrematura) {
      safeLog_('ABORTADO: paginacao de contas a receber terminou antes do fim (sonda de ' +
        'pagina +1 trouxe titulos). Snapshot anterior PRESERVADO (nao foi gravado nada).');
      return { ok: false, motivo: 'paginacao-terminada-cedo', totalRecolhido: lista.length };
    }

    var formasMap = buildFormasPagamentoMap_();
    var categoriasMap = buildCategoriasMapRecebiveis_();

    // Cache incremental a partir do snapshot anterior (aceita shape antigo e novo).
    var anteriorPorId = {};
    var contatoCache = {};
    var anterior = readRecebiveisSnapshot_();
    if (anterior && anterior.data) {
      for (var a = 0; a < anterior.data.length; a++) {
        var pa = anterior.data[a];
        if (pa && pa.id != null) {
          anteriorPorId[String(pa.id)] = pa;
          if (pa.contato && pa.contato.id != null && pa.contato.nome) {
            contatoCache[String(pa.contato.id)] = pa.contato.nome;
          }
        }
      }
    }

    /* P0: listagem vazia com histórico por baixo é suspeita, não é zero real.
     * Ver podeGravarListagemVazia_ em Code.gs. Abortamos SEM gravar. */
    var totalAnteriorR = (anterior && anterior.data) ? anterior.data.length : 0;
    if (!podeGravarListagemVazia_(lista.length, totalAnteriorR)) {
      safeLog_('ABORTADO: listagem de contas a receber veio VAZIA mas o snapshot anterior ' +
        'tem ' + totalAnteriorR + ' titulos. Snapshot anterior PRESERVADO (nao foi gravado nada).');
      return { ok: false, motivo: 'listagem-vazia-suspeita', totalAnterior: totalAnteriorR };
    }

    var data = [];
    var chamadasDetalhe = 0, hidratados = 0, reaproveitados = 0, parcial = false;

    for (var i = 0; i < lista.length; i++) {
      var raw = lista[i];
      var idStr = (raw && raw.id != null) ? String(raw.id) : null;

      // Sempre parte da listagem FRESCA (preserva contato.nome, dataEmissao, origem...).
      var item = normalizeContaReceberBasico_(raw);

      // Reaproveita titulo ja hidratado: complementa com o detalhe do snapshot anterior,
      // sem nova chamada e sem sobrescrever valores frescos da listagem.
      var ant = idStr ? anteriorPorId[idStr] : null;
      if (ant && anteriorTemDetalhe_(ant)) {
        copiarDetalheDeAnterior_(item, ant);
        item.detalheCarregado = true;
        if (item.contato.id != null && !valorPreenchido_(item.contato.nome)) {
          var emCache = contatoCache[String(item.contato.id)];
          if (emCache) item.contato.nome = emCache; // so cache; sem chamada neste branch
        }
        if (item.formaPagamento.id != null && !valorPreenchido_(item.formaPagamento.nome)) {
          item.formaPagamento.nome = formasMap[String(item.formaPagamento.id)] || null;
        }
        if (item.categoria.id != null && !valorPreenchido_(item.categoria.nome)) {
          item.categoria.nome = categoriasMap[String(item.categoria.id)] || null;
        }
        sincronizarAliasesCategoria_(item);
        data.push(item);
        reaproveitados++;
        continue;
      }

      // Orcamento de tempo: salva parcial e pede re-run (restante entra so com o basico).
      if (Date.now() - inicio > REBUILD_TIME_BUDGET_MS) {
        parcial = true;
        safeLog_('Orcamento de tempo atingido. Salvando snapshot PARCIAL de recebiveis.');
        data.push(item);
        for (var r = i + 1; r < lista.length; r++) data.push(normalizeContaReceberBasico_(lista[r]));
        break;
      }

      // Detalhe: mescla com prioridade para valor PREENCHIDO do detalhe;
      // detalhe vazio preserva o que a listagem ja trouxe.
      var det = fetchContaReceberDetalhe_(raw.id);
      chamadasDetalhe++;
      if (det) {
        aplicarDetalhe_(item, det);
        hidratados++;
      }

      // Nomes: contato.nome ja costuma vir da listagem; so resolve via API se faltar.
      if (item.contato.id != null) {
        if (valorPreenchido_(item.contato.nome)) {
          contatoCache[String(item.contato.id)] = item.contato.nome; // alimenta cache sem chamada
        } else {
          item.contato.nome = resolverContatoNome_(item.contato.id, contatoCache);
        }
      }
      if (item.formaPagamento.id != null && !valorPreenchido_(item.formaPagamento.nome)) {
        item.formaPagamento.nome = formasMap[String(item.formaPagamento.id)] || null;
      }
      if (item.categoria.id != null && !valorPreenchido_(item.categoria.nome)) {
        item.categoria.nome = categoriasMap[String(item.categoria.id)] || null;
      }
      sincronizarAliasesCategoria_(item);

      data.push(item);
      Utilities.sleep(DETAIL_THROTTLE_MS); // throttle (~2 req/s)
    }

    var snapshot = {
      data: data,
      meta: {
        geradoEm: new Date().toISOString(),
        totalTitulos: data.length,
        hidratadosNestaExecucao: hidratados,
        reaproveitados: reaproveitados,
        chamadasDetalhe: chamadasDetalhe,
        /* Dois eixos de truncamento, um agregado. `parcial` era so o eixo do TEMPO;
         * o eixo da PAGINACAO nem sequer era medido aqui. Ver paginacaoTruncada_ em
         * Code.gs e docs/SOURCE_COVERAGE_CONTRACT.md. */
        listagemTruncada: !!(lista && lista.truncado),
        paginasLidas: (lista && lista.paginasLidas != null) ? lista.paginasLidas : null,
        /* Custo da fase de LISTAGEM e o orcamento em que ela cabe. Dois numeros, sem
         * veredito: quem os ler decide o que fazer com a razao entre eles. Ver o bloco
         * em `listagemMs`, acima. */
        listagemMs: listagemMs,
        orcamentoMs: REBUILD_TIME_BUDGET_MS,
        enriquecimentoIncompleto: mapaIncompleto_(categoriasMap) || mapaIncompleto_(formasMap),
        parcial: parcial || !!(lista && lista.truncado)
          || mapaIncompleto_(categoriasMap) || mapaIncompleto_(formasMap)
      }
    };
    saveRecebiveisSnapshot_(snapshot);

    var ms = Date.now() - inicio;
    safeLog_('Rebuild recebiveis concluido' + (parcial ? ' (PARCIAL)' : '') + '.');
    safeLog_('Titulos: ' + data.length + ' | hidratados agora: ' + hidratados +
             ' | reaproveitados: ' + reaproveitados + ' | chamadas detalhe: ' + chamadasDetalhe);
    safeLog_('Tempo aprox.: ' + Math.round(ms / 1000) + 's | tamanho ~' +
             Math.round(JSON.stringify(snapshot).length / 1024) + ' KB');
    if (parcial) safeLog_('PARCIAL: rode runRebuildRecebiveisSnapshot novamente para continuar.');

    return { ok: true, parcial: parcial, hidratados: hidratados, reaproveitados: reaproveitados };
  } finally {
    lock.releaseLock();
  }
}

/* ====================================================================================
 * Snapshot no Drive (arquivo separado dos de pedidos e despesas).
 * ==================================================================================== */
function readRecebiveisSnapshot_() {
  var file = findRecebiveisSnapshotFile_();
  if (!file) return null;
  try {
    return JSON.parse(file.getBlob().getDataAsString());
  } catch (e) {
    safeLog_('Snapshot de recebiveis ilegivel (JSON invalido).');
    return null;
  }
}

function findRecebiveisSnapshotFile_() {
  var it = DriveApp.getFilesByName(RECEBIVEIS_SNAPSHOT_FILE_NAME);
  return it.hasNext() ? it.next() : null;
}

function getOrCreateRecebiveisSnapshotFile_() {
  var file = findRecebiveisSnapshotFile_();
  if (file) return file;
  return DriveApp.createFile(RECEBIVEIS_SNAPSHOT_FILE_NAME, '{"data":[]}', 'application/json');
}

function saveRecebiveisSnapshot_(obj) {
  var file = getOrCreateRecebiveisSnapshotFile_();
  file.setContent(JSON.stringify(obj));
}

/* ---- Wrappers SEM underline (rodar pelo editor) ---- */

function runRebuildRecebiveisSnapshot() {
  return rebuildRecebiveisSnapshot_();
}

function runReadRecebiveisSnapshotTest() {
  var s = readRecebiveisSnapshot_();
  if (!s) { safeLog_('Snapshot de recebiveis inexistente (null).'); return; }
  safeLog_('Snapshot de recebiveis lido. Titulos: ' + (s.data ? s.data.length : 0));
  if (s.meta) {
    safeLog_('Meta -> gerado ' + s.meta.geradoEm +
             ' | hidratados ' + s.meta.hidratadosNestaExecucao +
             ' | reaproveitados ' + s.meta.reaproveitados +
             ' | parcial ' + s.meta.parcial);
  }
}

/* Validação rápida das situações reais (roda no editor, só listagem, sem gravar). */
function runTestSituacoesRecebiveis() {
  var lista = fetchContasReceberLista_();
  var data = [];
  for (var i = 0; i < lista.length; i++) data.push(normalizeContaReceberBasico_(lista[i]));
  var dbg = debugRecebiveis_(data, 'teste-manual', null);
  safeLog_('totalItens: ' + dbg.totalItens);
  safeLog_('situacoesDistintas: ' + JSON.stringify(dbg.situacoesDistintas));
  safeLog_('vencimentos: ' + dbg.vencimentoMin + ' a ' + dbg.vencimentoMax);
  for (var j = 0; j < Math.min(3, data.length); j++) {
    safeLog_('AMOSTRA[' + j + ']: id=' + data[j].id + ' situacao=' + data[j].situacao +
             ' vencimento=' + data[j].vencimento + ' valor=' + data[j].valor);
  }
}

/* ====================================================================================
 * Validação MANUAL da normalização (Fase 1B). Uma pagina pequena, sem gravar snapshot,
 * sem tokens, sem links Pix/boleto, sem documentos completos — apenas contadores.
 * ==================================================================================== */
function runValidarNormalizacaoRecebiveis() {
  var LIMITE_VALIDACAO = 20;

  var res = blingGet_('/contas/receber', { pagina: 1, limite: LIMITE_VALIDACAO });
  var lote = (res && res.data) ? res.data : [];
  if (!lote.length) {
    safeLog_('Nenhum registro retornado para validacao.');
    return;
  }

  var contadores = {
    'contato.nome': 0,
    'contato.numeroDocumento': 0,
    'dataEmissao': 0,
    'formaPagamento.codigoFiscal': 0,
    'origem.id': 0,
    'contaContabil.id': 0
  };
  var comId = 0;

  for (var i = 0; i < lote.length; i++) {
    var n = normalizeContaReceberBasico_(lote[i]);
    if (n.id != null) comId++;
    if (valorPreenchido_(n.contato.nome)) contadores['contato.nome']++;
    if (valorPreenchido_(n.contato.numeroDocumento)) contadores['contato.numeroDocumento']++;
    if (valorPreenchido_(n.dataEmissao)) contadores['dataEmissao']++;
    if (valorPreenchido_(n.formaPagamento.codigoFiscal)) contadores['formaPagamento.codigoFiscal']++;
    if (n.origem.id != null) contadores['origem.id']++;
    if (n.contaContabil.id != null) contadores['contaContabil.id']++;
  }

  safeLog_('========== VALIDACAO DA NORMALIZACAO (amostra de ' + lote.length + ' titulos) ==========');
  safeLog_('Registros com id: ' + comId + '/' + lote.length);
  Object.keys(contadores).forEach(function (campo) {
    safeLog_(campo + ' preservado em: ' + contadores[campo] + '/' + lote.length);
  });
  safeLog_('Nada foi gravado (sem snapshot). Nenhum valor sensivel foi logado.');
  safeLog_('==================================================================================');

  return contadores;
}


/****************************************************************************************
 * Gatilho diário (instalação MANUAL e idempotente).
 * Executar UMA vez no editor: installDailyRecebiveisSnapshotTrigger()
 *
 * Espelha installDailyPedidosSnapshotTrigger de Código.gs. Idempotente por construção:
 * remove TODOS os gatilhos já existentes para runRebuildRecebiveisSnapshot antes de criar
 * um novo, pelo que correr a função repetidamente nunca acumula gatilhos.
 *
 * Hora escalonada (~03:00) para os três rebuilds não competirem: todos usam o
 * mesmo LockService, e o Apps Script dispara gatilhos horários dentro de uma JANELA de
 * cerca de uma hora — não ao minuto exato. Se por acaso dois se cruzarem, o segundo não
 * corrompe nada: falha a obter o lock e recupera na execução seguinte.
 ****************************************************************************************/
function installDailyRecebiveisSnapshotTrigger() {
  var alvo = 'runRebuildRecebiveisSnapshot';
  var removidos = 0;

  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === alvo) {
      ScriptApp.deleteTrigger(triggers[i]);
      removidos++;
    }
  }

  ScriptApp.newTrigger(alvo)
    .timeBased()
    .atHour(3)
    .nearMinute(0)
    .everyDays(1)
    .inTimezone(SNAPSHOT_TIMEZONE)
    .create();

  safeLog_('Gatilho diario instalado para ' + alvo + ' (~03:00 ' + SNAPSHOT_TIMEZONE + ').');
  safeLog_('Gatilhos duplicados removidos: ' + removidos);
  return { ok: true, removidos: removidos };
}

function listRecebiveisSnapshotTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  var n = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'runRebuildRecebiveisSnapshot') n++;
  }
  safeLog_('Gatilhos de runRebuildRecebiveisSnapshot: ' + n);
  return n;
}
