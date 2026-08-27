/****************************************************************************************
 * TesteEnriquecimentoDespesas.gs  —  Finer One / Despesas (MVP-1)
 * --------------------------------------------------------------------------------------
 * Funções MANUAIS e SOMENTE LEITURA para descobrir como transformar os IDs de
 * /contas/pagar em dados legíveis (fornecedor por nome, forma de pagamento, situação).
 *
 * Cole NO MESMO projeto Apps Script do Code.gs. REUTILIZA blingGet_, safeLog_ e
 * PAGE_LIMIT já existentes. NÃO altera doGet, NÃO toca proxy/front/mock, NÃO grava nada.
 *
 * IDs de exemplo vindos do seu teste anterior (ajuste se quiser outros):
 *   conta a pagar id : 25387516551
 *   contato id       : 17908437398
 *   formaPagamento id: 8879609
 ****************************************************************************************/

var TEST_CONTA_PAGAR_ID  = 25387516551; // id real de uma conta a pagar
var TEST_CONTATO_ID      = 17908437398; // id real de um contato
var TEST_FORMA_PGTO_ID   = 8879609;     // id real de uma forma de pagamento

/* ====================================================================================
 * 1) DETALHE de uma conta a pagar — /contas/pagar/{id}
 *    Verifica se o detalhe traz nome do fornecedor, histórico, nº documento, categoria,
 *    forma de pagamento e/ou descrição da situação (que a listagem não trouxe).
 * ==================================================================================== */
function runTestDetalheContaPagar() {
  var id = TEST_CONTA_PAGAR_ID;
  if (!id) { safeLog_('Defina TEST_CONTA_PAGAR_ID com um id real antes de rodar.'); return; }

  try {
    var res = blingGet_('/contas/pagar/' + encodeURIComponent(id), null);
    var d = (res && res.data) ? res.data : res;
    if (!d) { safeLog_('Detalhe vazio para a conta ' + id + '.'); return; }

    safeLog_('=== DETALHE conta a pagar ' + id + ' ===');
    safeLog_('CHAVES do detalhe: ' + JSON.stringify(Object.keys(d)));
    safeLog_('RAW detalhe: ' + JSON.stringify(d));

    // Leitura defensiva dos campos que interessam à aba Despesas.
    safeLog_('--- campos uteis (no detalhe) ---');
    safeLog_('contato.nome ......... ' + (d.contato ? (d.contato.nome || '(so id: ' + d.contato.id + ')') : 'ausente'));
    safeLog_('historico ............ ' + (d.historico != null ? d.historico : 'ausente'));
    safeLog_('numeroDocumento ...... ' + (d.numeroDocumento != null ? d.numeroDocumento
                                          : (d.nroDocumento != null ? d.nroDocumento : 'ausente')));
    safeLog_('categoria ............ ' + (d.categoria ? JSON.stringify(d.categoria) : 'ausente'));
    safeLog_('formaPagamento ....... ' + (d.formaPagamento ? JSON.stringify(d.formaPagamento) : 'ausente'));
    safeLog_('situacao ............. ' + (d.situacao != null ? JSON.stringify(d.situacao) : 'ausente'));
    safeLog_('vencimento ........... ' + (d.vencimento != null ? d.vencimento : 'ausente'));
    safeLog_('valor ................ ' + (d.valor != null ? d.valor : 'ausente'));
    // Pistas para semantica de status (pago/aberto): saldo, pagamento, borderos.
    safeLog_('saldo ................ ' + (d.saldo != null ? d.saldo : 'ausente'));
    safeLog_('pagamento/baixa ...... ' + (d.pagamento ? JSON.stringify(d.pagamento)
                                          : (d.borderos ? JSON.stringify(d.borderos) : 'ausente')));
  } catch (e) {
    safeLog_('ERRO no detalhe: ' + (e && e.message ? e.message : e));
    safeLog_('Se HTTP 403: escopo de Financas ausente. Se 404: confirmar o caminho do detalhe.');
  }
}

/* ====================================================================================
 * 2) RESOLUÇÃO DE CONTATO — /contatos/{id}  (id -> nome do fornecedor)
 *    Resolve o id fixo e também alguns ids coletados de /contas/pagar automaticamente.
 * ==================================================================================== */
function runTestResolverContatos() {
  var ids = coletarIdsDeContasPagar_('contato', 5);
  if (TEST_CONTATO_ID && ids.indexOf(TEST_CONTATO_ID) === -1) ids.unshift(TEST_CONTATO_ID);

  safeLog_('=== RESOLUCAO de contatos (id -> nome) ===');
  if (!ids.length) { safeLog_('Nenhum contato.id para testar.'); return; }

  ids.forEach(function (id) {
    try {
      var res = blingGet_('/contatos/' + encodeURIComponent(id), null);
      var c = (res && res.data) ? res.data : res;
      var nome = c ? (c.nome || c.razaoSocial || c.fantasia || '(sem nome no retorno)') : '(detalhe vazio)';
      safeLog_('contato ' + id + ' -> ' + nome);
    } catch (e) {
      safeLog_('contato ' + id + ' -> ERRO: ' + (e && e.message ? e.message : e));
    }
    Utilities.sleep(350); // throttle
  });
  safeLog_('Conclusao: se os nomes apareceram, da para mostrar fornecedor por NOME na aba Despesas');
  safeLog_('(via mapa id->nome, resolvido em lote no rebuild do snapshot).');
}

/* ====================================================================================
 * 3) RESOLUÇÃO DE FORMA DE PAGAMENTO — tenta /formas-pagamentos/{id} e a listagem.
 *    Se não houver caminho simples/permissão, recomenda fallback "Forma ID X" / "—".
 * ==================================================================================== */
function runTestResolverFormasPagamento() {
  var ids = coletarIdsDeContasPagar_('formaPagamento', 5);
  if (TEST_FORMA_PGTO_ID && ids.indexOf(TEST_FORMA_PGTO_ID) === -1) ids.unshift(TEST_FORMA_PGTO_ID);

  safeLog_('=== RESOLUCAO de formas de pagamento ===');

  // 3a) Tenta resolver por ID.
  var resolveuPorId = false;
  ids.forEach(function (id) {
    try {
      var res = blingGet_('/formas-pagamentos/' + encodeURIComponent(id), null);
      var f = (res && res.data) ? res.data : res;
      var nome = f ? (f.descricao || f.nome || '(sem nome no retorno)') : '(detalhe vazio)';
      safeLog_('formaPagamento ' + id + ' -> ' + nome);
      if (f && (f.descricao || f.nome)) resolveuPorId = true;
    } catch (e) {
      safeLog_('formaPagamento ' + id + ' -> ERRO: ' + (e && e.message ? e.message : e));
    }
    Utilities.sleep(350);
  });

  // 3b) Tenta a LISTAGEM (montar um mapa id->nome de uma vez).
  try {
    var lista = blingGet_('/formas-pagamentos', { pagina: 1, limite: PAGE_LIMIT });
    var arr = (lista && lista.data) ? lista.data : [];
    safeLog_('Listagem /formas-pagamentos: ' + arr.length + ' itens.');
    for (var i = 0; i < Math.min(8, arr.length); i++) {
      safeLog_('  ' + arr[i].id + ' -> ' + (arr[i].descricao || arr[i].nome || '(sem nome)'));
    }
    if (arr.length) resolveuPorId = true;
  } catch (e) {
    safeLog_('Listagem /formas-pagamentos -> ERRO: ' + (e && e.message ? e.message : e));
  }

  safeLog_('--- VEREDITO forma de pagamento ---');
  if (resolveuPorId) {
    safeLog_('DA para exibir metodo LEGIVEL (resolver via mapa id->nome no rebuild).');
  } else {
    safeLog_('NAO foi possivel resolver com facilidade -> fallback "Forma ID X" ou "—" no MVP-1.');
  }
}

/* ====================================================================================
 * 4) SIGNIFICADO DOS STATUS — situacao 1, 2, 5 (confirmar por observação, sem chutar).
 *    Para cada situacao distinta, pega 1 exemplo, busca o DETALHE e loga campos que
 *    revelam a semantica (saldo, pagamento/baixa, vencimento vs hoje, descricao).
 * ==================================================================================== */
function runTestStatusContasPagar() {
  safeLog_('=== INVESTIGACAO de situacao (1, 2, 5) ===');
  safeLog_('HIPOTESE a CONFIRMAR (uso comum do Bling, NAO oficial):');
  safeLog_('  1 = em aberto | 2 = pago/baixado | 5 = cancelado');
  safeLog_('Valide observando saldo/pagamento no detalhe abaixo.');

  var amostra = amostraContasPagar_(PAGE_LIMIT); // pagina 1
  if (!amostra.length) { safeLog_('Sem titulos para investigar.'); return; }

  // Um exemplo por situacao distinta.
  var exemploPorSituacao = {};
  amostra.forEach(function (t) {
    var s = (t.situacao && typeof t.situacao === 'object')
              ? (t.situacao.valor != null ? t.situacao.valor : t.situacao.id)
              : t.situacao;
    if (s != null && exemploPorSituacao[String(s)] == null) exemploPorSituacao[String(s)] = t;
  });

  var hoje = new Date();
  Object.keys(exemploPorSituacao).forEach(function (s) {
    var t = exemploPorSituacao[s];
    safeLog_('--- situacao=' + s + ' | exemplo id=' + t.id + ' ---');
    safeLog_('  listagem: vencimento=' + t.vencimento + ' | valor=' + t.valor);

    try {
      var res = blingGet_('/contas/pagar/' + encodeURIComponent(t.id), null);
      var d = (res && res.data) ? res.data : res;
      if (d) {
        var venc = d.vencimento ? new Date(d.vencimento) : null;
        var venceu = (venc && !isNaN(venc.getTime())) ? (venc < hoje) : null;
        safeLog_('  detalhe: saldo=' + (d.saldo != null ? d.saldo : 'n/d') +
                 ' | pagamento=' + (d.pagamento ? 'SIM' : (d.borderos ? 'BORDERO' : 'nao')) +
                 ' | venceu(<hoje)=' + (venceu === null ? 'n/d' : venceu));
        safeLog_('  situacao no detalhe: ' + (d.situacao != null ? JSON.stringify(d.situacao) : 'ausente'));
      }
    } catch (e) {
      safeLog_('  ERRO no detalhe: ' + (e && e.message ? e.message : e));
    }
    Utilities.sleep(350);
  });

  safeLog_('--- COMO LER ---');
  safeLog_('Se situacao=2 tem saldo 0 e/ou pagamento=SIM -> e PAGO.');
  safeLog_('Se situacao=1 tem saldo>0 e sem pagamento     -> e EM ABERTO.');
  safeLog_('  (em aberto + vencimento < hoje => derivamos EM ATRASO no front).');
  safeLog_('Se situacao=5 for raro e sem pagamento        -> provavel CANCELADO (excluir).');
}

/* ====================================================================================
 * Auxiliares de teste (reutilizam blingGet_ / PAGE_LIMIT do Code.gs).
 * ==================================================================================== */

// Devolve os primeiros `qtd` titulos crus de /contas/pagar (pagina 1).
function amostraContasPagar_(qtd) {
  var res = blingGet_('/contas/pagar', { pagina: 1, limite: qtd || PAGE_LIMIT });
  return (res && res.data) ? res.data : (Array.isArray(res) ? res : []);
}

// Coleta ids unicos de um campo ('contato' ou 'formaPagamento') a partir de /contas/pagar.
function coletarIdsDeContasPagar_(campo, max) {
  var amostra = amostraContasPagar_(PAGE_LIMIT);
  var vistos = {}, ids = [];
  for (var i = 0; i < amostra.length && ids.length < (max || 5); i++) {
    var obj = amostra[i] ? amostra[i][campo] : null;
    var id = obj ? obj.id : null;
    if (id != null && !vistos[String(id)]) { vistos[String(id)] = true; ids.push(id); }
  }
  return ids;
}