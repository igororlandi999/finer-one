/****************************************************************************************
 * TesteCategoriasDespesas.gs — DIAGNÓSTICO READ-ONLY (Finer One / Despesas)
 * --------------------------------------------------------------------------------------
 * Responde a uma única pergunta: por que é que as contas a pagar continuam a chegar ao
 * frontend sem categoria útil, apesar de o DespesasBackend.gs já resolver o catálogo?
 *
 * NÃO escreve no Drive. NÃO corre rebuild. NÃO altera snapshot. NÃO cria mapeamentos.
 * Apenas lê e imprime no Registo de execução.
 *
 * Reutiliza do Code.gs / DespesasBackend.gs, sem os alterar:
 *   blingGet_, safeLog_, PAGE_LIMIT, MAX_PAGES, DETAIL_THROTTLE_MS,
 *   buildCategoriasMap_, resolveCategoriaNome_, fetchContasPagarLista_,
 *   fetchContaPagarDetalhe_, readDespesasSnapshot_
 *
 * Função a executar: runDiagnosticarCategoriasDespesas
 ****************************************************************************************/

var DIAG_AMOSTRA_TITULOS = 20;   // quantos títulos inspecionar no detalhe
var DIAG_MAX_CATEGORIAS_LOG = 60; // teto de linhas id -> descricao no log

function runDiagnosticarCategoriasDespesas() {
  safeLog_('=========================================================');
  safeLog_('DIAGNOSTICO DE CATEGORIAS DE DESPESAS (read-only)');
  safeLog_('=========================================================');

  var r1 = diagChamadaCategoriasCrua_();
  var r2 = diagBuildCategoriasMap_();
  var r3 = diagAmostraTitulos_(r2.map);
  var r4 = diagSnapshotExistente_();

  safeLog_('');
  safeLog_('================== RESUMO FINAL ==================');
  safeLog_('endpointCategoriasOk        : ' + r1.ok);
  if (!r1.ok) safeLog_('endpointCategoriasErro      : ' + r1.erro);
  safeLog_('totalCategorias             : ' + r2.total);
  safeLog_('titulosTestados             : ' + r3.titulosTestados);
  safeLog_('comCategoriaId              : ' + r3.comCategoriaId);
  safeLog_('semCategoriaId              : ' + r3.semCategoriaId);
  safeLog_('categoriaEncontradaNoMapa   : ' + r3.categoriaEncontradaNoMapa);
  safeLog_('categoriaIdNaoEncontrada    : ' + r3.categoriaIdNaoEncontrada);
  safeLog_('--- snapshot atual (nao alterado) ---');
  safeLog_('snapshotTitulos             : ' + r4.total);
  safeLog_('snapshotComCategoriaNome    : ' + r4.comNome);
  safeLog_('snapshotSemCategoriaTexto   : ' + r4.semCategoriaTexto);
  safeLog_('snapshotCategoriaNomeNulo   : ' + r4.nomeNulo);
  safeLog_('snapshotComCategoriaId      : ' + r4.comId);
  safeLog_('==================================================');
  safeLog_('CONCLUSAO PROVAVEL: ' + diagConclusao_(r1, r2, r3, r4));

  return { endpoint: r1, mapa: { total: r2.total }, amostra: r3, snapshot: r4 };
}

/* ====================================================================================
 * 1) Chamada CRUA ao endpoint de categorias, SEM try/catch de conveniência.
 *
 * buildCategoriasMap_() engole qualquer exceção e devolve {} — se a chamada estiver a
 * falhar (permissão do app, endpoint, token), o rebuild continua em silêncio e todos os
 * títulos ficam "Sem categoria". Aqui a falha aparece.
 * ==================================================================================== */
function diagChamadaCategoriasCrua_() {
  safeLog_('');
  safeLog_('--- 1) Chamada crua a /categorias/receitas-despesas ---');
  try {
    var res = blingGet_('/categorias/receitas-despesas', { pagina: 1, limite: PAGE_LIMIT });
    var lote = (res && res.data) ? res.data : [];
    safeLog_('OK. Registos na pagina 1: ' + lote.length);
    if (lote.length > 0) {
      var chaves = Object.keys(lote[0]).join(', ');
      safeLog_('Campos do primeiro registo: ' + chaves);
      var temDescricao = Object.prototype.hasOwnProperty.call(lote[0], 'descricao');
      safeLog_('Tem campo "descricao"? ' + temDescricao);
      if (!temDescricao) {
        safeLog_('ATENCAO: o mapa usa c.descricao || c.nome. Se nenhum existir, tudo fica Sem categoria.');
      }
    } else {
      safeLog_('ATENCAO: a conta nao devolveu categorias. Sem catalogo, nada e resolvivel.');
    }
    return { ok: true, erro: null, primeiraPagina: lote.length };
  } catch (e) {
    var msg = (e && e.message) ? e.message : String(e);
    safeLog_('FALHOU: ' + msg);
    safeLog_('Se for HTTP 401/403, o app OAuth provavelmente nao tem o modulo');
    safeLog_('"Categorias Receitas e Despesas" autorizado no cadastro do aplicativo.');
    return { ok: false, erro: msg, primeiraPagina: 0 };
  }
}

/* ====================================================================================
 * 2) buildCategoriasMap_() tal como o rebuild o usa, e o catalogo resolvido.
 * ==================================================================================== */
function diagBuildCategoriasMap_() {
  safeLog_('');
  safeLog_('--- 2) buildCategoriasMap_() ---');
  var map = buildCategoriasMap_();
  var ids = Object.keys(map);
  safeLog_('totalCategorias: ' + ids.length);
  if (ids.length === 0) {
    safeLog_('MAPA VAZIO. resolveCategoriaNome_ devolvera "Sem categoria" para TODOS os titulos.');
    return { map: map, total: 0 };
  }

  var semNome = 0;
  var limite = Math.min(ids.length, DIAG_MAX_CATEGORIAS_LOG);
  safeLog_('Catalogo (id -> descricao), ate ' + limite + ' linhas:');
  for (var i = 0; i < ids.length; i++) {
    if (!map[ids[i]]) semNome++;
    if (i < limite) safeLog_('   ' + ids[i] + ' -> ' + map[ids[i]]);
  }
  if (ids.length > limite) safeLog_('   ... (+' + (ids.length - limite) + ' categorias nao listadas)');
  safeLog_('categoriasComDescricaoVazia: ' + semNome);
  return { map: map, total: ids.length };
}

/* ====================================================================================
 * 3) Amostra de titulos: detalhe -> categoria.id -> lookup no mapa.
 * ==================================================================================== */
function diagAmostraTitulos_(categoriasMap) {
  safeLog_('');
  safeLog_('--- 3) Amostra de ' + DIAG_AMOSTRA_TITULOS + ' contas a pagar ---');
  var out = {
    titulosTestados: 0, comCategoriaId: 0, semCategoriaId: 0,
    categoriaEncontradaNoMapa: 0, categoriaIdNaoEncontrada: 0, semObjetoCategoria: 0,
  };

  var lista;
  try {
    lista = fetchContasPagarLista_();
  } catch (e) {
    safeLog_('FALHOU a listagem de /contas/pagar: ' + ((e && e.message) ? e.message : e));
    return out;
  }
  safeLog_('Titulos na listagem: ' + lista.length);

  var n = Math.min(DIAG_AMOSTRA_TITULOS, lista.length);
  for (var i = 0; i < n; i++) {
    var id = lista[i] && lista[i].id;
    if (id == null) continue;

    var det = null;
    try {
      det = fetchContaPagarDetalhe_(id);
    } catch (e) {
      safeLog_('   titulo ' + id + ': detalhe FALHOU (' + ((e && e.message) ? e.message : e) + ')');
      out.titulosTestados++;
      Utilities.sleep(DETAIL_THROTTLE_MS);
      continue;
    }
    out.titulosTestados++;

    if (!det) {
      safeLog_('   titulo ' + id + ': detalhe vazio');
      Utilities.sleep(DETAIL_THROTTLE_MS);
      continue;
    }

    var temObjeto = Object.prototype.hasOwnProperty.call(det, 'categoria');
    if (!temObjeto) out.semObjetoCategoria++;

    var catId = (det.categoria && det.categoria.id != null) ? det.categoria.id : null;
    if (catId == null || Number(catId) === 0) {
      out.semCategoriaId++;
      safeLog_('   titulo ' + id + ': categoria.id = ' + catId +
               ' | objeto categoria presente? ' + temObjeto +
               ' -> resolvido: "' + resolveCategoriaNome_(catId, categoriasMap) + '"');
    } else {
      out.comCategoriaId++;
      var noMapa = Object.prototype.hasOwnProperty.call(categoriasMap, String(catId));
      if (noMapa) out.categoriaEncontradaNoMapa++; else out.categoriaIdNaoEncontrada++;
      safeLog_('   titulo ' + id + ': categoria.id = ' + catId +
               ' | no mapa? ' + noMapa +
               ' -> resolvido: "' + resolveCategoriaNome_(catId, categoriasMap) + '"');
    }
    Utilities.sleep(DETAIL_THROTTLE_MS);
  }

  if (out.semObjetoCategoria > 0) {
    safeLog_('NOTA: ' + out.semObjetoCategoria + ' titulo(s) sem o objeto "categoria" no detalhe.');
  }
  return out;
}

/* ====================================================================================
 * 4) O que ja esta gravado no snapshot. LEITURA APENAS.
 *
 * Hipotese a testar: o snapshot ficou "envenenado". No rebuild, o reaproveitamento faz
 *   if (!reuse.categoriaNome) reuse.categoriaNome = resolveCategoriaNome_(...)
 * e resolveCategoriaNome_ devolve a STRING "Sem categoria", que e truthy. Ou seja: um
 * titulo que uma vez ficou "Sem categoria" nunca mais e reavaliado, mesmo que o catalogo
 * passe a funcionar. Se este contador vier alto, corrigir o catalogo nao chega.
 * ==================================================================================== */
function diagSnapshotExistente_() {
  safeLog_('');
  safeLog_('--- 4) Snapshot de despesas ja gravado (leitura) ---');
  var out = { total: 0, comNome: 0, semCategoriaTexto: 0, nomeNulo: 0, comId: 0 };

  var snap = readDespesasSnapshot_();
  if (!snap || !snap.data) {
    safeLog_('Snapshot inexistente ou ilegivel.');
    return out;
  }

  var amostraIds = [];
  for (var i = 0; i < snap.data.length; i++) {
    var t = snap.data[i];
    if (!t) continue;
    out.total++;
    if (t.categoriaId != null) out.comId++;
    if (t.categoriaNome == null) out.nomeNulo++;
    else if (String(t.categoriaNome) === 'Sem categoria') out.semCategoriaTexto++;
    else {
      out.comNome++;
      if (amostraIds.length < 5) amostraIds.push(t.categoriaId + ' -> ' + t.categoriaNome);
    }
  }

  safeLog_('titulos no snapshot: ' + out.total);
  safeLog_('com categoriaNome util: ' + out.comNome);
  safeLog_('com categoriaNome === "Sem categoria": ' + out.semCategoriaTexto);
  safeLog_('com categoriaNome null: ' + out.nomeNulo);
  safeLog_('com categoriaId preenchido: ' + out.comId);
  if (amostraIds.length) safeLog_('exemplos resolvidos: ' + amostraIds.join(' | '));
  if (out.semCategoriaTexto > 0) {
    safeLog_('ATENCAO: "Sem categoria" e truthy. Estes titulos NAO serao reavaliados');
    safeLog_('num proximo rebuild enquanto forem reaproveitados do snapshot.');
  }
  if (snap.meta) {
    safeLog_('meta -> gerado ' + snap.meta.geradoEm + ' | parcial ' + snap.meta.parcial +
             ' | reaproveitados ' + snap.meta.reaproveitados);
  }
  return out;
}

/* ====================================================================================
 * 5) Leitura do resultado, para nao interpretar mal os numeros.
 * ==================================================================================== */
function diagConclusao_(r1, r2, r3, r4) {
  if (!r1.ok) {
    return 'O endpoint de categorias FALHA. buildCategoriasMap_ engole o erro e devolve {}. ' +
           'Causa provavel: permissao do app OAuth. Corrigir o acesso antes de tudo o resto.';
  }
  if (r2.total === 0) {
    return 'O endpoint responde mas a conta nao tem categorias no catalogo. ' +
           'Nada e resolvivel enquanto nao existirem categorias no Bling.';
  }
  if (r3.titulosTestados > 0 && r3.comCategoriaId === 0) {
    return 'O catalogo existe, mas os titulos NAO tem categoria atribuida no Bling. ' +
           'E um problema de preenchimento no ERP, nao de codigo.';
  }
  if (r3.categoriaIdNaoEncontrada > 0 && r3.categoriaEncontradaNoMapa === 0) {
    return 'Os titulos tem categoria.id, mas nenhum id existe no mapa. ' +
           'O catalogo devolvido nao cobre estes ids (filtro/paginacao/tipo).';
  }
  if (r3.categoriaEncontradaNoMapa > 0 && r4.semCategoriaTexto > 0) {
    return 'A resolucao FUNCIONA agora, mas o snapshot tem titulos congelados em ' +
           '"Sem categoria" e o reaproveitamento nao os reavalia. ' +
           'E preciso corrigir a condicao de reaproveitamento, nao o catalogo.';
  }
  if (r3.categoriaEncontradaNoMapa > 0) {
    return 'A resolucao funciona na amostra. Se o frontend continua sem classificacao, ' +
           'o problema esta a jusante: os NOMES reais nao casam com a lista branca do dreEngine.';
  }
  return 'Resultado inconclusivo — enviar o registo completo para analise.';
}