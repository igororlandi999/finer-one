/****************************************************************************************
 * DiagnosticoRecebiveis.gs — Finer One / Contas a Receber (Fase 1A — Validação)
 * --------------------------------------------------------------------------------------
 * Funções MANUAIS de diagnóstico do dataset real de /contas/receber (Bling v3).
 * Rodar SOMENTE pelo editor do Apps Script. Nada aqui é chamado pelo doGet.
 *
 * NÃO altera: serveRecebiveis_, contrato de ?recurso=recebiveis, snapshots, OAuth,
 * proxy, frontend, alertas, diagnóstico, chat, score ou IA.
 *
 * REUTILIZA (mesmo projeto, escopo global):
 *   Do Código.gs ............ blingGet_, safeLog_, formatDateISO_, PAGE_LIMIT, MAX_PAGES
 *   Do RecebiveisBackend.gs . fetchContaReceberDetalhe_
 *
 * Só faz LEITURA na API do Bling. Não grava nada no Drive nem nas Script Properties.
 * Não loga tokens nem respostas gigantes: apenas contadores, nomes de campos e datas.
 *
 * ORDEM SUGERIDA DE EXECUÇÃO:
 *   1) runInspecionarRecebivelBruto()   -> nomes reais dos campos da listagem (1 registro)
 *   2) runDiagnosticarRecebiveis()      -> estatísticas completas + auditoria de paginação
 *   3) runTestRecebivelDetalhe()        -> listagem × detalhe (definir TEST_RECEBIVEL_ID)
 ****************************************************************************************/

// Defina um id REAL de conta a receber antes de rodar runTestRecebivelDetalhe().
// Um id válido aparece nos logs de runDiagnosticarRecebiveis() (amostra de ids).
var TEST_RECEBIVEL_ID = 24893123606;

/* ====================================================================================
 * 1) diagnosticarRecebiveis_() — estatísticas completas sobre a LISTAGEM CRUA.
 *    Faz a própria paginação (com os mesmos parâmetros do backend) para poder
 *    auditar: páginas percorridas, condição de parada e risco de truncamento.
 *    NÃO interpreta códigos de situação: apenas conta o que encontrou.
 * ==================================================================================== */
function diagnosticarRecebiveis_() {
  var hoje = formatDateISO_(new Date());

  // ---- Paginação auditada (mesmos parâmetros de fetchContasReceberLista_) ----
  var todos = [];
  var paginasPercorridas = 0;
  var tamanhoUltimoLote = 0;
  var paradaPorLoteIncompleto = false;
  var atingiuMaxPages = false;

  var pagina = 1;
  while (pagina <= MAX_PAGES) {
    var res = blingGet_('/contas/receber', { pagina: pagina, limite: PAGE_LIMIT });
    var lote = (res && res.data) ? res.data : [];
    paginasPercorridas++;
    tamanhoUltimoLote = lote.length;

    for (var i = 0; i < lote.length; i++) todos.push(lote[i]);

    if (lote.length < PAGE_LIMIT) { paradaPorLoteIncompleto = true; break; }
    if (pagina === MAX_PAGES) { atingiuMaxPages = true; }
    pagina++;
  }

  // ---- Acumuladores ----
  var qtdTotal = todos.length;
  var valorTotal = 0;

  var qtdPorSituacao = {};    // codigo -> quantidade
  var valorPorSituacao = {};  // codigo -> soma de valor
  var tiposSituacao = {};     // "number" | "string" | "object" | "null" -> quantidade

  var menorVencimento = null;
  var maiorVencimento = null;
  var vencidos = 0;           // vencimento (data) < hoje; sem interpretar situacao
  var semVencimento = 0;

  // Campos auditados: preenchido = valor != null e != '' (para objetos, o subcampo).
  var campos = {
    'dataEmissao':          { preenchidos: 0, nulos: 0 },
    'vencimentoOriginal':   { preenchidos: 0, nulos: 0 },
    'numeroDocumento':      { preenchidos: 0, nulos: 0 },
    'historico':            { preenchidos: 0, nulos: 0 },
    'saldo':                { preenchidos: 0, nulos: 0 },
    'contato.id':           { preenchidos: 0, nulos: 0 },
    'contato.nome':         { preenchidos: 0, nulos: 0 },
    'formaPagamento.id':    { preenchidos: 0, nulos: 0 },
    'formaPagamento.nome':  { preenchidos: 0, nulos: 0 },
    'categoria.id':         { preenchidos: 0, nulos: 0 },
    'categoria.nome':       { preenchidos: 0, nulos: 0 },
    'categoriaId (raiz)':   { preenchidos: 0, nulos: 0 },
    'categoriaNome (raiz)': { preenchidos: 0, nulos: 0 }
  };

  var amostraIds = [];

  for (var j = 0; j < todos.length; j++) {
    var r = todos[j] || {};

    if (amostraIds.length < 5 && r.id != null) amostraIds.push(r.id);

    // Valor total
    var valor = Number(r.valor) || 0;
    valorTotal += valor;

    // Situação: código cru, sem interpretar. Aceita número, string ou objeto {id, valor}.
    var chaveSit;
    if (r.situacao === null || r.situacao === undefined) {
      chaveSit = 'null';
      tiposSituacao['null'] = (tiposSituacao['null'] || 0) + 1;
    } else if (typeof r.situacao === 'object') {
      chaveSit = (r.situacao.id != null) ? String(r.situacao.id) : 'obj-sem-id';
      tiposSituacao['object'] = (tiposSituacao['object'] || 0) + 1;
    } else {
      chaveSit = String(r.situacao);
      tiposSituacao[typeof r.situacao] = (tiposSituacao[typeof r.situacao] || 0) + 1;
    }
    qtdPorSituacao[chaveSit] = (qtdPorSituacao[chaveSit] || 0) + 1;
    valorPorSituacao[chaveSit] = Math.round(((valorPorSituacao[chaveSit] || 0) + valor) * 100) / 100;

    // Vencimentos
    var venc = r.vencimento ? formatDateISO_(r.vencimento) : null;
    if (venc) {
      if (!menorVencimento || venc < menorVencimento) menorVencimento = venc;
      if (!maiorVencimento || venc > maiorVencimento) maiorVencimento = venc;
      if (venc < hoje) vencidos++;
    } else {
      semVencimento++;
    }

    // Campos nulos × preenchidos
    contarCampo_(campos, 'dataEmissao',          r.dataEmissao);
    contarCampo_(campos, 'vencimentoOriginal',   r.vencimentoOriginal);
    contarCampo_(campos, 'numeroDocumento',      r.numeroDocumento);
    contarCampo_(campos, 'historico',            r.historico);
    contarCampo_(campos, 'saldo',                r.saldo);
    contarCampo_(campos, 'contato.id',           r.contato ? r.contato.id : null);
    contarCampo_(campos, 'contato.nome',         r.contato ? r.contato.nome : null);
    contarCampo_(campos, 'formaPagamento.id',    r.formaPagamento ? r.formaPagamento.id : null);
    contarCampo_(campos, 'formaPagamento.nome',  r.formaPagamento ? r.formaPagamento.nome : null);
    contarCampo_(campos, 'categoria.id',         r.categoria ? r.categoria.id : null);
    contarCampo_(campos, 'categoria.nome',       r.categoria ? (r.categoria.nome || r.categoria.descricao) : null);
    contarCampo_(campos, 'categoriaId (raiz)',   r.categoriaId);
    contarCampo_(campos, 'categoriaNome (raiz)', r.categoriaNome);
  }

  // ---- Relatório (apenas logs seguros) ----
  safeLog_('================ DIAGNOSTICO DE RECEBIVEIS (listagem crua) ================');
  safeLog_('Quantidade total de titulos: ' + qtdTotal);
  safeLog_('Valor total (soma de "valor"): ' + (Math.round(valorTotal * 100) / 100));
  safeLog_('Amostra de ids (para TEST_RECEBIVEL_ID): ' + JSON.stringify(amostraIds));

  safeLog_('--- Situacao (codigos crus, SEM interpretar) ---');
  safeLog_('Tipos encontrados no campo situacao: ' + JSON.stringify(tiposSituacao));
  safeLog_('Quantidade por codigo: ' + JSON.stringify(qtdPorSituacao));
  safeLog_('Valor por codigo: ' + JSON.stringify(valorPorSituacao));

  safeLog_('--- Vencimentos ---');
  safeLog_('Menor vencimento: ' + menorVencimento);
  safeLog_('Maior vencimento: ' + maiorVencimento);
  safeLog_('Vencidos (vencimento < ' + hoje + ', por data apenas): ' + vencidos);
  safeLog_('Sem vencimento: ' + semVencimento);

  safeLog_('--- Campos: preenchidos x nulos (sobre ' + qtdTotal + ' titulos) ---');
  Object.keys(campos).forEach(function (nome) {
    safeLog_(nome + ' -> preenchidos: ' + campos[nome].preenchidos + ' | nulos: ' + campos[nome].nulos);
  });

  safeLog_('--- Auditoria de paginacao ---');
  safeLog_('Limite por pagina (PAGE_LIMIT): ' + PAGE_LIMIT);
  safeLog_('Teto de paginas (MAX_PAGES): ' + MAX_PAGES + ' (maximo teorico: ' + (PAGE_LIMIT * MAX_PAGES) + ' titulos)');
  safeLog_('Paginas percorridas: ' + paginasPercorridas);
  safeLog_('Tamanho do ultimo lote: ' + tamanhoUltimoLote);
  safeLog_('Condicao de parada: ' + (paradaPorLoteIncompleto
    ? 'lote < PAGE_LIMIT (ultima pagina natural)'
    : 'teto MAX_PAGES atingido'));
  safeLog_('Risco de truncamento: ' + (atingiuMaxPages
    ? 'SIM - MAX_PAGES atingido com lote cheio; podem existir titulos alem dos obtidos'
    : 'NAO - a listagem terminou naturalmente antes do teto'));
  safeLog_('===========================================================================');

  return {
    qtdTotal: qtdTotal,
    valorTotal: Math.round(valorTotal * 100) / 100,
    qtdPorSituacao: qtdPorSituacao,
    valorPorSituacao: valorPorSituacao,
    menorVencimento: menorVencimento,
    maiorVencimento: maiorVencimento,
    vencidos: vencidos,
    campos: campos,
    paginacao: {
      pageLimit: PAGE_LIMIT,
      maxPages: MAX_PAGES,
      paginasPercorridas: paginasPercorridas,
      tamanhoUltimoLote: tamanhoUltimoLote,
      riscoTruncamento: atingiuMaxPages
    }
  };
}

// Auxiliar do diagnóstico: preenchido = valor != null e != '' (0 conta como preenchido).
function contarCampo_(campos, nome, valor) {
  if (valor === null || valor === undefined || valor === '') {
    campos[nome].nulos++;
  } else {
    campos[nome].preenchidos++;
  }
}

function runDiagnosticarRecebiveis() {
  return diagnosticarRecebiveis_();
}

/* ====================================================================================
 * 2) runInspecionarRecebivelBruto() — nomes de campos do PRIMEIRO registro cru.
 *    Busca só a primeira página com limite 1. Loga apenas NOMES de campos
 *    (nenhum valor, nenhum token, nenhuma resposta gigante).
 * ==================================================================================== */
function runInspecionarRecebivelBruto() {
  var res = blingGet_('/contas/receber', { pagina: 1, limite: 1 });
  var lote = (res && res.data) ? res.data : [];
  if (!lote.length) {
    safeLog_('Nenhum registro retornado na primeira pagina.');
    return;
  }

  var r = lote[0];
  safeLog_('========== INSPECAO DO PRIMEIRO REGISTRO CRU (apenas nomes de campos) ==========');
  safeLog_('Campos na raiz: ' + Object.keys(r).join(', '));

  var internos = ['contato', 'formaPagamento', 'categoria', 'situacao'];
  for (var i = 0; i < internos.length; i++) {
    var k = internos[i];
    var v = r[k];
    if (v === undefined) {
      safeLog_(k + ': campo AUSENTE na listagem');
    } else if (v === null) {
      safeLog_(k + ': presente, valor null');
    } else if (typeof v === 'object') {
      safeLog_(k + ' (objeto) -> campos internos: ' + Object.keys(v).join(', '));
    } else {
      safeLog_(k + ': valor escalar do tipo "' + typeof v + '" (nao e objeto)');
    }
  }
  safeLog_('===============================================================================');
}

/* ====================================================================================
 * 3) runTestRecebivelDetalhe() — compara LISTAGEM × DETALHE para um id real.
 *    O endpoint de detalhe /contas/receber/{id} ja esta confirmado no projeto
 *    (fetchContaReceberDetalhe_ no RecebiveisBackend.gs) — reutilizado aqui.
 *    Informa quais campos aparecem preenchidos APENAS no detalhe.
 * ==================================================================================== */
function runTestRecebivelDetalhe() {
  if (!TEST_RECEBIVEL_ID) {
    throw new Error('Defina TEST_RECEBIVEL_ID com um id real (veja a amostra de ids ' +
      'no log de runDiagnosticarRecebiveis) antes de rodar.');
  }

  // Localiza o MESMO título na listagem, para comparar de igual para igual.
  var itemLista = null;
  var pagina = 1;
  while (pagina <= MAX_PAGES && !itemLista) {
    var res = blingGet_('/contas/receber', { pagina: pagina, limite: PAGE_LIMIT });
    var lote = (res && res.data) ? res.data : [];
    for (var i = 0; i < lote.length; i++) {
      if (lote[i] && String(lote[i].id) === String(TEST_RECEBIVEL_ID)) {
        itemLista = lote[i];
        break;
      }
    }
    if (lote.length < PAGE_LIMIT) break;
    pagina++;
  }

  if (!itemLista) {
    safeLog_('Id ' + TEST_RECEBIVEL_ID + ' nao encontrado na listagem. ' +
      'Confirme o id (amostra no log de runDiagnosticarRecebiveis).');
    return;
  }

  var detalhe = fetchContaReceberDetalhe_(TEST_RECEBIVEL_ID);
  if (!detalhe) {
    safeLog_('Detalhe nao retornado para o id ' + TEST_RECEBIVEL_ID + '.');
    return;
  }

  // Compara presenca de valor (preenchido = != null e != '') campo a campo, achatando
  // objetos de primeiro nivel (contato.id, categoria.nome, ...). Loga apenas nomes.
  var mapaLista = achatarPresenca_(itemLista);
  var mapaDetalhe = achatarPresenca_(detalhe);

  var apenasDetalhe = [];
  var apenasListagem = [];
  var emAmbos = [];

  var todosCampos = {};
  Object.keys(mapaLista).forEach(function (k) { todosCampos[k] = true; });
  Object.keys(mapaDetalhe).forEach(function (k) { todosCampos[k] = true; });

  Object.keys(todosCampos).sort().forEach(function (k) {
    var naLista = !!mapaLista[k];
    var noDetalhe = !!mapaDetalhe[k];
    if (noDetalhe && !naLista) apenasDetalhe.push(k);
    else if (naLista && !noDetalhe) apenasListagem.push(k);
    else if (naLista && noDetalhe) emAmbos.push(k);
  });

  safeLog_('========== LISTAGEM x DETALHE (id ' + TEST_RECEBIVEL_ID + ') ==========');
  safeLog_('Campos preenchidos APENAS no detalhe: ' +
    (apenasDetalhe.length ? apenasDetalhe.join(', ') : '(nenhum)'));
  safeLog_('Campos preenchidos em ambos: ' +
    (emAmbos.length ? emAmbos.join(', ') : '(nenhum)'));
  safeLog_('Campos preenchidos APENAS na listagem: ' +
    (apenasListagem.length ? apenasListagem.join(', ') : '(nenhum)'));
  safeLog_('=====================================================================');

  return { apenasDetalhe: apenasDetalhe, emAmbos: emAmbos, apenasListagem: apenasListagem };
}

// Achata um registro em { 'campo': true } para campos PREENCHIDOS (!= null e != '').
// Objetos de primeiro nivel viram 'pai.filho'. Arrays contam como preenchidos se length > 0.
function achatarPresenca_(obj) {
  var mapa = {};
  if (!obj) return mapa;
  Object.keys(obj).forEach(function (k) {
    var v = obj[k];
    if (v === null || v === undefined || v === '') return;
    if (Array.isArray(v)) {
      if (v.length > 0) mapa[k] = true;
      return;
    }
    if (typeof v === 'object') {
      var algumFilho = false;
      Object.keys(v).forEach(function (sub) {
        var sv = v[sub];
        if (sv !== null && sv !== undefined && sv !== '') {
          mapa[k + '.' + sub] = true;
          algumFilho = true;
        }
      });
      if (!algumFilho) mapa[k + ' (objeto vazio)'] = true;
      return;
    }
    mapa[k] = true;
  });
  return mapa;
}