/****************************************************************************************
 * TesteAjustesManuaisBackend.gs  —  Finer One / Ajustes manuais (CMV C5B)
 * --------------------------------------------------------------------------------------
 * Testes e diagnósticos do backend de LEITURA dos ajustes manuais.
 *
 * T1–T8 correm sobre a função PURA resolverAjustesManuais_, com ficheiros simulados em
 * memória: não tocam no Drive, não criam nada, não apagam nada. Podem ser executados
 * a qualquer momento sem risco.
 *
 * T9 e T10 precisam do ambiente real (Drive e doGet) e continuam a ser SOMENTE LEITURA.
 *
 * Executar no editor: runTestesAjustesManuais() e, depois, runTesteRotaAjustesManuais().
 ****************************************************************************************/

/* Ficheiro simulado, no mesmo formato que coletarFicheirosAjustesManuais_ produz. */
function fakeFicheiroAjustes_(texto, nome) {
  return {
    name: nome || AJUSTES_MANUAIS_FILE_NAME,
    lastUpdated: '2026-08-18T09:00:00.000Z',
    texto: texto
  };
}

function docAjustesTexto_(months, companyId) {
  return JSON.stringify({
    companyId: (companyId === undefined) ? AJUSTES_MANUAIS_COMPANY_ID : companyId,
    updatedAt: '2026-08-18T09:00:00.000Z',
    months: months
  });
}

/* ---- micro-framework de asserção ---- */
var _ajustesFalhas_ = 0;
var _ajustesTotal_ = 0;

function _ok_(condicao, descricao, detalhe) {
  _ajustesTotal_++;
  if (condicao) {
    safeLog_('OK   ' + descricao);
  } else {
    _ajustesFalhas_++;
    safeLog_('FALHA ' + descricao + (detalhe ? ' | obtido: ' + detalhe : ''));
  }
}

/* ====================================================================================
 * T1–T8 — função pura, sem Drive.
 * ==================================================================================== */
function runTestesAjustesManuais() {
  _ajustesFalhas_ = 0;
  _ajustesTotal_ = 0;
  safeLog_('===== C5B — testes do reader de ajustes manuais (puros) =====');

  var r;
  try {

  // T1 — ficheiro inexistente
  r = resolverAjustesManuais_([], AJUSTES_MANUAIS_COMPANY_ID);
  _ok_(r.debug.fonte === AJUSTES_FONTE_VAZIO, 'T1 fonte documento-vazio', r.debug.fonte);
  _ok_(r.data === null, 'T1 data null');
  _ok_(r.debug.totalArquivos === 0, 'T1 totalArquivos 0', r.debug.totalArquivos);

  // T2 — documento válido com months vazio
  r = resolverAjustesManuais_([fakeFicheiroAjustes_(docAjustesTexto_({}))], AJUSTES_MANUAIS_COMPANY_ID);
  _ok_(r.debug.fonte === AJUSTES_FONTE_DOCUMENTO, 'T2 months:{} e documento REAL', r.debug.fonte);
  _ok_(r.debug.totalMeses === 0, 'T2 totalMeses 0', r.debug.totalMeses);
  _ok_(r.data !== null, 'T2 data NAO e null (vazio nao e ausencia)');

  // T3 — documento válido com meses
  r = resolverAjustesManuais_([fakeFicheiroAjustes_(docAjustesTexto_({
    '2026-06': { cmv: { value: 500, updatedAt: '2026-08-18T09:00:00.000Z', note: null } },
    '2026-05': { cmv: { value: 300, updatedAt: '2026-08-18T09:00:00.000Z', note: null } }
  }))], AJUSTES_MANUAIS_COMPANY_ID);
  _ok_(r.debug.fonte === AJUSTES_FONTE_DOCUMENTO, 'T3 fonte documento', r.debug.fonte);
  _ok_(r.debug.totalMeses === 2, 'T3 totalMeses 2', r.debug.totalMeses);
  _ok_(r.data.months['2026-06'].cmv.value === 500, 'T3 valor preservado tal e qual');

  // T4 — companyId errado
  r = resolverAjustesManuais_([fakeFicheiroAjustes_(docAjustesTexto_({}, 'outra-empresa'))], AJUSTES_MANUAIS_COMPANY_ID);
  _ok_(r.debug.fonte === AJUSTES_FONTE_EMPRESA_DIVERGENTE, 'T4 empresa divergente rejeitada', r.debug.fonte);
  _ok_(r.data === null, 'T4 documento de outra empresa NAO e servido');

  // T5 — months array, e outras estruturas inválidas
  r = resolverAjustesManuais_([fakeFicheiroAjustes_(docAjustesTexto_([]))], AJUSTES_MANUAIS_COMPANY_ID);
  _ok_(r.debug.fonte === AJUSTES_FONTE_CORROMPIDO, 'T5 months array rejeitado', r.debug.fonte);

  _ok_(ajustesManuaisDocumentoValido_([{ companyId: 'overcel', months: {} }]) === false, 'T5 array na raiz rejeitado');
  _ok_(ajustesManuaisDocumentoValido_({ months: {} }) === false, 'T5 sem companyId rejeitado');
  _ok_(ajustesManuaisDocumentoValido_({ companyId: 'overcel' }) === false, 'T5 sem months rejeitado');
  _ok_(ajustesManuaisDocumentoValido_({ companyId: 'overcel', months: null }) === false, 'T5 months null rejeitado');
  _ok_(ajustesManuaisDocumentoValido_({ companyId: '', months: {} }) === false, 'T5 companyId vazio rejeitado');
  _ok_(ajustesManuaisDocumentoValido_({ companyId: 'overcel', months: {} }) === true, 'T5 documento minimo aceite');

  // T6 — JSON inválido
  r = resolverAjustesManuais_([fakeFicheiroAjustes_('{ isto nao e json')], AJUSTES_MANUAIS_COMPANY_ID);
  _ok_(r.debug.fonte === AJUSTES_FONTE_CORROMPIDO, 'T6 JSON invalido => documento-corrompido', r.debug.fonte);
  _ok_(r.data === null, 'T6 data null');
  _ok_(r.debug.totalMeses === 0, 'T6 corrompido nao finge months vazio');

  // T7 — dois ficheiros com o mesmo nome
  r = resolverAjustesManuais_([
    fakeFicheiroAjustes_(docAjustesTexto_({ '2026-06': { cmv: { value: 500 } } })),
    fakeFicheiroAjustes_(docAjustesTexto_({ '2026-06': { cmv: { value: 999 } } }))
  ], AJUSTES_MANUAIS_COMPANY_ID);
  _ok_(r.debug.fonte === AJUSTES_FONTE_AMBIGUO, 'T7 duplicados => documento-ambiguo', r.debug.fonte);
  _ok_(r.data === null, 'T7 nenhum dos dois e escolhido');
  _ok_(r.debug.totalArquivos === 2, 'T7 totalArquivos 2', r.debug.totalArquivos);

  // T8 — zero dentro do documento sobrevive intacto à leitura
  var textoZero = docAjustesTexto_({ '2026-06': { cmv: { value: 0, updatedAt: '2026-08-18T09:00:00.000Z', note: null } } });
  r = resolverAjustesManuais_([fakeFicheiroAjustes_(textoZero)], AJUSTES_MANUAIS_COMPANY_ID);
  _ok_(r.debug.fonte === AJUSTES_FONTE_DOCUMENTO, 'T8 documento com zero e servido', r.debug.fonte);
  _ok_(r.data.months['2026-06'].cmv.value === 0, 'T8 zero preservado como zero');
  _ok_(r.data.months['2026-06'].cmv.value !== null, 'T8 zero NAO virou null');
  _ok_(r.debug.totalMeses === 1, 'T8 mes com zero conta como mes', r.debug.totalMeses);
  _ok_(JSON.stringify(r.data) === JSON.stringify(JSON.parse(textoZero)),
       'T8 documento devolvido e identico ao guardado (leitura nao transforma)');

  } catch (e) {
    _ajustesFalhas_++;
    safeLog_('FALHA excecao inesperada a meio da bateria: ' + (e && e.message ? e.message : e));
  }

  safeLog_('===== resultado: ' + (_ajustesTotal_ - _ajustesFalhas_) + '/' + _ajustesTotal_ +
    ' asserçoes OK | falhas: ' + _ajustesFalhas_ + ' =====');
  return { total: _ajustesTotal_, falhas: _ajustesFalhas_ };
}

/* ====================================================================================
 * T9 e T10 — ambiente real. SOMENTE LEITURA.
 * ==================================================================================== */
function runTesteRotaAjustesManuais() {
  safeLog_('===== C5B — T9/T10 no ambiente real (somente leitura) =====');

  // T9 — o GET não cria o documento principal.
  var antes = contarFicheirosPorNome_(AJUSTES_MANUAIS_FILE_NAME);
  serveAjustesManuais_({ recurso: 'ajustes-manuais' });
  var depois = contarFicheirosPorNome_(AJUSTES_MANUAIS_FILE_NAME);
  safeLog_('T9 ficheiros com o nome antes: ' + antes + ' | depois: ' + depois);
  if (antes !== depois) {
    safeLog_('FALHA T9: a leitura alterou o numero de ficheiros. Investigar antes de prosseguir.');
  } else {
    safeLog_('OK   T9 leitura sem efeito colateral no Drive');
  }

  // T10 — a rota não cai no fallback de pedidos.
  var saida = doGet({ parameter: { recurso: 'ajustes-manuais' } });
  var corpo = JSON.parse(saida.getContent());
  var ehArray = Object.prototype.toString.call(corpo.data) === '[object Array]';
  safeLog_('T10 fonte: ' + (corpo.debug ? corpo.debug.fonte : '(sem debug)'));
  if (!corpo.debug || ehArray) {
    safeLog_('FALHA T10: a resposta nao tem debug.fonte ou devolveu uma lista. ' +
      'A rota provavelmente nao foi inserida no doGet, ou ficou DEPOIS do fallback.');
  } else {
    safeLog_('OK   T10 rota dedicada ativa; nao caiu no snapshot de pedidos');
  }

  return { antes: antes, depois: depois, fonte: corpo.debug ? corpo.debug.fonte : null };
}

/* Contagem de ficheiros por nome — leitura pura do Drive, sem efeitos. */
function contarFicheirosPorNome_(nome) {
  var it = DriveApp.getFilesByName(nome);
  var n = 0;
  while (it.hasNext() && n < AJUSTES_MAX_FICHEIROS_INSPECIONADOS) { it.next(); n++; }
  return n;
}

/****************************************************************************************
 * ESCRITA (CMV C6B) — testes com Drive, Lock e Properties SIMULADOS.
 *
 * Nada aqui toca no Drive real: `depsFake_` implementa a mesma interface que
 * depsAjustesReais_, em memória. Por isso estes testes podem correr no editor sem
 * criar, alterar ou apagar um único ficheiro, e sem gravar qualquer valor financeiro.
 *
 * Executar: runTestesEscritaAjustes()
 ****************************************************************************************/

/* Drive/Lock/Properties em memória. `estado` fica acessível para as asserções. */
function depsFake_(config) {
  var c = config || {};
  var estado = {
    ficheiros: {},          // id -> { id, name, texto }
    props: {},
    proximoId: 1,
    escritas: 0,
    criados: 0,               // total (inclui o .bak) — usar criadosPorNome nas asserçoes
    criadosPorNome: {},
    lockPedidos: 0,
    lockLibertado: 0,
    lockDisponivel: (c.lockDisponivel === undefined) ? true : c.lockDisponivel,
    falharEscrita: !!c.falharEscrita,
    falharSetProp: !!c.falharSetProp,      // mutavel: pode ser desligado a meio do teste
    tentativasSetProp: 0,
    listagensPorNome: 0
  };

  function novoFicheiro(nome, texto) {
    var id = 'file-' + (estado.proximoId++);
    estado.ficheiros[id] = { id: id, name: nome, texto: texto };
    estado.criadosPorNome[nome] = (estado.criadosPorNome[nome] || 0) + 1;
    return { id: id, name: nome };
  }
  estado.semear = function (nome, texto) { return novoFicheiro(nome, texto); };

  var deps = {
    listarPorNome: function (nome) {
      estado.listagensPorNome++;
      var out = [];
      var ks = Object.keys(estado.ficheiros);
      for (var i = 0; i < ks.length; i++) {
        var f = estado.ficheiros[ks[i]];
        if (f.name === nome) out.push({ id: f.id, name: f.name });
      }
      return out;
    },
    obterPorId: function (id) {
      var f = estado.ficheiros[id];
      return f ? { id: f.id, name: f.name } : null;
    },
    lerTexto: function (id) { return estado.ficheiros[id] ? estado.ficheiros[id].texto : null; },
    escreverTexto: function (id, texto) {
      if (estado.falharEscrita) throw new Error('Drive indisponivel');
      estado.escritas++;
      estado.ficheiros[id].texto = texto;
    },
    criarFicheiro: function (nome, texto) {
      if (estado.falharEscrita) throw new Error('Drive indisponivel');
      estado.criados++;
      return novoFicheiro(nome, texto);
    },
    getProp: function (k) { return estado.props[k] || null; },
    setProp: function (k, v) {
      estado.tentativasSetProp++;
      if (estado.falharSetProp) throw new Error('PropertiesService indisponivel');
      estado.props[k] = v;
    },
    deleteProp: function (k) { delete estado.props[k]; },
    obterLock: function () {
      estado.lockPedidos++;
      if (!estado.lockDisponivel) return { ok: false, release: function () { estado.lockLibertado++; } };
      return { ok: true, release: function () { estado.lockLibertado++; } };
    },
    agora: function () { return c.agora || '2026-08-19T10:00:00.000Z'; }
  };
  deps._estado = estado;
  return deps;
}

/* Lê o documento principal do Drive simulado (ou null). */
function docDoFake_(deps) {
  var l = deps.listarPorNome(AJUSTES_MANUAIS_FILE_NAME);
  if (l.length !== 1) return null;
  return JSON.parse(deps.lerTexto(l[0].id));
}
function textoBakDoFake_(deps) {
  var l = deps.listarPorNome(AJUSTES_MANUAIS_BAK_FILE_NAME);
  return l.length === 1 ? deps.lerTexto(l[0].id) : null;
}
function docTexto_(months, companyId) {
  return JSON.stringify({
    companyId: (companyId === undefined) ? AJUSTES_MANUAIS_COMPANY_ID : companyId,
    updatedAt: '2026-08-01T00:00:00.000Z',
    months: months
  });
}
function upsert_(monthKey, value, note) {
  return { monthKey: monthKey, key: 'cmv', action: 'upsert', value: value, note: note };
}

function runTestesEscritaAjustes() {
  _ajustesFalhas_ = 0;
  _ajustesTotal_ = 0;
  safeLog_('===== C6B — testes da escrita interna (Drive simulado) =====');

  var d, r, doc;
  try {

  // T1 — upsert cria o documento quando ele não existe
  d = depsFake_();
  r = salvarAjusteManual_(upsert_('2026-06', 500), d);
  _ok_(r.ok === true, 'T1 upsert cria documento');
  _ok_(d._estado.criadosPorNome[AJUSTES_MANUAIS_FILE_NAME] === 1,
       'T1 exatamente um documento principal criado', d._estado.criadosPorNome[AJUSTES_MANUAIS_FILE_NAME]);
  doc = docDoFake_(d);
  _ok_(doc !== null && doc.companyId === AJUSTES_MANUAIS_COMPANY_ID, 'T1 documento nasce com a empresa correta');
  _ok_(textoBakDoFake_(d) === null, 'T1 nao cria backup quando o documento nao existia');

  // T2 — upsert grava o CMV no caminho certo
  _ok_(doc.months['2026-06'].cmv.value === 500, 'T2 CMV gravado em months[mes].cmv.value');
  _ok_(doc.months['2026-06'].cmv.note === null, 'T2 note ausente e' + ' gravada como null');
  _ok_(r.data.value === 500 && r.data.monthKey === '2026-06', 'T2 resposta devolve a rubrica persistida');

  // T3 — cmv 0 preservado
  d = depsFake_();
  r = salvarAjusteManual_(upsert_('2026-06', 0), d);
  _ok_(r.ok === true, 'T3 upsert com zero e aceite');
  _ok_(docDoFake_(d).months['2026-06'].cmv.value === 0, 'T3 zero gravado como zero');

  // T26 — zero não vira ausência
  doc = docDoFake_(d);
  _ok_(doc.months['2026-06'] !== undefined, 'T26 mes com zero existe no documento');
  _ok_(doc.months['2026-06'].cmv.value !== null, 'T26 zero nao virou null');

  // T4 — negativo rejeitado
  d = depsFake_();
  r = salvarAjusteManual_(upsert_('2026-06', -1), d);
  _ok_(r.ok === false && r.error.code === ERRO_INVALID_VALUE, 'T4 negativo rejeitado', r.ok ? 'ok' : r.error.code);
  _ok_(d._estado.criados === 0 && d._estado.escritas === 0, 'T4 nada foi escrito');

  // T5 — string numérica rejeitada
  d = depsFake_();
  r = salvarAjusteManual_(upsert_('2026-06', '500'), d);
  _ok_(r.ok === false && r.error.code === ERRO_INVALID_VALUE, 'T5 string "500" rejeitada');

  // T6 — NaN e Infinity rejeitados; outros tipos também
  var invalidos = [NaN, Infinity, -Infinity, null, undefined, true, [500], { value: 500 }];
  var todosRejeitados = true;
  for (var i = 0; i < invalidos.length; i++) {
    var rr = salvarAjusteManual_(upsert_('2026-06', invalidos[i]), depsFake_());
    if (rr.ok || rr.error.code !== ERRO_INVALID_VALUE) todosRejeitados = false;
  }
  _ok_(todosRejeitados, 'T6 NaN/Infinity/null/booleano/array/objeto rejeitados');

  // T7 — mês inválido rejeitado
  var meses = ['2026-13', '2026-00', '2026-6', '06/2026', '2026-06-01', '', 'junho'];
  var mesesRejeitados = true;
  for (var m = 0; m < meses.length; m++) {
    var rm = salvarAjusteManual_(upsert_(meses[m], 500), depsFake_());
    if (rm.ok || rm.error.code !== ERRO_INVALID_MONTH) mesesRejeitados = false;
  }
  _ok_(mesesRejeitados, 'T7 meses invalidos rejeitados com INVALID_MONTH');

  // T8 — key inválida rejeitada
  d = depsFake_();
  r = salvarAjusteManual_({ monthKey: '2026-06', key: 'impostos', action: 'upsert', value: 5 }, d);
  _ok_(r.ok === false && r.error.code === ERRO_INVALID_KEY, 'T8 rubrica desconhecida rejeitada');
  _ok_(d._estado.criados === 0, 'T8 chave arbitraria nao entra no JSON');

  // T9 — note inválida rejeitada; note válida gravada; vazia vira null
  d = depsFake_();
  r = salvarAjusteManual_({ monthKey: '2026-06', key: 'cmv', action: 'upsert', value: 1, note: { a: 1 } }, d);
  _ok_(r.ok === false && r.error.code === ERRO_INVALID_PAYLOAD, 'T9 note objeto rejeitada');
  var longa = new Array(AJUSTES_NOTE_MAX + 2).join('x') + 'yy';
  r = salvarAjusteManual_(upsert_('2026-06', 1, longa), depsFake_());
  _ok_(r.ok === false && r.error.code === ERRO_INVALID_PAYLOAD, 'T9 note demasiado longa rejeitada');
  d = depsFake_();
  salvarAjusteManual_(upsert_('2026-06', 1, '  fecho de junho  '), d);
  _ok_(docDoFake_(d).months['2026-06'].cmv.note === 'fecho de junho', 'T9 note valida gravada com trim');
  d = depsFake_();
  salvarAjusteManual_(upsert_('2026-06', 1, '   '), d);
  _ok_(docDoFake_(d).months['2026-06'].cmv.note === null, 'T9 note vazia vira null');

  // T10 / T12 — delete remove só a rubrica certa; mês vazio desaparece
  d = depsFake_();
  d._estado.semear(AJUSTES_MANUAIS_FILE_NAME, docTexto_({
    '2026-06': { cmv: { value: 500, updatedAt: 'x', note: null }, outra: { value: 1 } },
    '2026-05': { cmv: { value: 300, updatedAt: 'x', note: null } }
  }));
  r = salvarAjusteManual_({ monthKey: '2026-06', key: 'cmv', action: 'delete' }, d);
  doc = docDoFake_(d);
  _ok_(r.ok === true && r.data.deleted === true, 'T10 delete devolve deleted true');
  _ok_(doc.months['2026-06'].cmv === undefined, 'T10 cmv de junho removido');
  _ok_(doc.months['2026-06'].outra !== undefined, 'T10 outra rubrica do mesmo mes preservada');
  _ok_(doc.months['2026-05'].cmv.value === 300, 'T10 maio intocado');

  d = depsFake_();
  d._estado.semear(AJUSTES_MANUAIS_FILE_NAME, docTexto_({ '2026-06': { cmv: { value: 500 } } }));
  salvarAjusteManual_({ monthKey: '2026-06', key: 'cmv', action: 'delete' }, d);
  doc = docDoFake_(d);
  _ok_(doc.months['2026-06'] === undefined, 'T12 mes sem rubricas e removido do documento');
  _ok_(contarChaves_(doc.months) === 0, 'T12 documento fica com months vazio, nao com mes vazio');

  // T11 — delete idempotente
  d = depsFake_();
  d._estado.semear(AJUSTES_MANUAIS_FILE_NAME, docTexto_({ '2026-05': { cmv: { value: 300 } } }));
  var escritasAntes = d._estado.escritas;
  r = salvarAjusteManual_({ monthKey: '2026-06', key: 'cmv', action: 'delete' }, d);
  _ok_(r.ok === true, 'T11 delete de rubrica inexistente nao e erro');
  _ok_(r.data.deleted === false, 'T11 resposta diz que nada foi removido');
  _ok_(d._estado.escritas === escritasAntes, 'T11 no-op nao escreve');
  _ok_(textoBakDoFake_(d) === null, 'T11 no-op nao cria backup');

  r = salvarAjusteManual_({ monthKey: '2026-06', key: 'cmv', action: 'delete' }, depsFake_());
  _ok_(r.ok === true && r.data.deleted === false, 'T11 delete sem documento nenhum e idempotente');
  _ok_(depsFake_()._estado.criados === 0, 'T11 delete nao cria ficheiro');

  // T13 — documento corrompido nunca sobrescrito
  d = depsFake_();
  var fCorrompido = d._estado.semear(AJUSTES_MANUAIS_FILE_NAME, '{ isto nao e json');
  r = salvarAjusteManual_(upsert_('2026-06', 500), d);
  _ok_(r.ok === false && r.error.code === ERRO_DOCUMENT_CORRUPTED, 'T13 corrompido rejeitado');
  _ok_(d._estado.ficheiros[fCorrompido.id].texto === '{ isto nao e json', 'T13 conteudo original intacto');
  _ok_(d._estado.escritas === 0 && textoBakDoFake_(d) === null, 'T13 sem escrita e sem backup');

  d = depsFake_();
  d._estado.semear(AJUSTES_MANUAIS_FILE_NAME, docTexto_({}, 'outra-empresa'));
  r = salvarAjusteManual_(upsert_('2026-06', 500), d);
  _ok_(r.ok === false && r.error.code === ERRO_DOCUMENT_COMPANY_MISMATCH, 'T13b empresa divergente rejeitada');
  _ok_(d._estado.escritas === 0, 'T13b nada escrito noutra empresa');

  // T14 — duplicidade nunca escolhida
  d = depsFake_();
  d._estado.semear(AJUSTES_MANUAIS_FILE_NAME, docTexto_({ '2026-06': { cmv: { value: 1 } } }));
  d._estado.semear(AJUSTES_MANUAIS_FILE_NAME, docTexto_({ '2026-06': { cmv: { value: 2 } } }));
  r = salvarAjusteManual_(upsert_('2026-06', 500), d);
  _ok_(r.ok === false && r.error.code === ERRO_DOCUMENT_AMBIGUOUS, 'T14 duplicidade aborta');
  _ok_(d._estado.escritas === 0 && d._estado.criados === 0, 'T14 nenhum dos dois foi escrito');

  // T15 / T16 — backup recebe o estado anterior e é rotativo
  d = depsFake_();
  var anterior = docTexto_({ '2026-06': { cmv: { value: 111, updatedAt: 'x', note: null } } });
  d._estado.semear(AJUSTES_MANUAIS_FILE_NAME, anterior);
  salvarAjusteManual_(upsert_('2026-06', 222), d);
  _ok_(textoBakDoFake_(d) === anterior, 'T15 backup guarda exatamente o estado anterior ao write');
  _ok_(JSON.parse(docDoFake_(d).months['2026-06'].cmv.value + '') === 222, 'T15 documento ficou com o valor novo');

  var baksAntes = d.listarPorNome(AJUSTES_MANUAIS_BAK_FILE_NAME).length;
  var textoIntermedio = d.lerTexto(d.listarPorNome(AJUSTES_MANUAIS_FILE_NAME)[0].id);
  salvarAjusteManual_(upsert_('2026-06', 333), d);
  _ok_(d.listarPorNome(AJUSTES_MANUAIS_BAK_FILE_NAME).length === baksAntes,
       'T16 segundo write nao cria backup adicional', d.listarPorNome(AJUSTES_MANUAIS_BAK_FILE_NAME).length);
  _ok_(textoBakDoFake_(d) === textoIntermedio, 'T16 backup foi substituido pelo estado imediatamente anterior');

  d = depsFake_();
  d._estado.semear(AJUSTES_MANUAIS_FILE_NAME, docTexto_({}));
  d._estado.semear(AJUSTES_MANUAIS_BAK_FILE_NAME, '{}');
  d._estado.semear(AJUSTES_MANUAIS_BAK_FILE_NAME, '{}');
  r = salvarAjusteManual_(upsert_('2026-06', 500), d);
  _ok_(r.ok === false && r.error.code === ERRO_DOCUMENT_AMBIGUOUS, 'T16b multiplos .bak abortam antes de escrever');
  _ok_(d._estado.escritas === 0, 'T16b documento principal intocado quando o backup e ambiguo');

  // T17 — fileId persistido
  d = depsFake_();
  salvarAjusteManual_(upsert_('2026-06', 500), d);
  _ok_(!!d._estado.props[AJUSTES_MANUAIS_FILE_ID_PROP], 'T17 fileId guardado apos criar');
  d = depsFake_();
  d._estado.semear(AJUSTES_MANUAIS_FILE_NAME, docTexto_({}));
  salvarAjusteManual_(upsert_('2026-06', 500), d);
  _ok_(!!d._estado.props[AJUSTES_MANUAIS_FILE_ID_PROP], 'T17 fileId guardado apos encontrar por nome');

  // T18 — fileId válido evita pesquisa por nome
  var listagensAntes = d._estado.listagensPorNome;
  salvarAjusteManual_(upsert_('2026-05', 300), d);
  var listagensDepois = d._estado.listagensPorNome;
  // A unica listagem admissivel no segundo write e a do ficheiro .bak.
  _ok_((listagensDepois - listagensAntes) <= 1,
       'T18 fileId evita nova pesquisa do documento por nome', (listagensDepois - listagensAntes));
  _ok_(docDoFake_(d).months['2026-05'].cmv.value === 300, 'T18 segundo write acertou no mesmo ficheiro');

  // T19 — fileId inválido faz fallback controlado
  d = depsFake_();
  d._estado.semear(AJUSTES_MANUAIS_FILE_NAME, docTexto_({}));
  d._estado.props[AJUSTES_MANUAIS_FILE_ID_PROP] = 'file-inexistente';
  r = salvarAjusteManual_(upsert_('2026-06', 500), d);
  _ok_(r.ok === true, 'T19 fileId invalido nao impede a operacao');
  _ok_(d._estado.props[AJUSTES_MANUAIS_FILE_ID_PROP] !== 'file-inexistente', 'T19 property reparada');
  _ok_(d.listarPorNome(AJUSTES_MANUAIS_FILE_NAME).length === 1,
       'T19 fallback nao criou documento duplicado', d.listarPorNome(AJUSTES_MANUAIS_FILE_NAME).length);

  d = depsFake_();
  d._estado.semear(AJUSTES_MANUAIS_FILE_NAME, docTexto_({}));
  d._estado.semear(AJUSTES_MANUAIS_FILE_NAME, docTexto_({}));
  d._estado.props[AJUSTES_MANUAIS_FILE_ID_PROP] = 'file-inexistente';
  r = salvarAjusteManual_(upsert_('2026-06', 500), d);
  _ok_(r.ok === false && r.error.code === ERRO_DOCUMENT_AMBIGUOUS, 'T19b fileId invalido + duplicados => aborta');
  _ok_(!d._estado.props[AJUSTES_MANUAIS_FILE_ID_PROP], 'T19b nao repara property perante duplicados');

  // T20 / T21 — lock
  d = depsFake_({ lockDisponivel: false });
  r = salvarAjusteManual_(upsert_('2026-06', 500), d);
  _ok_(r.ok === false && r.error.code === ERRO_BUSY, 'T20 lock indisponivel => BUSY');
  _ok_(d._estado.escritas === 0 && d._estado.criados === 0, 'T20 BUSY nao escreve nada');

  d = depsFake_();
  salvarAjusteManual_(upsert_('2026-06', 500), d);
  _ok_(d._estado.lockLibertado === 1, 'T21 lock libertado no caminho feliz', d._estado.lockLibertado);
  d = depsFake_();
  d._estado.semear(AJUSTES_MANUAIS_FILE_NAME, '{ corrompido');
  salvarAjusteManual_(upsert_('2026-06', 500), d);
  _ok_(d._estado.lockLibertado === 1, 'T21 lock libertado tambem no caminho de erro', d._estado.lockLibertado);

  // T22 — falha de escrita não é reportada como sucesso
  d = depsFake_({ falharEscrita: true });
  r = salvarAjusteManual_(upsert_('2026-06', 500), d);
  _ok_(r.ok === false && r.error.code === ERRO_WRITE_FAILED, 'T22 falha de escrita devolve WRITE_FAILED');
  _ok_(d._estado.lockLibertado === 1, 'T22 lock libertado apos falha de escrita');

  // T23 — updatedAt gerado pelo servidor
  d = depsFake_({ agora: '2026-08-19T12:34:56.000Z' });
  r = salvarAjusteManual_({
    monthKey: '2026-06', key: 'cmv', action: 'upsert', value: 500,
    updatedAt: '1999-01-01T00:00:00.000Z'   // tentativa de imposicao pelo chamador
  }, d);
  doc = docDoFake_(d);
  _ok_(doc.months['2026-06'].cmv.updatedAt === '2026-08-19T12:34:56.000Z', 'T23 updatedAt vem do servidor');
  _ok_(doc.updatedAt === '2026-08-19T12:34:56.000Z', 'T23 updatedAt do documento tambem');
  _ok_(r.data.updatedAt === '2026-08-19T12:34:56.000Z', 'T23 updatedAt do chamador ignorado');

  // T24 — companyId do documento é sempre o da constante
  d = depsFake_();
  r = salvarAjusteManual_({
    monthKey: '2026-06', key: 'cmv', action: 'upsert', value: 500, companyId: 'outra-empresa'
  }, d);
  _ok_(r.ok === true, 'T24 operacao conclui apesar do companyId externo', r.ok ? 'ok' : r.error.code);
  _ok_(docDoFake_(d).companyId === AJUSTES_MANUAIS_COMPANY_ID,
       'T24 documento fica com a empresa da constante', docDoFake_(d).companyId);
  _ok_(r.data.companyId === AJUSTES_MANUAIS_COMPANY_ID,
       'T24 resposta devolve a empresa da constante, nao a do chamador', r.data.companyId);

  // T25 — merge preserva o que já existia
  d = depsFake_();
  d._estado.semear(AJUSTES_MANUAIS_FILE_NAME, JSON.stringify({
    companyId: AJUSTES_MANUAIS_COMPANY_ID,
    updatedAt: '2026-08-01T00:00:00.000Z',
    schemaVersion: 3,                                   // campo de topo desconhecido
    months: {
      '2026-05': { cmv: { value: 300, updatedAt: 'x', note: 'maio' } },
      '2026-06': {
        impostosSobreLucro: { value: 42 },               // rubrica desconhecida
        cmv: { value: 111, updatedAt: 'x', note: null, origem: 'importacao' }  // campo desconhecido
      }
    }
  }));
  salvarAjusteManual_(upsert_('2026-06', 222), d);
  doc = docDoFake_(d);
  _ok_(doc.schemaVersion === 3, 'T25 campo de topo desconhecido preservado');
  _ok_(doc.months['2026-05'].cmv.value === 300, 'T25 outro mes preservado');
  _ok_(doc.months['2026-06'].impostosSobreLucro.value === 42, 'T25 rubrica desconhecida preservada');
  _ok_(doc.months['2026-06'].cmv.origem === 'importacao', 'T25 campo desconhecido dentro da rubrica preservado');
  _ok_(doc.months['2026-06'].cmv.value === 222, 'T25 valor efetivamente atualizado');

  } catch (e) {
    _ajustesFalhas_++;
    safeLog_('FALHA excecao inesperada a meio da bateria: ' + (e && e.message ? e.message : e));
  }

  // T27 — criacao do documento com PropertiesService em baixo.
  // O indice e' otimizacao: falhar a property nao pode virar WRITE_FAILED nem provocar
  // um segundo documento na tentativa seguinte.
  d = depsFake_({ falharSetProp: true });
  r = salvarAjusteManual_(upsert_('2026-06', 500), d);
  _ok_(r.ok === true, 'T27 escrita financeira e' + ' sucesso apesar de o indice falhar',
       r.ok ? 'ok' : r.error.code);
  _ok_(d.listarPorNome(AJUSTES_MANUAIS_FILE_NAME).length === 1, 'T27 existe exatamente um documento');
  _ok_(docDoFake_(d).months['2026-06'].cmv.value === 500, 'T27 conteudo gravado com o CMV esperado');
  _ok_(!d._estado.props[AJUSTES_MANUAIS_FILE_ID_PROP], 'T27 property fica ausente, sem valor invalido');
  _ok_(d._estado.tentativasSetProp > 0, 'T27 a gravacao do indice chegou a ser tentada');

  // Segunda operacao, ainda sem property: reencontra pelo nome e nao duplica.
  r = salvarAjusteManual_(upsert_('2026-05', 300), d);
  _ok_(r.ok === true, 'T27 segunda operacao tambem conclui');
  _ok_(d.listarPorNome(AJUSTES_MANUAIS_FILE_NAME).length === 1,
       'T27 nao cria segundo documento', d.listarPorNome(AJUSTES_MANUAIS_FILE_NAME).length);
  _ok_(d._estado.criadosPorNome[AJUSTES_MANUAIS_FILE_NAME] === 1,
       'T27 o documento principal so foi criado uma vez',
       d._estado.criadosPorNome[AJUSTES_MANUAIS_FILE_NAME]);
  _ok_(d._estado.criadosPorNome[AJUSTES_MANUAIS_BAK_FILE_NAME] === 1,
       'T27 o unico ficheiro adicional criado foi o backup');
  doc = docDoFake_(d);
  _ok_(doc.months['2026-06'].cmv.value === 500 && doc.months['2026-05'].cmv.value === 300,
       'T27 os dois meses convivem no mesmo documento');

  // PropertiesService volta: a operacao seguinte repara o indice sozinha.
  d._estado.falharSetProp = false;
  r = salvarAjusteManual_(upsert_('2026-04', 100), d);
  _ok_(r.ok === true, 'T27 terceira operacao conclui');
  _ok_(!!d._estado.props[AJUSTES_MANUAIS_FILE_ID_PROP], 'T27 indice reparado assim que possivel');
  _ok_(d.listarPorNome(AJUSTES_MANUAIS_FILE_NAME).length === 1, 'T27 continua a existir so um documento');

  safeLog_('===== resultado: ' + (_ajustesTotal_ - _ajustesFalhas_) + '/' + _ajustesTotal_ +
    ' asserçoes OK | falhas: ' + _ajustesFalhas_ + ' =====');
  return { total: _ajustesTotal_, falhas: _ajustesFalhas_ };
}