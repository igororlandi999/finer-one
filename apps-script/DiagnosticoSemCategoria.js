/****************************************************************************************
 * DiagnosticoSemCategoria.gs — READ-ONLY (Finer One / Despesas)
 * --------------------------------------------------------------------------------------
 * Identifica, um a um, os títulos do snapshot que continuam com
 *   categoriaNome === "Sem categoria"
 * e separa a causa em três hipóteses mutuamente exclusivas:
 *
 *   A) categoriaId null ou 0        -> o título não tem categoria atribuída no ERP.
 *                                      Não é defeito nosso; "Sem categoria" é a verdade.
 *   B) categoriaId > 0 E no mapa    -> o catálogo resolve este id, mas o snapshot ficou
 *                                      desatualizado. Aí sim há problema de cache.
 *   C) categoriaId > 0 e FORA do mapa -> o catálogo devolvido não cobre este id
 *                                      (paginação, filtro de tipo/situação, ou categoria
 *                                      inativa/apagada no Bling).
 *
 * NÃO escreve no Drive. NÃO corre rebuild. NÃO altera o snapshot. NÃO corrige nada.
 * As únicas chamadas de rede são GET: o catálogo de categorias e, opcionalmente,
 * o detalhe de contas a pagar dos títulos em causa (para comparar com o snapshot).
 *
 * Reutiliza, sem os alterar: safeLog_, buildCategoriasMap_, resolveCategoriaNome_,
 * fetchContaPagarDetalhe_, readDespesasSnapshot_, DETAIL_THROTTLE_MS.
 *
 * Função a executar: runDiagnosticarSemCategoria
 ****************************************************************************************/

// Consultar /contas/pagar/{id} para comparar o snapshot com o estado atual no Bling.
// É um GET; continua read-only. Passe a false para um diagnóstico sem rede de detalhe.
var DIAG_SC_CONSULTAR_DETALHE = true;
// Teto de chamadas de detalhe, para o diagnóstico nunca virar um rebuild disfarçado.
var DIAG_SC_MAX_DETALHES = 25;

/* Mesma noção de "ausente" usada no rebuild, replicada aqui para o diagnóstico não
 * depender da ordem de carregamento dos ficheiros nem alterar o backend. */
function diagScEhSemCategoria_(nome) {
  var atual = (nome == null) ? '' : String(nome).trim();
  return atual.toLowerCase() === 'sem categoria';
}

/* Classifica o categoriaId gravado: 'null' | 'zero' | 'positivo' | 'invalido'. */
function diagScTipoDeId_(categoriaId) {
  if (categoriaId == null || categoriaId === '') return 'null';
  var n = Number(categoriaId);
  if (isNaN(n)) return 'invalido';
  if (n === 0) return 'zero';
  return n > 0 ? 'positivo' : 'invalido';
}

function runDiagnosticarSemCategoria() {
  safeLog_('=========================================================');
  safeLog_('DIAGNOSTICO — titulos com categoriaNome "Sem categoria"');
  safeLog_('READ-ONLY: nao escreve, nao faz rebuild, nao corrige.');
  safeLog_('=========================================================');

  var snap = readDespesasSnapshot_();
  if (!snap || !snap.data) {
    safeLog_('Snapshot inexistente ou ilegivel. Nada a diagnosticar.');
    return null;
  }
  var titulos = snap.data;
  safeLog_('Titulos no snapshot: ' + titulos.length);
  if (snap.meta) {
    safeLog_('meta -> gerado ' + snap.meta.geradoEm +
             ' | parcial ' + snap.meta.parcial +
             ' | reaproveitados ' + snap.meta.reaproveitados);
  }

  // ── 1) Panorama de categoriaId em TODO o snapshot ─────────
  // O contador antigo usava `categoriaId != null`, que conta 0 como preenchido.
  // Aqui os três estados ficam separados.
  var geral = { idNull: 0, idZero: 0, idPositivo: 0, idInvalido: 0 };
  for (var g = 0; g < titulos.length; g++) {
    var tipoG = diagScTipoDeId_(titulos[g] && titulos[g].categoriaId);
    if (tipoG === 'null') geral.idNull++;
    else if (tipoG === 'zero') geral.idZero++;
    else if (tipoG === 'positivo') geral.idPositivo++;
    else geral.idInvalido++;
  }
  safeLog_('');
  safeLog_('--- 1) categoriaId em todo o snapshot (0 separado de null) ---');
  safeLog_('categoriaId null    : ' + geral.idNull);
  safeLog_('categoriaId zero    : ' + geral.idZero);
  safeLog_('categoriaId positivo: ' + geral.idPositivo);
  if (geral.idInvalido) safeLog_('categoriaId invalido: ' + geral.idInvalido);

  // ── 2) Catálogo ───────────────────────────────────────────
  var categoriasMap = buildCategoriasMap_();
  var totalCategorias = Object.keys(categoriasMap).length;
  safeLog_('');
  safeLog_('--- 2) Catalogo ---');
  safeLog_('totalCategorias no mapa: ' + totalCategorias);
  if (totalCategorias === 0) {
    safeLog_('ATENCAO: mapa vazio nesta execucao. Todo o caso C abaixo e inconclusivo.');
  }

  // ── 3) Os títulos em causa, um a um ───────────────────────
  var alvo = [];
  for (var i = 0; i < titulos.length; i++) {
    if (titulos[i] && diagScEhSemCategoria_(titulos[i].categoriaNome)) alvo.push(titulos[i]);
  }

  var res = {
    totalSemCategoria: alvo.length,
    categoriaIdNull: 0,
    categoriaIdZero: 0,
    categoriaIdPositivo: 0,
    idPositivoEncontradoNoMapa: 0,
    idPositivoNaoEncontradoNoMapa: 0,
    casoA: 0, casoB: 0, casoC: 0, casoInvalido: 0,
    detalheDivergente: 0, detalheConsultado: 0,
  };

  safeLog_('');
  safeLog_('--- 3) Titulos com "Sem categoria" (' + alvo.length + ') ---');
  if (alvo.length === 0) {
    safeLog_('Nenhum. Todos os titulos do snapshot tem categoria resolvida.');
  }

  var detalhesFeitos = 0;

  for (var k = 0; k < alvo.length; k++) {
    var t = alvo[k];
    var catId = t.categoriaId;
    var tipo = diagScTipoDeId_(catId);
    var ehNull = (tipo === 'null');
    var ehZero = (tipo === 'zero');
    var ehPositivo = (tipo === 'positivo');

    var noMapa = false;
    if (ehPositivo) {
      noMapa = Object.prototype.hasOwnProperty.call(categoriasMap, String(Number(catId)));
    }

    var caso;
    if (ehNull || ehZero) caso = 'A';
    else if (ehPositivo && noMapa) caso = 'B';
    else if (ehPositivo && !noMapa) caso = 'C';
    else caso = 'INVALIDO';

    if (ehNull) res.categoriaIdNull++;
    if (ehZero) res.categoriaIdZero++;
    if (ehPositivo) {
      res.categoriaIdPositivo++;
      if (noMapa) res.idPositivoEncontradoNoMapa++; else res.idPositivoNaoEncontradoNoMapa++;
    }
    if (caso === 'A') res.casoA++;
    else if (caso === 'B') res.casoB++;
    else if (caso === 'C') res.casoC++;
    else res.casoInvalido++;

    safeLog_('');
    safeLog_('  [' + (k + 1) + '/' + alvo.length + '] titulo.id = ' + t.id + '   -> CASO ' + caso);
    safeLog_('      categoriaId gravado : ' + JSON.stringify(catId) + ' (tipo JS: ' + (typeof catId) + ')');
    safeLog_('      e null?  ' + ehNull + '   | e 0?  ' + ehZero + '   | e > 0?  ' + ehPositivo);
    if (ehPositivo) {
      safeLog_('      existe no mapa? ' + noMapa);
      safeLog_('      resolveCategoriaNome_ devolveria: "' + resolveCategoriaNome_(catId, categoriasMap) + '"');
    } else {
      safeLog_('      resolveCategoriaNome_ devolveria: "' + resolveCategoriaNome_(catId, categoriasMap) + '"');
    }
    safeLog_('      dataEmissao : ' + t.dataEmissao);
    safeLog_('      vencimento  : ' + t.vencimento);

    // Comparação opcional com o estado ATUAL no Bling (GET, read-only).
    if (DIAG_SC_CONSULTAR_DETALHE && detalhesFeitos < DIAG_SC_MAX_DETALHES && t.id != null) {
      try {
        var det = fetchContaPagarDetalhe_(t.id);
        detalhesFeitos++;
        res.detalheConsultado++;
        var catIdAtual = (det && det.categoria && det.categoria.id != null) ? det.categoria.id : null;
        safeLog_('      categoria.id ATUAL no Bling: ' + JSON.stringify(catIdAtual));
        var iguais = (String(catIdAtual) === String(catId));
        if (!iguais) {
          res.detalheDivergente++;
          safeLog_('      DIVERGENTE do snapshot -> o snapshot esta desatualizado neste titulo.');
          safeLog_('      resolveria agora para: "' + resolveCategoriaNome_(catIdAtual, categoriasMap) + '"');
        } else {
          safeLog_('      igual ao snapshot -> o snapshot reflete o Bling.');
        }
      } catch (e) {
        safeLog_('      detalhe FALHOU: ' + ((e && e.message) ? e.message : e));
      }
      Utilities.sleep(DETAIL_THROTTLE_MS);
    }
  }

  if (DIAG_SC_CONSULTAR_DETALHE && alvo.length > DIAG_SC_MAX_DETALHES) {
    safeLog_('');
    safeLog_('NOTA: teto de ' + DIAG_SC_MAX_DETALHES + ' chamadas de detalhe atingido; ' +
             (alvo.length - DIAG_SC_MAX_DETALHES) + ' titulo(s) sem comparacao com o Bling.');
  }

  // ── 4) Resumo ─────────────────────────────────────────────
  safeLog_('');
  safeLog_('================== RESUMO FINAL ==================');
  safeLog_('totalSemCategoria             : ' + res.totalSemCategoria);
  safeLog_('categoriaIdNull               : ' + res.categoriaIdNull);
  safeLog_('categoriaIdZero               : ' + res.categoriaIdZero);
  safeLog_('categoriaIdPositivo           : ' + res.categoriaIdPositivo);
  safeLog_('idPositivoEncontradoNoMapa    : ' + res.idPositivoEncontradoNoMapa);
  safeLog_('idPositivoNaoEncontradoNoMapa : ' + res.idPositivoNaoEncontradoNoMapa);
  safeLog_('--- por hipotese ---');
  safeLog_('A) sem categoria no ERP       : ' + res.casoA);
  safeLog_('B) cache/resolucao desatualiz.: ' + res.casoB);
  safeLog_('C) catalogo nao cobre o id    : ' + res.casoC);
  if (res.casoInvalido) safeLog_('categoriaId invalido          : ' + res.casoInvalido);
  if (DIAG_SC_CONSULTAR_DETALHE) {
    safeLog_('--- comparacao com o Bling ---');
    safeLog_('detalhesConsultados           : ' + res.detalheConsultado);
    safeLog_('snapshotDivergenteDoBling     : ' + res.detalheDivergente);
  }
  safeLog_('==================================================');
  safeLog_('LEITURA: ' + diagScConclusao_(res, totalCategorias));
  safeLog_('==================================================');

  return res;
}

function diagScConclusao_(res, totalCategorias) {
  if (res.totalSemCategoria === 0) {
    return 'Nada a corrigir: todos os titulos tem categoria resolvida.';
  }
  if (res.casoB === 0 && res.casoC === 0) {
    return 'Todos os ' + res.totalSemCategoria + ' sao CASO A: sem categoria atribuida no ERP. ' +
           '"Sem categoria" e a resposta correta. Nao ha defeito de codigo a corrigir aqui — ' +
           'se incomodar, resolve-se no Bling, atribuindo categoria a esses titulos.';
  }
  if (res.casoB > 0 && res.detalheDivergente === 0) {
    return res.casoB + ' titulo(s) tem id que o catalogo resolve e mesmo assim ficaram ' +
           '"Sem categoria": ha resolucao por aplicar. Verificar se foram reaproveitados ' +
           'antes da correcao ou se o mapa estava vazio no rebuild em que entraram.';
  }
  if (res.casoC > 0 && totalCategorias === 0) {
    return 'Inconclusivo: o catalogo veio vazio nesta execucao, logo o caso C nao e fiavel. ' +
           'Repetir o diagnostico.';
  }
  if (res.casoC > 0) {
    return res.casoC + ' titulo(s) apontam para ids fora do catalogo. Provavel categoria ' +
           'inativa/apagada no Bling ou nao devolvida pela listagem (filtro de tipo/situacao). ' +
           'Verificar esses ids diretamente no Bling antes de mexer em codigo.';
  }
  return 'Ver os casos individuais acima.';
}