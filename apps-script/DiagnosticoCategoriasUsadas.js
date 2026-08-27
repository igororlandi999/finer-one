/****************************************************************************************
 * DiagnosticoCategoriasUsadas.gs — READ-ONLY (Finer One / Despesas) — Microfase 5A
 * --------------------------------------------------------------------------------------
 * OBJECTIVO
 *   Produzir o INVENTÁRIO das categorias REALMENTE UTILIZADAS nos títulos do snapshot
 *   de contas a pagar, enriquecido com a estrutura do catálogo do Bling
 *   (idCategoriaPai, idGrupoDre, tipo).
 *
 *   O denominador desta análise são as categorias PRESENTES NOS TÍTULOS — nunca as 64
 *   categorias do catálogo. O catálogo entra apenas como fonte de enriquecimento e é
 *   impresso na íntegra, sem corte de linhas, por pedido explícito.
 *
 * GARANTIA DE READ-ONLY — o que este ficheiro NÃO faz:
 *   - NÃO corre rebuild (não chama rebuildDespesasSnapshot_ nem nada equivalente).
 *   - NÃO escreve no Drive (não chama saveDespesasSnapshot_, DriveApp.createFile,
 *     file.setContent, nem getOrCreateDespesasSnapshotFile_).
 *   - NÃO altera PropertiesService (não lê nem escreve propriedades).
 *   - NÃO usa LockService.
 *   - NÃO altera nenhum objecto do snapshot em memória (só lê campos).
 *   - NÃO altera classifyPayable, dreEngine, blingDataService, DespesasBackend.gs,
 *     RecebiveisBackend.gs, frontend ou qualquer ficheiro de produção.
 *   - NÃO faz deploy, commit ou push.
 *
 *   As ÚNICAS operações de rede são GET, e uma só rota: /categorias/receitas-despesas.
 *   NÃO consulta /contas/pagar (nem listagem nem detalhe): o snapshot já tem tudo o que
 *   é preciso, e chamar detalhe transformaria um diagnóstico num rebuild disfarçado.
 *
 * O QUE ESTE FICHEIRO DELIBERADAMENTE NÃO FAZ (por decisão da microfase 5A):
 *   NÃO replica classifyPayable. A classificação por grupo da DRE continua a ter UMA
 *   única implementação, em src/utils/dreEngine.js. Este diagnóstico produz apenas o
 *   inventário; a aplicação do classificador real faz-se noutro sítio, sobre esta saída.
 *
 * DUAS REGRAS SÃO INEVITAVELMENTE REPLICADAS AQUI — declaradas para não passarem
 * despercebidas numa revisão futura:
 *   1) "cancelado" = situacao 5 (contrato do projecto: PAYABLE cancelado nunca conta).
 *      Necessária para a coluna valorNaoCancelado, pedida no requisito 3.
 *   2) prioridade da data de competência: competencia > vencimentoOriginal > vencimento
 *      > dataEmissao (mesma ordem documentada em dreEngine.payableCompetenceDate).
 *      Necessária para a coluna "meses".
 *   Ambas são cópias de LEITURA para relatório. Se alguma delas divergir do motor no
 *   futuro, é este ficheiro de diagnóstico que está errado, nunca o motor.
 *
 * NOTA DE FUSO HORÁRIO (lição da Fase 1B):
 *   O mês de competência é extraído por TEXTO a partir de "YYYY-MM-DD". Nunca por
 *   new Date(...), que interpretaria a data como meia-noite UTC e recuaria um dia em
 *   São Paulo (UTC-3), atirando os títulos do dia 1 para o mês anterior.
 *
 * Reutiliza, sem os alterar: safeLog_, blingGet_, readDespesasSnapshot_,
 * e as constantes PAGE_LIMIT / MAX_PAGES (com fallback defensivo).
 *
 * FUNÇÃO A EXECUTAR: runDiagnosticarCategoriasUsadas
 ****************************************************************************************/

/* Separador das linhas colável. Não mudar sem avisar quem consome a saída. */
var DIAG_CU_SEP = ' | ';

/* Contrato do projecto: só a situação 5 (cancelado) sai dos totais. */
var DIAG_CU_SITUACAO_CANCELADO = 5;

/* Limites de paginação: usa os globais do Code.gs se existirem. */
function diagCuPageLimit_() {
  return (typeof PAGE_LIMIT !== 'undefined' && PAGE_LIMIT) ? PAGE_LIMIT : 100;
}
function diagCuMaxPages_() {
  return (typeof MAX_PAGES !== 'undefined' && MAX_PAGES) ? MAX_PAGES : 20;
}

/* ------------------------------------------------------------------------------------
 * Helpers puros (sem rede, sem escrita).
 * ---------------------------------------------------------------------------------- */

/* Cancelado? Tolera situacao numérica, string ou objecto {id: n}. */
function diagCuEhCancelado_(titulo) {
  if (!titulo) return false;
  var s = titulo.situacao;
  var codigo = (s !== null && typeof s === 'object') ? s.id : s;
  return Number(codigo) === DIAG_CU_SITUACAO_CANCELADO;
}

/* Data de competência do título, pela prioridade documentada no dreEngine. */
function diagCuDataCompetencia_(titulo) {
  if (!titulo) return null;
  if (titulo.competencia) return titulo.competencia;
  if (titulo.vencimentoOriginal) return titulo.vencimentoOriginal;
  if (titulo.vencimento) return titulo.vencimento;
  if (titulo.dataEmissao) return titulo.dataEmissao;
  return null;
}

/* "YYYY-MM" a partir de uma data ISO, POR TEXTO (nunca new Date — ver nota de fuso). */
function diagCuMesDe_(valor) {
  if (valor == null) return null;
  var s = String(valor);
  var m = s.match(/^(\d{4})-(\d{2})/);
  return m ? (m[1] + '-' + m[2]) : null;
}

/* Chave de agrupamento. categoriaId ausente e 0 são estados DIFERENTES e ficam separados. */
function diagCuChaveCategoria_(categoriaId) {
  if (categoriaId == null || categoriaId === '') return 'NULL';
  var n = Number(categoriaId);
  if (isNaN(n)) return 'INVALIDO:' + String(categoriaId);
  return String(n);
}

/* Formatação monetária estável para o log (ponto decimal, 2 casas, sem locale). */
function diagCuMoeda_(n) {
  var v = Number(n) || 0;
  return v.toFixed(2);
}

/* Campo vazio no log — nunca inventar valor. */
function diagCuOuTraco_(v) {
  return (v == null || v === '') ? '-' : String(v);
}

/* ------------------------------------------------------------------------------------
 * Catálogo: UMA leitura de /categorias/receitas-despesas, preservando TODOS os campos.
 *
 * Deliberadamente NÃO reutiliza buildCategoriasMap_ do DespesasBackend.gs: essa função
 * guarda apenas id -> descricao e descarta idCategoriaPai, idGrupoDre e tipo, que são
 * precisamente o objecto desta auditoria. Alterá-la seria mexer em produção.
 * ---------------------------------------------------------------------------------- */
function diagCuLerCatalogoCompleto_() {
  var catalogo = {};   // id (string) -> { id, descricao, idCategoriaPai, idGrupoDre, tipo }
  var ordem = [];      // ids pela ordem em que o Bling devolveu
  var paginas = 0;
  var limite = diagCuPageLimit_();

  try {
    var pagina = 1;
    while (pagina <= diagCuMaxPages_()) {
      var res = blingGet_('/categorias/receitas-despesas', { pagina: pagina, limite: limite });
      var lote = (res && res.data) ? res.data : [];
      paginas++;
      for (var i = 0; i < lote.length; i++) {
        var c = lote[i];
        if (!c || c.id == null) continue;
        var chave = String(c.id);
        if (catalogo[chave]) continue; // defensivo contra duplicados entre páginas
        catalogo[chave] = {
          id: c.id,
          descricao: (c.descricao != null) ? c.descricao : ((c.nome != null) ? c.nome : null),
          idCategoriaPai: (c.idCategoriaPai != null) ? c.idCategoriaPai : null,
          idGrupoDre: (c.idGrupoDre != null) ? c.idGrupoDre : null,
          tipo: (c.tipo != null) ? c.tipo : null
        };
        ordem.push(chave);
      }
      if (lote.length < limite) break;
      pagina++;
    }
  } catch (e) {
    safeLog_('AVISO: catalogo de categorias nao lido (' + ((e && e.message) ? e.message : e) + ').');
    safeLog_('AVISO: as colunas idCategoriaPai / idGrupoDre / tipo sairao como "-".');
  }

  return { mapa: catalogo, ordem: ordem, paginas: paginas };
}

/* ------------------------------------------------------------------------------------
 * DIAGNÓSTICO PRINCIPAL
 * ---------------------------------------------------------------------------------- */
function runDiagnosticarCategoriasUsadas() {
  safeLog_('=========================================================');
  safeLog_('DIAGNOSTICO 5A — categorias REALMENTE USADAS nos titulos');
  safeLog_('READ-ONLY: nao escreve, nao faz rebuild, nao corrige nada.');
  safeLog_('Rede: apenas GET /categorias/receitas-despesas.');
  safeLog_('NAO replica classifyPayable (uma so implementacao, no dreEngine).');
  safeLog_('=========================================================');

  // ── 0) Snapshot ───────────────────────────────────────────
  var snap = readDespesasSnapshot_();
  if (!snap || !snap.data) {
    safeLog_('Snapshot de despesas inexistente ou ilegivel. Nada a inventariar.');
    return null;
  }
  var titulos = snap.data;
  safeLog_('');
  safeLog_('--- 0) Snapshot ---');
  safeLog_('titulos no snapshot: ' + titulos.length);
  if (snap.meta) {
    safeLog_('meta -> gerado ' + snap.meta.geradoEm +
             ' | total ' + snap.meta.totalTitulos +
             ' | hidratados ' + snap.meta.hidratadosNestaExecucao +
             ' | reaproveitados ' + snap.meta.reaproveitados +
             ' | parcial ' + snap.meta.parcial);
    if (snap.meta.parcial) {
      safeLog_('ATENCAO: snapshot PARCIAL. Os titulos nao hidratados nao tem categoriaId,');
      safeLog_('logo aparecerao agrupados em "categoriaId ausente" e o inventario e incompleto.');
    }
  }

  // ── 1) Catálogo completo ──────────────────────────────────
  var cat = diagCuLerCatalogoCompleto_();
  var catalogo = cat.mapa;
  var idsCatalogo = cat.ordem;

  safeLog_('');
  safeLog_('=========================================================');
  safeLog_('SECCAO 1 — CATALOGO COMPLETO (' + idsCatalogo.length + ' categorias, ' +
           cat.paginas + ' pagina(s), SEM corte de linhas)');
  safeLog_('=========================================================');
  safeLog_('id' + DIAG_CU_SEP + 'descricao' + DIAG_CU_SEP + 'tipo' +
           DIAG_CU_SEP + 'idCategoriaPai' + DIAG_CU_SEP + 'idGrupoDre');

  // Ordenação numérica por id, para a hierarquia ficar legível.
  var idsOrdenados = idsCatalogo.slice().sort(function (a, b) { return Number(a) - Number(b); });
  for (var ci = 0; ci < idsOrdenados.length; ci++) {
    var c = catalogo[idsOrdenados[ci]];
    safeLog_(
      c.id + DIAG_CU_SEP +
      diagCuOuTraco_(c.descricao) + DIAG_CU_SEP +
      diagCuOuTraco_(c.tipo) + DIAG_CU_SEP +
      diagCuOuTraco_(c.idCategoriaPai) + DIAG_CU_SEP +
      diagCuOuTraco_(c.idGrupoDre)
    );
  }
  if (idsOrdenados.length === 0) {
    safeLog_('(catalogo vazio nesta execucao — ver AVISO acima)');
  }

  // ── 2) Agrupamento dos títulos por categoriaId ────────────
  var grupos = {};         // chave -> agregado
  var ordemGrupos = [];    // chaves pela ordem de aparecimento
  var totalFinanceiro = 0;
  var totalNaoCancelado = 0;
  var titulosCancelados = 0;
  var titulosSemData = 0;

  for (var t = 0; t < titulos.length; t++) {
    var titulo = titulos[t];
    if (!titulo) continue;

    var chave = diagCuChaveCategoria_(titulo.categoriaId);
    if (!grupos[chave]) {
      grupos[chave] = {
        chave: chave,
        categoriaIdBruto: (titulo.categoriaId === undefined) ? null : titulo.categoriaId,
        categoriaNome: null,
        qtd: 0,
        valorTotal: 0,
        valorNaoCancelado: 0,
        qtdCancelados: 0,
        meses: {},
        semData: 0
      };
      ordemGrupos.push(chave);
    }
    var g = grupos[chave];

    // Primeiro nome não vazio encontrado no snapshot (informativo; a verdade vem do catálogo).
    if (!g.categoriaNome && titulo.categoriaNome) g.categoriaNome = titulo.categoriaNome;

    var valor = Number(titulo.valor) || 0;
    var cancelado = diagCuEhCancelado_(titulo);

    g.qtd++;
    g.valorTotal += valor;
    totalFinanceiro += valor;
    if (cancelado) {
      g.qtdCancelados++;
      titulosCancelados++;
    } else {
      g.valorNaoCancelado += valor;
      totalNaoCancelado += valor;
    }

    var mes = diagCuMesDe_(diagCuDataCompetencia_(titulo));
    if (mes) {
      g.meses[mes] = true;
    } else {
      g.semData++;
      titulosSemData++;
    }
  }

  // ── 3) Secção das categorias realmente usadas ─────────────
  // Ordem: por valorTotal descendente. As linhas especiais (id 0 / ausente / inválido)
  // saem no fim, isoladas, para não se confundirem com categorias reais.
  var chavesNormais = [];
  var chaveZero = null;
  var chaveNull = null;
  var chavesInvalidas = [];

  for (var k = 0; k < ordemGrupos.length; k++) {
    var ch = ordemGrupos[k];
    if (ch === 'NULL') chaveNull = ch;
    else if (ch === '0') chaveZero = ch;
    else if (ch.indexOf('INVALIDO:') === 0) chavesInvalidas.push(ch);
    else chavesNormais.push(ch);
  }
  chavesNormais.sort(function (a, b) { return grupos[b].valorTotal - grupos[a].valorTotal; });

  safeLog_('');
  safeLog_('=========================================================');
  safeLog_('SECCAO 2 — CATEGORIAS REALMENTE USADAS NOS TITULOS');
  safeLog_('Ordenadas por valorTotal desc. Denominador = os titulos, nao o catalogo.');
  safeLog_('=========================================================');
  safeLog_('categoriaId' + DIAG_CU_SEP + 'categoriaNome' + DIAG_CU_SEP + 'qtd' +
           DIAG_CU_SEP + 'valorTotal' + DIAG_CU_SEP + 'valorNaoCancelado' +
           DIAG_CU_SEP + 'meses' + DIAG_CU_SEP + 'idCategoriaPai' +
           DIAG_CU_SEP + 'idGrupoDre' + DIAG_CU_SEP + 'tipo');

  var paisDistintos = {};
  var gruposDreDistintos = {};
  var categoriasForaDoCatalogo = 0;

  function imprimirGrupo_(ch, rotuloForcado, enriquecer) {
    var g = grupos[ch];
    if (!g) return;

    var meses = [];
    for (var m in g.meses) { if (g.meses.hasOwnProperty(m)) meses.push(m); }
    meses.sort();
    var mesesTxt = meses.length ? meses.join(',') : '-';
    if (g.semData > 0) mesesTxt += (meses.length ? ',' : '') + 'SEM_DATA:' + g.semData;

    var info = null;
    if (enriquecer) {
      info = catalogo[String(Number(g.categoriaIdBruto))] || null;
      if (!info) categoriasForaDoCatalogo++;
      if (info) {
        if (info.idCategoriaPai != null) paisDistintos[String(info.idCategoriaPai)] = true;
        if (info.idGrupoDre != null) gruposDreDistintos[String(info.idGrupoDre)] = true;
      }
    }

    var nome = rotuloForcado
      ? rotuloForcado
      : ((info && info.descricao) ? info.descricao : diagCuOuTraco_(g.categoriaNome));

    var idTxt = rotuloForcado
      ? (ch === '0' ? '0' : (ch === 'NULL' ? 'ausente' : ch))
      : String(g.categoriaIdBruto);

    safeLog_(
      idTxt + DIAG_CU_SEP +
      nome + DIAG_CU_SEP +
      g.qtd + DIAG_CU_SEP +
      diagCuMoeda_(g.valorTotal) + DIAG_CU_SEP +
      diagCuMoeda_(g.valorNaoCancelado) + DIAG_CU_SEP +
      mesesTxt + DIAG_CU_SEP +
      (info ? diagCuOuTraco_(info.idCategoriaPai) : '-') + DIAG_CU_SEP +
      (info ? diagCuOuTraco_(info.idGrupoDre) : '-') + DIAG_CU_SEP +
      (info ? diagCuOuTraco_(info.tipo) : '-')
    );

    // Divergência entre o nome gravado no snapshot e o nome actual no catálogo.
    if (info && g.categoriaNome && info.descricao && g.categoriaNome !== info.descricao) {
      safeLog_('    NOTA: nome no snapshot ("' + g.categoriaNome +
               '") difere do catalogo ("' + info.descricao + '").');
    }
  }

  for (var n = 0; n < chavesNormais.length; n++) {
    imprimirGrupo_(chavesNormais[n], null, true);
  }

  // Linhas especiais, isoladas. Nunca recebem grupo DRE inventado.
  if (chaveZero || chaveNull || chavesInvalidas.length) {
    safeLog_('');
    safeLog_('--- linhas especiais (sem categoria atribuida no ERP) ---');
  }
  if (chaveZero) imprimirGrupo_(chaveZero, 'SEM CATEGORIA ERP (categoriaId = 0)', false);
  if (chaveNull) imprimirGrupo_(chaveNull, 'SEM CATEGORIA ERP (categoriaId ausente)', false);
  for (var iv = 0; iv < chavesInvalidas.length; iv++) {
    imprimirGrupo_(chavesInvalidas[iv], 'CATEGORIA ID INVALIDO', false);
  }

  // ── 4) Resumo final ───────────────────────────────────────
  var semCategoriaQtd = 0;
  var semCategoriaValor = 0;
  if (chaveZero) { semCategoriaQtd += grupos[chaveZero].qtd; semCategoriaValor += grupos[chaveZero].valorTotal; }
  if (chaveNull) { semCategoriaQtd += grupos[chaveNull].qtd; semCategoriaValor += grupos[chaveNull].valorTotal; }

  var nPais = 0; for (var p in paisDistintos) { if (paisDistintos.hasOwnProperty(p)) nPais++; }
  var nGrupos = 0; for (var q in gruposDreDistintos) { if (gruposDreDistintos.hasOwnProperty(q)) nGrupos++; }

  var listaPais = []; for (var p2 in paisDistintos) { if (paisDistintos.hasOwnProperty(p2)) listaPais.push(p2); }
  var listaGrupos = []; for (var q2 in gruposDreDistintos) { if (gruposDreDistintos.hasOwnProperty(q2)) listaGrupos.push(q2); }
  listaPais.sort(function (a, b) { return Number(a) - Number(b); });
  listaGrupos.sort(function (a, b) { return Number(a) - Number(b); });

  safeLog_('');
  safeLog_('================== RESUMO FINAL ==================');
  safeLog_('totalTitulos                  : ' + titulos.length);
  safeLog_('totalFinanceiro               : ' + diagCuMoeda_(totalFinanceiro));
  safeLog_('totalNaoCancelado             : ' + diagCuMoeda_(totalNaoCancelado));
  safeLog_('categoriasDistintasUsadas     : ' + chavesNormais.length);
  safeLog_('titulosSemCategoriaERP        : ' + semCategoriaQtd);
  safeLog_('valorSemCategoriaERP          : ' + diagCuMoeda_(semCategoriaValor));
  safeLog_('categoriasPaiDistintas        : ' + nPais + (nPais ? ('  -> ' + listaPais.join(',')) : ''));
  safeLog_('gruposDreDistintosEncontrados : ' + nGrupos + (nGrupos ? ('  -> ' + listaGrupos.join(',')) : ''));
  safeLog_('--- contexto (nao pedido, mas necessario para ler os numeros) ---');
  safeLog_('titulosCancelados             : ' + titulosCancelados);
  safeLog_('titulosSemDataDeCompetencia   : ' + titulosSemData);
  safeLog_('categoriasUsadasForaDoCatalogo: ' + categoriasForaDoCatalogo);
  safeLog_('totalCategoriasNoCatalogo     : ' + idsOrdenados.length);
  safeLog_('==================================================');
  safeLog_('LEMBRETE: este diagnostico NAO classifica nada. Nenhum grupo da DRE foi');
  safeLog_('atribuido aqui. classifyPayable continua a existir num unico sitio.');
  safeLog_('==================================================');

  return {
    totalTitulos: titulos.length,
    totalFinanceiro: Number(totalFinanceiro.toFixed(2)),
    totalNaoCancelado: Number(totalNaoCancelado.toFixed(2)),
    categoriasDistintasUsadas: chavesNormais.length,
    titulosSemCategoriaERP: semCategoriaQtd,
    valorSemCategoriaERP: Number(semCategoriaValor.toFixed(2)),
    categoriasPaiDistintas: nPais,
    gruposDreDistintosEncontrados: nGrupos,
    titulosCancelados: titulosCancelados,
    titulosSemDataDeCompetencia: titulosSemData,
    categoriasUsadasForaDoCatalogo: categoriasForaDoCatalogo,
    totalCategoriasNoCatalogo: idsOrdenados.length
  };
}