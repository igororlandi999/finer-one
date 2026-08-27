/****************************************************************************************
 * DespesasBackend.gs  —  Finer One / Despesas (MVP-1)
 * --------------------------------------------------------------------------------------
 * Serve CONTAS A PAGAR reais (Bling v3) para a aba Despesas, no MESMO contrato dos
 * pedidos: { "data": [ ... ] }. Reutiliza do Code.gs: blingGet_, jsonOut_, safeLog_,
 * formatDateISO_, addDays_, LockService, PAGE_LIMIT, MAX_PAGES, DEFAULT_DAYS,
 * DETAIL_THROTTLE_MS, REBUILD_TIME_BUDGET_MS.
 *
 * Estratégia (igual a pedidos):
 *   - doGet com ?recurso=despesas serve o snapshot pronto (com nomes resolvidos).
 *   - Sem snapshot: fallback ao vivo da LISTAGEM (sem detalhe/nomes) — KPIs já funcionam.
 *   - rebuildDespesasSnapshot_(): hidrata o DETALHE de cada título (historico, dataEmissao,
 *     vencimentoOriginal, numeroDocumento, saldo, categoria.id), resolve contato.id -> nome
 *     e formaPagamento.id -> nome, com throttle, orçamento de tempo, LockService e cache
 *     incremental. categoria fica como ID (MVP-1: front mostra "Sem categoria").
 *
 * >>> INSERÇÃO NECESSÁRIA NO doGet DO Code.gs <<<
 *     Logo após o bloco "if (p.code) { ... }", adicione estas 3 linhas:
 *
 *         if (p.recurso === 'despesas') {
 *           return serveDespesas_(p);
 *         }
 *
 *     Nada mais no doGet muda; sem ?recurso, o comportamento de /pedidos/vendas é o atual.
 ****************************************************************************************/

var DESPESAS_SNAPSHOT_FILE_NAME = 'finer_one_despesas_snapshot.json';

/* ====================================================================================
 * Entrada: serve despesas (snapshot pronto ou fallback ao vivo sem nomes).
 * ==================================================================================== */
function serveDespesas_(p) {
  var snap = readDespesasSnapshot_();
  if (snap && snap.data && snap.data.length > 0) {
    safeLog_('Servindo despesas do snapshot. Titulos: ' + snap.data.length +
      (snap.meta ? (' | gerado ' + snap.meta.geradoEm + (snap.meta.parcial ? ' (parcial)' : '')) : ''));
    return jsonOut_({ data: snap.data, meta: snap.meta || null });
  }

  // Sem snapshot: lista ao vivo SEM detalhe/nomes (nomes virao apos o rebuild).
  var lista = fetchContasPagarLista_();
  var data = [];
  for (var i = 0; i < lista.length; i++) {
    data.push(normalizeContaPagarBasico_(lista[i]));
  }
  safeLog_('Despesas: snapshot ausente, fallback ao vivo (sem nomes). Titulos: ' + data.length);
  return jsonOut_({ data: data });
}

/* ====================================================================================
 * Listagem paginada de /contas/pagar (SEM filtro de data: a conta tem poucos titulos
 * e os nomes de parametro de data nao foram confirmados — evitamos chute).
 * ==================================================================================== */
function fetchContasPagarLista_(opts) {
  var sondarFim = !!(opts && opts.sondarFim);
  var todos = [];
  var pagina = 1;
  var paginasLidas = 0;
  var ultimoLote = 0;
  while (pagina <= MAX_PAGES) {
    var res = blingGet_('/contas/pagar', { pagina: pagina, limite: PAGE_LIMIT });
    var lote = loteDaListagem_(res, '/contas/pagar');
    paginasLidas++;
    ultimoLote = lote.length;
    safeLog_('contas/pagar pagina ' + pagina + ': ' + lote.length + ' titulos.');
    for (var i = 0; i < lote.length; i++) todos.push(lote[i]);
    if (lote.length < PAGE_LIMIT) break;
    pagina++;
  }
  /* MAX_PAGES atingido com a ultima pagina CHEIA: a listagem foi truncada e nao ha
   * como saber quantos titulos ficaram de fora. Isto ja acontecia — em silencio.
   * Passa a viajar na meta, porque um snapshot truncado nao e um snapshot completo
   * e ninguem a jusante tinha como o saber (P3.1 do backlog).
   *
   * A decisao passou para paginacaoTruncada_ (Code.gs), partilhada pelos tres
   * paginadores: a regra de "fim natural vs teto" ser reimplementada em cada laco era
   * exatamente como pedidos e recebiveis ficaram sem ela. */
  var truncado = paginacaoTruncada_(paginasLidas, ultimoLote, PAGE_LIMIT, MAX_PAGES);

  /* SONDA DE PAGINA +1 — confirmacao DETERMINISTICA do fim (ver terminacaoPrematura_
   * em Code.gs). Uma pagina curta encerra o laco como se fosse a ultima; se a pagina
   * seguinte trouxer titulos, a paginacao parou antes do fim e esta listagem e uma
   * fracao do que existe. Gravar isto por cima do snapshot anterior e a perda de dados
   * que a guarda de listagem vazia nao apanha (5 titulos onde havia 1390 nao e vazio).
   *
   * SO NO REBUILD (`sondarFim`), nunca no fallback ao vivo. O fallback ja amplifica um
   * pedido anonimo em 4 chamadas ao Bling contra um limite de 3 req/s, e ali um custo
   * extra por chamada e pago por quem nao tem snapshot nenhum. No rebuild e +1 request
   * por noite: 4 paginas passam a 5.
   *
   * Nao se sonda quando o laco parou no teto: ai a pagina seguinte TEM dados por
   * definicao, e isso ja e `truncado`. Contar duas vezes o mesmo facto so confundiria
   * o diagnostico. */
  var terminacaoPrematura = false;
  if (sondarFim && !truncado) {
    var sonda = loteDaListagem_(
      blingGet_('/contas/pagar', { pagina: pagina + 1, limite: PAGE_LIMIT }),
      '/contas/pagar'
    );
    terminacaoPrematura = terminacaoPrematura_(ultimoLote, PAGE_LIMIT, sonda.length);
    if (terminacaoPrematura) {
      safeLog_('ALERTA: paginacao de /contas/pagar terminou CEDO. Ultima pagina trouxe ' +
        ultimoLote + ' de ' + PAGE_LIMIT + ', mas a pagina ' + (pagina + 1) + ' tem ' +
        sonda.length + ' titulos. Listagem recolhida (' + todos.length + ') esta INCOMPLETA.');
    }
  }

  /* Propriedades no array: aditivas e invisiveis para todos os `for` que ja o
   * percorrem. Devolver um objeto novo obrigaria a tocar em todos os chamadores. */
  todos.paginasLidas = paginasLidas;
  todos.truncado = truncado;
  todos.terminacaoPrematura = terminacaoPrematura;
  return todos;
}

/* ====================================================================================
 * INTERVALO DE DATAS PRESENTE NO SNAPSHOT — funcao PURA, sem rede e sem relogio.
 *
 * ─── O QUE ISTO E, E O QUE NAO E ───────────────────────────────────────────────────
 * Mede o RANGE dos dados que vieram: a menor e a maior data de cada campo. NAO afirma
 * cobertura contabilistica. Um `vencimentoMax` de 2027-07 nao significa que a empresa
 * tem despesas ate 2027 — significa que ha um titulo com vencimento futuro. E um
 * `vencimentoMax` de 2026-07 nao significa que julho esta completo: significa que o
 * ultimo titulo QUE JA CHEGOU e de julho.
 *
 * Range != cobertura. Derivar cobertura daqui reintroduziria exatamente o defeito de
 * 2027-07 que ja custou uma sessao a este projeto. Ver docs/SOURCE_COVERAGE_CONTRACT.md.
 *
 * ─── PORQUE E ADITIVO E BARATO ─────────────────────────────────────────────────────
 * Uma passagem sobre um array que ja esta em memoria, sem uma unica chamada extra ao
 * Bling. Nao ha PII: sao datas ISO e contagens. Nenhum campo existente muda.
 * ==================================================================================== */
function intervalosDeDatas_(data) {
  var campos = ['vencimento', 'dataEmissao', 'vencimentoOriginal'];
  var out = {};
  for (var c = 0; c < campos.length; c++) {
    var campo = campos[c];
    var min = null, max = null, comValor = 0;
    for (var i = 0; i < (data || []).length; i++) {
      var v = data[i] ? data[i][campo] : null;
      // Só strings ISO "aaaa-mm-dd", que é o que formatDateISO_ produz. Comparação
      // lexicográfica: correta para este formato e sem parsing de datas.
      if (typeof v !== 'string' || v.length < 10) continue;
      comValor++;
      if (min === null || v < min) min = v;
      if (max === null || v > max) max = v;
    }
    out[campo] = { min: min, max: max, comValor: comValor };
  }
  return out;
}

/* ====================================================================================
 * Normalizacao a partir SO da listagem (sem detalhe, sem nomes). Forma final do front.
 * ==================================================================================== */
function normalizeContaPagarBasico_(raw) {
  if (!raw) {
    return baseContaPagar_();
  }
  var out = baseContaPagar_();
  out.id = (raw.id != null) ? raw.id : null;
  out.situacao = (raw.situacao != null) ? raw.situacao : null;
  out.vencimento = raw.vencimento ? formatDateISO_(raw.vencimento) : null;
  out.valor = Number(raw.valor) || 0;
  out.contato.id = (raw.contato && raw.contato.id != null) ? raw.contato.id : null;
  out.formaPagamento.id = (raw.formaPagamento && raw.formaPagamento.id != null) ? raw.formaPagamento.id : null;
  return out;
}

function baseContaPagar_() {
  return {
    id: null,
    situacao: null,
    vencimento: null,
    valor: 0,
    dataEmissao: null,
    vencimentoOriginal: null,
    numeroDocumento: null,
    historico: null,
    saldo: null,
    categoriaId: null,
    categoriaNome: null,
    contato: { id: null, nome: null },
    formaPagamento: { id: null, nome: null }
  };
}

/* ====================================================================================
 * Detalhe de uma conta a pagar — /contas/pagar/{id}
 * ==================================================================================== */
function fetchContaPagarDetalhe_(id) {
  var res = blingGet_('/contas/pagar/' + encodeURIComponent(id), null);
  return (res && res.data) ? res.data : null;
}

/* ====================================================================================
 * Mapa formaPagamento.id -> nome (uma chamada de listagem).
 * ==================================================================================== */
/* ────────────────────────────────────────────────────────────────────────────────────
 * MAPAS DE ENRIQUECIMENTO INCOMPLETOS
 *
 * Estes mapas nao sao o dataset — sao a tabela que traduz id -> nome. Mas quando ficam
 * incompletos (excecao apanhada pelo catch, ou teto MAX_PAGES) o efeito NAO e um campo
 * em falta: e um campo com o valor ERRADO. `resolveCategoriaNome_` devolve
 * "Sem categoria" para um id que existe e tem categoria no Bling. Isso e inventar um
 * facto, nao omiti-lo — e a UI de "Movimentos por classificar" passa a acusar titulos
 * que estao perfeitamente classificados na origem.
 *
 * Chave sentinela em MAIUSCULAS: as chaves reais sao ids numericos do Bling em string,
 * portanto nao ha colisao possivel. Nenhum sitio itera estes mapas (verificado); todos
 * fazem lookup por id. Marcar aqui evita mudar a assinatura de quatro chamadores.
 * ──────────────────────────────────────────────────────────────────────────────────── */
var MAPA_INCOMPLETO_ = 'MAPA_INCOMPLETO_';

function mapaIncompleto_(map) {
  return !!(map && map[MAPA_INCOMPLETO_]);
}

function buildFormasPagamentoMap_() {
  var map = {};
  try {
    var pagina = 1;
    var paginasLidas = 0;
    var ultimoLote = 0;
    while (pagina <= MAX_PAGES) {
      var res = blingGet_('/formas-pagamentos', { pagina: pagina, limite: PAGE_LIMIT });
      var lote = (res && res.data) ? res.data : [];
      paginasLidas++;
      ultimoLote = lote.length;
      for (var i = 0; i < lote.length; i++) {
        var f = lote[i];
        if (f && f.id != null) map[String(f.id)] = f.descricao || f.nome || null;
      }
      if (lote.length < PAGE_LIMIT) break;
      pagina++;
    }
    if (paginacaoTruncada_(paginasLidas, ultimoLote, PAGE_LIMIT, MAX_PAGES)) {
      map[MAPA_INCOMPLETO_] = true;
      safeLog_('ATENCAO: mapa de formas de pagamento TRUNCADO no teto MAX_PAGES.');
    }
  } catch (e) {
    map[MAPA_INCOMPLETO_] = true;
    safeLog_('Aviso: nao foi possivel listar formas de pagamento (' + (e && e.message ? e.message : e) + '). Usando fallback.');
  }
  return map;
}

/* ====================================================================================
 * Resolve contato.id -> nome via /contatos/{id}, com cache passado por referencia.
 * ==================================================================================== */
/* ====================================================================================
 * Mapa categoriaId -> descricao (uma listagem de /categorias/receitas-despesas).
 * ==================================================================================== */
function buildCategoriasMap_() {
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
      safeLog_('ATENCAO: mapa de categorias TRUNCADO no teto MAX_PAGES. Titulos classificados ' +
        'na origem podem aparecer como "Sem categoria".');
    }
  } catch (e) {
    map[MAPA_INCOMPLETO_] = true;
    safeLog_('Aviso: nao foi possivel listar categorias (' + (e && e.message ? e.message : e) + '). Tudo ficara Sem categoria.');
  }
  return map;
}

/* Resolve o nome da categoria. id 0/nulo/ausente no mapa => Sem categoria. */
function resolveCategoriaNome_(categoriaId, categoriasMap) {
  if (categoriaId == null || Number(categoriaId) === 0) return 'Sem categoria';
  var nome = categoriasMap[String(categoriaId)];
  return nome ? nome : 'Sem categoria';
}

/* ====================================================================================
 * Decide se um titulo reaproveitado precisa de nova tentativa de resolucao da
 * categoria. Funcao PURA (testavel sem rede).
 *
 * "Sem categoria" representa ausencia de resolucao e deve ser tentada novamente
 * num rebuild futuro. Nomes uteis sao preservados.
 * ==================================================================================== */
var CATEGORIA_NOME_AUSENTE = 'sem categoria';

function precisaResolverCategoria_(categoriaNome) {
  var atual = (categoriaNome == null) ? '' : String(categoriaNome).trim();
  if (!atual) return true;
  return atual.toLowerCase() === CATEGORIA_NOME_AUSENTE;
}

function resolverContatoNome_(id, cache) {
  if (id == null) return null;
  var key = String(id);
  if (cache[key] !== undefined) return cache[key];
  try {
    var res = blingGet_('/contatos/' + encodeURIComponent(id), null);
    var c = (res && res.data) ? res.data : null;
    cache[key] = c ? (c.nome || c.razaoSocial || c.fantasia || null) : null;
  } catch (e) {
    safeLog_('Aviso: contato ' + key + ' nao resolvido (' + (e && e.message ? e.message : e) + ').');
    cache[key] = null;
  }
  return cache[key];
}

/* ====================================================================================
 * REBUILD do snapshot de despesas — hidrata detalhe + resolve nomes. Incremental.
 * ==================================================================================== */
function rebuildDespesasSnapshot_() {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    safeLog_('Rebuild de despesas ja em andamento. Abortando.');
    return { ok: false, motivo: 'lock' };
  }

  var inicio = Date.now();
  try {
    var lista = fetchContasPagarLista_({ sondarFim: true });
    safeLog_('Rebuild despesas | titulos na listagem: ' + lista.length);

    /* TERMINACAO PREMATURA: a sonda de pagina +1 provou que ha titulos por ler.
     * ABORTAMOS SEM GRAVAR, pela mesma razao que abortamos numa listagem vazia com
     * historico por baixo — e por uma razao a mais: aqui a listagem NAO vem vazia,
     * portanto a guarda de zero deixa-a passar e o snapshot bom seria substituido por
     * uma fracao dele. Um snapshot de ontem esta velho; um snapshot truncado esta
     * errado, e so o segundo e irrecuperavel.
     *
     * Nao se marca `parcial` e grava-se: isso e o que se faz com o teto MAX_PAGES, que
     * e um limite conhecido e estavel. Uma terminacao precoce e um sintoma de falha
     * transitoria — a leitura seguinte tem tudo para correr bem, e ate la o snapshot
     * anterior serve. */
    if (lista.terminacaoPrematura) {
      safeLog_('ABORTADO: paginacao de contas a pagar terminou antes do fim (sonda de ' +
        'pagina +1 trouxe titulos). Snapshot anterior PRESERVADO (nao foi gravado nada).');
      return { ok: false, motivo: 'paginacao-terminada-cedo', totalRecolhido: lista.length };
    }

    // Mapas resolvidos uma vez (forma de pagamento e categoria).
    var formasMap = buildFormasPagamentoMap_();
    var categoriasMap = buildCategoriasMap_();

    // Cache incremental a partir do snapshot anterior:
    //  - titulos ja resolvidos (com detalhe) sao reaproveitados sem nova chamada;
    //  - nomes de contato ja conhecidos populam o cache de contatos.
    var anteriorPorId = {};
    var contatoCache = {};
    var anterior = readDespesasSnapshot_();
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
     * Ver podeGravarListagemVazia_ em Code.gs. Abortamos SEM gravar: o snapshot de
     * ontem continua a servir e o próximo rebuild tenta outra vez. */
    var totalAnteriorD = (anterior && anterior.data) ? anterior.data.length : 0;
    if (!podeGravarListagemVazia_(lista.length, totalAnteriorD)) {
      safeLog_('ABORTADO: listagem de contas a pagar veio VAZIA mas o snapshot anterior ' +
        'tem ' + totalAnteriorD + ' titulos. Snapshot anterior PRESERVADO (nao foi gravado nada).');
      return { ok: false, motivo: 'listagem-vazia-suspeita', totalAnterior: totalAnteriorD };
    }

    var data = [];
    var chamadasDetalhe = 0, hidratados = 0, reaproveitados = 0, parcial = false;

    for (var i = 0; i < lista.length; i++) {
      var raw = lista[i];
      var idStr = (raw && raw.id != null) ? String(raw.id) : null;

      // Reaproveita titulo ja hidratado (tem historico/dataEmissao do detalhe).
      if (idStr && anteriorPorId[idStr] && anteriorPorId[idStr].dataEmissao != null) {
        var reuse = anteriorPorId[idStr];
        // Atualiza situacao/valor/vencimento da listagem (podem ter mudado) e mantem o resto.
        reuse.situacao = (raw.situacao != null) ? raw.situacao : reuse.situacao;
        reuse.valor = Number(raw.valor) || reuse.valor;
        reuse.vencimento = raw.vencimento ? formatDateISO_(raw.vencimento) : reuse.vencimento;
        if (reuse.formaPagamento && reuse.formaPagamento.id != null && !reuse.formaPagamento.nome) {
          reuse.formaPagamento.nome = formasMap[String(reuse.formaPagamento.id)] || null;
        }
        if (precisaResolverCategoria_(reuse.categoriaNome)) {
          reuse.categoriaNome = resolveCategoriaNome_(reuse.categoriaId, categoriasMap);
        }
        data.push(reuse);
        reaproveitados++;
        continue;
      }

      // Orcamento de tempo: salva parcial e pede re-run.
      if (Date.now() - inicio > REBUILD_TIME_BUDGET_MS) {
        parcial = true;
        safeLog_('Orcamento de tempo atingido. Salvando snapshot PARCIAL de despesas.');
        // Os titulos restantes entram so com o basico (sem detalhe), p/ nao perder KPIs.
        data.push(normalizeContaPagarBasico_(raw));
        for (var r = i + 1; r < lista.length; r++) data.push(normalizeContaPagarBasico_(lista[r]));
        break;
      }

      var item = normalizeContaPagarBasico_(raw);

      // Detalhe (historico, dataEmissao, vencimentoOriginal, numeroDocumento, saldo, categoria.id).
      var det = fetchContaPagarDetalhe_(raw.id);
      chamadasDetalhe++;
      if (det) {
        item.dataEmissao = det.dataEmissao ? formatDateISO_(det.dataEmissao) : null;
        item.vencimentoOriginal = det.vencimentoOriginal ? formatDateISO_(det.vencimentoOriginal) : null;
        item.numeroDocumento = (det.numeroDocumento != null) ? det.numeroDocumento : null;
        item.historico = (det.historico != null) ? det.historico : null;
        item.saldo = (det.saldo != null) ? Number(det.saldo) : null;
        item.categoriaId = (det.categoria && det.categoria.id != null) ? det.categoria.id : null;
        item.categoriaNome = resolveCategoriaNome_(item.categoriaId, categoriasMap);
        // contato pode vir mais completo no detalhe.
        if (det.contato && det.contato.id != null) item.contato.id = det.contato.id;
        hidratados++;
      }

      // Resolve nome do fornecedor e da forma de pagamento.
      item.contato.nome = resolverContatoNome_(item.contato.id, contatoCache);
      if (item.formaPagamento.id != null) {
        item.formaPagamento.nome = formasMap[String(item.formaPagamento.id)] || null;
      }

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
        /* `parcial` passa a ser o AGREGADO pessimista dos dois eixos de truncamento:
         * tempo (orcamento de execucao) e paginacao (teto MAX_PAGES). Ate aqui,
         * `listagemTruncada` era emitido mas NAO entrava em `parcial` — e `parcial` e o
         * unico campo que o frontend le. Uma listagem truncada chegava a aplicacao
         * declarada COMPLETA. Ver docs/SOURCE_COVERAGE_CONTRACT.md.
         *
         * `enriquecimentoIncompleto` entra tambem porque o seu efeito e um valor ERRADO
         * ("Sem categoria" para um titulo classificado), nao um valor em falta — ver
         * MAPA_INCOMPLETO_. Nao ha juizo de materialidade aqui: a escalada e sempre na
         * direcao segura (menos afirmacoes de completude, nunca mais). */
        enriquecimentoIncompleto: mapaIncompleto_(categoriasMap) || mapaIncompleto_(formasMap),
        parcial: parcial || !!(lista && lista.truncado)
          || mapaIncompleto_(categoriasMap) || mapaIncompleto_(formasMap),
        /* ── CAMPOS ADITIVOS (nenhum campo acima mudou) ────────────────────────────
         * `paginasLidas` / `listagemTruncada`: completude do REBUILD no eixo da
         *   paginacao. `parcial` ja dizia se o orcamento de tempo estourou; nao dizia
         *   se a listagem bateu no teto de MAX_PAGES — sao dois truncamentos
         *   diferentes e ate agora um deles era invisivel.
         * `filtroData`: a listagem de /contas/pagar NAO usa filtro de data nenhum.
         *   Declara-lo explicitamente evita que alguem a jusante assuma um intervalo
         *   pedido que nunca existiu.
         * `intervalos`: o RANGE das datas presentes. NAO e cobertura contabilistica —
         *   ver intervalosDeDatas_ e docs/SOURCE_COVERAGE_CONTRACT.md. */
        paginasLidas: (lista && lista.paginasLidas) || null,
        listagemTruncada: (lista && lista.truncado) || false,
        filtroData: null,
        intervalos: intervalosDeDatas_(data)
      }
    };
    saveDespesasSnapshot_(snapshot);

    var ms = Date.now() - inicio;
    safeLog_('Rebuild despesas concluido' + (parcial ? ' (PARCIAL)' : '') + '.');
    safeLog_('Titulos: ' + data.length + ' | hidratados agora: ' + hidratados +
      ' | reaproveitados: ' + reaproveitados + ' | chamadas detalhe: ' + chamadasDetalhe);
    safeLog_('Tempo aprox.: ' + Math.round(ms / 1000) + 's | tamanho ~' +
      Math.round(JSON.stringify(snapshot).length / 1024) + ' KB');
    if (parcial) safeLog_('PARCIAL: rode runRebuildDespesasSnapshot novamente para continuar.');

    return { ok: true, parcial: parcial, hidratados: hidratados, reaproveitados: reaproveitados };
  } finally {
    lock.releaseLock();
  }
}

/* ====================================================================================
 * Snapshot no Drive (arquivo separado do de pedidos).
 * ==================================================================================== */
function readDespesasSnapshot_() {
  var file = findDespesasSnapshotFile_();
  if (!file) return null;
  try {
    return JSON.parse(file.getBlob().getDataAsString());
  } catch (e) {
    safeLog_('Snapshot de despesas ilegivel (JSON invalido).');
    return null;
  }
}

function findDespesasSnapshotFile_() {
  var it = DriveApp.getFilesByName(DESPESAS_SNAPSHOT_FILE_NAME);
  return it.hasNext() ? it.next() : null;
}

function getOrCreateDespesasSnapshotFile_() {
  var file = findDespesasSnapshotFile_();
  if (file) return file;
  return DriveApp.createFile(DESPESAS_SNAPSHOT_FILE_NAME, '{"data":[]}', 'application/json');
}

function saveDespesasSnapshot_(obj) {
  var file = getOrCreateDespesasSnapshotFile_();
  file.setContent(JSON.stringify(obj));
}

/* ---- Wrappers SEM underline (rodar pelo editor) ---- */

function runRebuildDespesasSnapshot() {
  return rebuildDespesasSnapshot_();
}

function runReadDespesasSnapshotTest() {
  var s = readDespesasSnapshot_();
  if (!s) { safeLog_('Snapshot de despesas inexistente (null).'); return; }
  safeLog_('Snapshot de despesas lido. Titulos: ' + (s.data ? s.data.length : 0));
  if (s.meta) {
    safeLog_('Meta -> gerado ' + s.meta.geradoEm +
      ' | hidratados ' + s.meta.hidratadosNestaExecucao +
      ' | reaproveitados ' + s.meta.reaproveitados +
      ' | parcial ' + s.meta.parcial);
  }
}


/****************************************************************************************
 * Gatilho diário (instalação MANUAL e idempotente).
 * Executar UMA vez no editor: installDailyDespesasSnapshotTrigger()
 *
 * Espelha installDailyPedidosSnapshotTrigger de Código.gs. Idempotente por construção:
 * remove TODOS os gatilhos já existentes para runRebuildDespesasSnapshot antes de criar
 * um novo, pelo que correr a função repetidamente nunca acumula gatilhos.
 *
 * Hora escalonada (~02:00) para os três rebuilds não competirem: todos usam o
 * mesmo LockService, e o Apps Script dispara gatilhos horários dentro de uma JANELA de
 * cerca de uma hora — não ao minuto exato. Se por acaso dois se cruzarem, o segundo não
 * corrompe nada: falha a obter o lock e recupera na execução seguinte.
 ****************************************************************************************/
function installDailyDespesasSnapshotTrigger() {
  var alvo = 'runRebuildDespesasSnapshot';
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
    .atHour(2)
    .nearMinute(0)
    .everyDays(1)
    .inTimezone(SNAPSHOT_TIMEZONE)
    .create();

  safeLog_('Gatilho diario instalado para ' + alvo + ' (~02:00 ' + SNAPSHOT_TIMEZONE + ').');
  safeLog_('Gatilhos duplicados removidos: ' + removidos);
  return { ok: true, removidos: removidos };
}

function listDespesasSnapshotTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  var n = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'runRebuildDespesasSnapshot') n++;
  }
  safeLog_('Gatilhos de runRebuildDespesasSnapshot: ' + n);
  return n;
}
