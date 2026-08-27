/****************************************************************************************
 * AjustesManuaisBackend.gs  —  Finer One / Ajustes manuais (CMV C5B — LEITURA)
 * --------------------------------------------------------------------------------------
 * Serve o documento de AJUSTES MANUAIS financeiros (primeiro caso: CMV mensal) em:
 *
 *     GET ?recurso=ajustes-manuais
 *
 * Contrato de resposta:
 *     { data: <documento|null>, debug: { fonte, totalMeses, totalArquivos, documentoMeta } }
 *
 * DIFERENÇA ESSENCIAL EM RELAÇÃO AOS SNAPSHOTS
 * Pedidos, despesas e recebíveis são dados DERIVADOS: perder o ficheiro custa um rebuild.
 * Os ajustes manuais são dados ORIGINAIS — só existem aqui. Por isso este ficheiro:
 *   - NUNCA escreve, nem sequer para "reparar";
 *   - NUNCA cria o documento principal;
 *   - NUNCA escolhe entre ficheiros duplicados;
 *   - devolve estados de domínio explícitos em debug.fonte, para que o consumidor
 *     distinga ausência de corrupção sem adivinhar.
 *
 * REUTILIZA do Codigo.gs (mesmo projeto, escopo global): jsonOut_, safeParse_, safeLog_.
 * NÃO altera pedidos, despesas ou recebíveis. NÃO existe doPost aqui.
 *
 * >>> INSERÇÃO NECESSÁRIA NO doGet DO Codigo.gs <<<
 *     Antes do fallback para o snapshot de pedidos, junto às outras rotas de recurso:
 *
 *         if (p.recurso === 'ajustes-manuais') {
 *           return serveAjustesManuais_(p);
 *         }
 *
 *     Sem essa rota, ?recurso=ajustes-manuais cai no ramo por omissão e devolve PEDIDOS.
 ****************************************************************************************/

var AJUSTES_MANUAIS_COMPANY_ID = 'overcel';
var AJUSTES_MANUAIS_FILE_NAME =
  'finer_one_ajustes_manuais_' + AJUSTES_MANUAIS_COMPANY_ID + '.json';

/* Estados de domínio. São valores de debug.fonte, não erros técnicos: o Apps Script
 * devolve sempre HTTP 200, logo o corpo tem de ser explícito por si só. */
var AJUSTES_FONTE_DOCUMENTO = 'documento';                          // existe e é estruturalmente válido
var AJUSTES_FONTE_VAZIO = 'documento-vazio';                    // não existe (ainda)
var AJUSTES_FONTE_CORROMPIDO = 'documento-corrompido';               // existe mas é ilegível/inválido
var AJUSTES_FONTE_AMBIGUO = 'documento-ambiguo';                  // mais do que um ficheiro com o nome
var AJUSTES_FONTE_EMPRESA_DIVERGENTE = 'documento-empresa-divergente';       // companyId não é o esperado

/* Trava de segurança ao percorrer o iterador do Drive: só precisamos de saber se há
 * zero, um, ou mais do que um. Não vale a pena percorrer um número indefinido. */
var AJUSTES_MAX_FICHEIROS_INSPECIONADOS = 20;

/* ====================================================================================
 * Entrada da rota. Camada fina: recolhe do Drive e delega a decisão à função PURA.
 * ==================================================================================== */
function serveAjustesManuais_(p) {
  var ficheiros = coletarFicheirosAjustesManuais_();
  var out = resolverAjustesManuais_(ficheiros, AJUSTES_MANUAIS_COMPANY_ID);

  safeLog_('Ajustes manuais | fonte: ' + out.debug.fonte +
    ' | ficheiros: ' + out.debug.totalArquivos +
    ' | meses no documento: ' + out.debug.totalMeses);

  if (out.debug.fonte === AJUSTES_FONTE_CORROMPIDO) {
    safeLog_('ATENCAO: documento de ajustes manuais ilegivel ou com estrutura invalida. ' +
      'NADA foi escrito nem apagado. Requer intervencao manual antes de qualquer gravacao.');
  }
  if (out.debug.fonte === AJUSTES_FONTE_AMBIGUO) {
    safeLog_('ATENCAO: mais do que um ficheiro com o nome ' + AJUSTES_MANUAIS_FILE_NAME +
      '. Nenhum foi escolhido. Resolver manualmente no Drive.');
  }

  return jsonOut_(out);
}

/* ====================================================================================
 * Recolha no Drive. Devolve uma lista de registos simples { name, lastUpdated, texto }.
 * O conteúdo só é lido quando existe EXATAMENTE um ficheiro: perante duplicados não há
 * decisão a tomar, logo também não há razão para ler nada.
 * Esta função é a ÚNICA que toca no Drive, e só em leitura.
 * ==================================================================================== */
function coletarFicheirosAjustesManuais_() {
  var it = DriveApp.getFilesByName(AJUSTES_MANUAIS_FILE_NAME);
  var encontrados = [];

  while (it.hasNext() && encontrados.length < AJUSTES_MAX_FICHEIROS_INSPECIONADOS) {
    var f = it.next();
    var reg = { name: null, lastUpdated: null, texto: null, _file: f };
    try { reg.name = f.getName(); } catch (e) { reg.name = null; }
    try {
      var d = f.getLastUpdated();
      reg.lastUpdated = d ? d.toISOString() : null;
    } catch (e) { reg.lastUpdated = null; }
    encontrados.push(reg);
  }

  if (encontrados.length === 1) {
    try {
      encontrados[0].texto = encontrados[0]._file.getBlob().getDataAsString();
    } catch (e) {
      // Ficheiro existe mas não foi possível ler o conteúdo: trata-se como ilegível,
      // nunca como ausente. `texto` fica null e o resolvedor devolve corrompido.
      encontrados[0].texto = null;
      safeLog_('Nao foi possivel ler o conteudo do documento de ajustes manuais.');
    }
  }

  for (var i = 0; i < encontrados.length; i++) delete encontrados[i]._file;
  return encontrados;
}

/* ====================================================================================
 * DECISÃO — função PURA e testável sem Drive.
 *
 *   0 ficheiros            -> documento-vazio            (ausência legítima)
 *   > 1 ficheiro           -> documento-ambiguo          (não se escolhe às cegas)
 *   1, JSON ilegível       -> documento-corrompido       (nunca reescrito)
 *   1, estrutura inválida  -> documento-corrompido       (idem)
 *   1, empresa diferente   -> documento-empresa-divergente
 *   1, válido              -> documento                  (months:{} é real)
 *
 * @param {Array} ficheiros  [{ name, lastUpdated, texto }]
 * @param {string} companyIdEsperado
 * @return {{data: Object|null, debug: Object}}
 * ==================================================================================== */
function resolverAjustesManuais_(ficheiros, companyIdEsperado) {
  var lista = (ficheiros && ficheiros.length) ? ficheiros : [];
  var total = lista.length;

  if (total === 0) return respostaAjustes_(null, AJUSTES_FONTE_VAZIO, 0, 0, null);
  if (total > 1) return respostaAjustes_(null, AJUSTES_FONTE_AMBIGUO, 0, total, null);

  var reg = lista[0] || {};
  var meta = { name: reg.name || null, lastUpdated: reg.lastUpdated || null };

  if (typeof reg.texto !== 'string') {
    return respostaAjustes_(null, AJUSTES_FONTE_CORROMPIDO, 0, total, meta);
  }

  var obj = safeParse_(reg.texto);
  if (!ajustesManuaisDocumentoValido_(obj)) {
    // Inclui JSON inválido (safeParse_ devolve null) e JSON válido com estrutura errada.
    // Mesmo tratamento por uma razão prática: em ambos os casos o ficheiro não é
    // utilizável e não pode ser tocado. Mesmo critério do readPedidosSnapshotSeguro_.
    return respostaAjustes_(null, AJUSTES_FONTE_CORROMPIDO, 0, total, meta);
  }

  if (obj.companyId !== companyIdEsperado) {
    // Documento legível e bem formado, mas de outra empresa. NÃO é corrupção: não se
    // faz cópia de segurança nem se sinaliza como ilegível. Também não se serve.
    return respostaAjustes_(null, AJUSTES_FONTE_EMPRESA_DIVERGENTE, 0, total, meta);
  }

  /* totalMeses = número de chaves GUARDADAS no documento. Não é uma medida financeira
   * nem promete que todas sejam utilizáveis: a validação de "aaaa-mm", de rubricas
   * conhecidas e de valores é da normalização no frontend. Serve para diagnóstico. */
  var totalMeses = contarChaves_(obj.months);
  return respostaAjustes_(obj, AJUSTES_FONTE_DOCUMENTO, totalMeses, total, meta);
}

/* Monta o corpo da resposta. `documentoMeta` sai sempre com as mesmas chaves para que
 * o consumidor não tenha de testar a existência do bloco. O fileId NÃO é exposto:
 * o frontend não precisa dele e é identificador interno do Drive. */
function respostaAjustes_(data, fonte, totalMeses, totalArquivos, meta) {
  return {
    data: data,
    debug: {
      fonte: fonte,
      totalMeses: totalMeses,
      totalArquivos: totalArquivos,
      documentoMeta: meta ? { name: meta.name, lastUpdated: meta.lastUpdated } : null
    }
  };
}

/* ====================================================================================
 * Validação ESTRUTURAL mínima. Função pura.
 * Não valida nada financeiro: valores, sinais, rubricas e formato de mês são decididos
 * pela normalização do frontend. Aqui só se responde a "isto é um documento?".
 * ==================================================================================== */
function ajustesManuaisDocumentoValido_(obj) {
  if (!obj) return false;                                                  // null, undefined, '', 0
  if (typeof obj !== 'object') return false;                               // string, número, booleano
  if (Array.isArray(obj)) return false;                                    // array na raiz
  if (typeof obj.companyId !== 'string' || obj.companyId === '') return false;
  if (!Object.prototype.hasOwnProperty.call(obj, 'months')) return false;
  var m = obj.months;
  if (!m || typeof m !== 'object' || Array.isArray(m)) return false;       // months:{} é válido
  return true;
}

/* Conta chaves próprias de um objeto simples. Pura. */
function contarChaves_(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return 0;
  return Object.keys(obj).length;
}

/* ====================================================================================
 * Wrapper SEM underline — validação manual no editor. SOMENTE LEITURA.
 * Mostra o que a rota devolveria hoje, sem passar pelo doGet e sem gravar nada.
 * ==================================================================================== */
function runLerAjustesManuais() {
  var out = resolverAjustesManuais_(coletarFicheirosAjustesManuais_(), AJUSTES_MANUAIS_COMPANY_ID);
  safeLog_('Ficheiro procurado: ' + AJUSTES_MANUAIS_FILE_NAME);
  safeLog_('fonte: ' + out.debug.fonte +
    ' | totalArquivos: ' + out.debug.totalArquivos +
    ' | totalMeses: ' + out.debug.totalMeses);
  safeLog_('data e null? ' + (out.data === null));
  safeLog_('Nada foi escrito, criado ou apagado.');
  return out.debug;
}

/****************************************************************************************
 * ESCRITA INTERNA (CMV C6B)
 * --------------------------------------------------------------------------------------
 * Persistência dos ajustes manuais. SEM HTTP: nesta fase a escrita só acontece quando um
 * operador interno executa um wrapper no editor do Apps Script, autenticado pela própria
 * conta Google. NÃO existe doPost e nada aqui está exposto na web.
 *
 * A orquestração recebe as suas dependências (Drive, Lock, Properties, relógio) num
 * objeto `deps`. Isso não é cerimónia: é o que permite testar criação, merge, backup,
 * corrupção, duplicidade, falha de escrita e indisponibilidade de lock sem tocar no Drive
 * real e sem escrever um único valor financeiro verdadeiro.
 *
 * Quando existir autenticação e a escrita passar a HTTP, o futuro doPost será um invólucro
 * fino sobre salvarAjusteManual_ — a validação, o lock, o backup e o merge já vivem aqui.
 ****************************************************************************************/

var AJUSTES_MANUAIS_BAK_FILE_NAME =
  'finer_one_ajustes_manuais_' + AJUSTES_MANUAIS_COMPANY_ID + '.bak.json';

var AJUSTES_MANUAIS_FILE_ID_PROP = 'FINER_ONE_AJUSTES_MANUAIS_FILE_ID';

/* Rubricas que a ESCRITA aceita. Espelha RUBRICAS_MANUAIS_CONHECIDAS do frontend.
 * Chave fora desta lista nunca entra no documento. */
var AJUSTES_RUBRICAS_ESCRITA = ['cmv'];

var AJUSTES_ACOES = ['upsert', 'delete'];
var AJUSTES_NOTE_MAX = 500;
var AJUSTES_LOCK_TIMEOUT_MS = 4000;   // curto de propósito: escrever leva milissegundos
var RE_MONTH_KEY_ESCRITA = /^\d{4}-(0[1-9]|1[0-2])$/;

/* Códigos de erro. Só existem os que são realmente emitidos. */
var ERRO_INVALID_PAYLOAD = 'INVALID_PAYLOAD';
var ERRO_INVALID_MONTH = 'INVALID_MONTH';
var ERRO_INVALID_VALUE = 'INVALID_VALUE';
var ERRO_INVALID_KEY = 'INVALID_KEY';
var ERRO_BUSY = 'BUSY';
var ERRO_DOCUMENT_CORRUPTED = 'DOCUMENT_CORRUPTED';
var ERRO_DOCUMENT_AMBIGUOUS = 'DOCUMENT_AMBIGUOUS';
var ERRO_DOCUMENT_COMPANY_MISMATCH = 'DOCUMENT_COMPANY_MISMATCH';
var ERRO_WRITE_FAILED = 'WRITE_FAILED';

function okAjuste_(data) { return { ok: true, data: data }; }
function erroAjuste_(code, message) { return { ok: false, error: { code: code, message: message } }; }

/* ====================================================================================
 * VALIDAÇÃO — função PURA. Contrato ESTRITO: a entrada é manual e interna, logo não há
 * razão para tolerar formatos ambíguos. Em particular NÃO se usa extrairValorNumerico_
 * aqui: "500" é rejeitado. Esse helper continua a servir as fontes externas na leitura.
 * ==================================================================================== */
function validarAjusteManual_(entrada) {
  var e = entrada;
  if (!e || typeof e !== 'object' || Object.prototype.toString.call(e) === '[object Array]') {
    return erroAjuste_(ERRO_INVALID_PAYLOAD, 'Pedido tem de ser um objeto.');
  }

  if (AJUSTES_ACOES.indexOf(e.action) === -1) {
    return erroAjuste_(ERRO_INVALID_PAYLOAD, 'action tem de ser "upsert" ou "delete".');
  }
  if (typeof e.monthKey !== 'string' || !RE_MONTH_KEY_ESCRITA.test(e.monthKey)) {
    return erroAjuste_(ERRO_INVALID_MONTH, 'monthKey tem de ser aaaa-mm com mes entre 01 e 12.');
  }
  if (AJUSTES_RUBRICAS_ESCRITA.indexOf(e.key) === -1) {
    return erroAjuste_(ERRO_INVALID_KEY, 'Rubrica nao suportada nesta fase.');
  }

  var note = null;
  if (e.note !== undefined && e.note !== null) {
    if (typeof e.note !== 'string') {
      return erroAjuste_(ERRO_INVALID_PAYLOAD, 'note tem de ser texto ou nulo.');
    }
    var t = e.note.replace(/^\s+|\s+$/g, '');
    if (t.length > AJUSTES_NOTE_MAX) {
      return erroAjuste_(ERRO_INVALID_PAYLOAD, 'note excede ' + AJUSTES_NOTE_MAX + ' caracteres.');
    }
    note = (t === '') ? null : t;   // texto vazio equivale a ausencia de nota
  }

  if (e.action === 'delete') {
    return okAjuste_({ monthKey: e.monthKey, key: e.key, action: 'delete', note: null });
  }

  // upsert: value obrigatorio, numero finito e nao negativo. 0 e valido.
  if (typeof e.value !== 'number' || !isFinite(e.value)) {
    return erroAjuste_(ERRO_INVALID_VALUE, 'value tem de ser um numero finito.');
  }
  if (e.value < 0) {
    return erroAjuste_(ERRO_INVALID_VALUE, 'value nao pode ser negativo nesta rubrica.');
  }
  return okAjuste_({ monthKey: e.monthKey, key: e.key, action: 'upsert', value: e.value, note: note });
}

/* ====================================================================================
 * MERGE GRANULAR — função PURA. Muta apenas o caminho months[monthKey][key] e devolve
 * se houve alteração. Tudo o resto do documento é preservado por construção: campos de
 * topo desconhecidos, outros meses, outras rubricas do mesmo mês, e até campos
 * desconhecidos dentro da própria rubrica (fundidos, não substituídos).
 * ==================================================================================== */
function aplicarAjusteNoDocumento_(doc, pedido, agoraIso) {
  if (pedido.action === 'delete') {
    var mes = doc.months[pedido.monthKey];
    if (!mes || typeof mes !== 'object' || mes[pedido.key] === undefined) {
      return { alterado: false, removido: false };   // idempotente: nada a fazer
    }
    delete mes[pedido.key];
    // Mes sem rubricas nao fica no documento: evita meses vazios artificiais.
    if (contarChaves_(mes) === 0) delete doc.months[pedido.monthKey];
    doc.updatedAt = agoraIso;
    return { alterado: true, removido: true };
  }

  if (!doc.months[pedido.monthKey] || typeof doc.months[pedido.monthKey] !== 'object') {
    doc.months[pedido.monthKey] = {};
  }
  var anterior = doc.months[pedido.monthKey][pedido.key];
  var rubrica = {};
  if (anterior && typeof anterior === 'object') {
    // Preserva campos desconhecidos ja gravados na rubrica.
    var ks = Object.keys(anterior);
    for (var i = 0; i < ks.length; i++) rubrica[ks[i]] = anterior[ks[i]];
  }
  rubrica.value = pedido.value;
  rubrica.updatedAt = agoraIso;
  rubrica.note = pedido.note;
  doc.months[pedido.monthKey][pedido.key] = rubrica;
  doc.updatedAt = agoraIso;
  return { alterado: true, removido: false };
}

/* ====================================================================================
 * ÍNDICE (fileId) — best-effort, por decisão explícita.
 *
 * O fileId guardado em PropertiesService é um ATALHO para localizar o documento, não
 * parte do dado financeiro. Se a gravação do índice falhar, o documento continua
 * univocamente identificável pelo nome, e a operação seguinte repara a propriedade.
 * Por isso uma falha aqui NUNCA transforma uma escrita bem sucedida em WRITE_FAILED:
 * isso seria um falso negativo — o utilizador veria erro sobre dado que ficou gravado,
 * e a tentativa de repetir criaria um segundo documento.
 * ==================================================================================== */
function guardarFileIdBestEffort_(deps, fileId) {
  try {
    deps.setProp(AJUSTES_MANUAIS_FILE_ID_PROP, fileId);
    return true;
  } catch (e) {
    safeLog_('Aviso: documento gravado com sucesso, mas o indice de fileId nao foi ' +
      'persistido. A proxima operacao localiza o documento pelo nome e repara o indice.');
    return false;
  }
}

function limparFileIdBestEffort_(deps) {
  try { deps.deleteProp(AJUSTES_MANUAIS_FILE_ID_PROP); return true; }
  catch (e) {
    safeLog_('Aviso: nao foi possivel limpar o indice de fileId obsoleto.');
    return false;
  }
}

/* ====================================================================================
 * Resolução do ficheiro principal. Prefere o fileId persistido; só cai na pesquisa por
 * nome quando não há id fiável, e só repara a propriedade quando há exatamente um
 * candidato. Perante duplicados não escolhe — aborta.
 * ==================================================================================== */
function resolverFicheiroPrincipal_(deps) {
  var idGuardado = deps.getProp(AJUSTES_MANUAIS_FILE_ID_PROP);

  if (idGuardado) {
    var f = deps.obterPorId(idGuardado);
    if (f && f.name === AJUSTES_MANUAIS_FILE_NAME) {
      return { estado: 'unico', ficheiro: f, viaFileId: true, candidatos: 1 };
    }
    // Id invalido, apagado, ou a apontar para outro ficheiro: NAO escrever as cegas.
    limparFileIdBestEffort_(deps);
  }

  var lista = deps.listarPorNome(AJUSTES_MANUAIS_FILE_NAME) || [];
  if (lista.length === 0) return { estado: 'nenhum', ficheiro: null, viaFileId: false, candidatos: 0 };
  if (lista.length > 1) return { estado: 'ambiguo', ficheiro: null, viaFileId: false, candidatos: lista.length };

  // Reparacao controlada do indice: ha exatamente um candidato. Falhar aqui nao impede
  // a operacao — o documento ja esta identificado sem ambiguidade.
  guardarFileIdBestEffort_(deps, lista[0].id);
  return { estado: 'unico', ficheiro: lista[0], viaFileId: false, candidatos: 1 };
}

/* Copia rotativa do estado ANTERIOR. Uma só cópia, sobrescrita: retenção constante,
 * sem acumular lixo no Drive. Duplicados de .bak abortam a operação. */
function gravarBackupAjustes_(deps, textoAnterior) {
  var baks = deps.listarPorNome(AJUSTES_MANUAIS_BAK_FILE_NAME) || [];
  if (baks.length > 1) {
    return erroAjuste_(ERRO_DOCUMENT_AMBIGUOUS,
      'Existe mais do que um ficheiro de backup. Resolver manualmente antes de gravar.');
  }
  if (baks.length === 1) deps.escreverTexto(baks[0].id, textoAnterior);
  else deps.criarFicheiro(AJUSTES_MANUAIS_BAK_FILE_NAME, textoAnterior);
  return okAjuste_(null);
}

/* ====================================================================================
 * ORQUESTRAÇÃO. Independente de HTTP.
 *
 *   validar -> lock -> resolver ficheiro -> ler -> merge -> backup -> escrever
 *
 * Nunca sinaliza sucesso sem ter gravado. O lock é sempre libertado.
 * ==================================================================================== */
function salvarAjusteManual_(entrada, deps) {
  var d = deps || depsAjustesReais_();

  var validado = validarAjusteManual_(entrada);
  if (!validado.ok) {
    logAjuste_(entrada, validado.error.code);
    return validado;
  }
  var pedido = validado.data;

  var lock = d.obterLock(AJUSTES_LOCK_TIMEOUT_MS);
  if (!lock || !lock.ok) {
    logAjuste_(pedido, ERRO_BUSY);
    return erroAjuste_(ERRO_BUSY,
      'Documento ocupado por outra operacao. Tente novamente dentro de instantes.');
  }

  try {
    var alvo = resolverFicheiroPrincipal_(d);

    if (alvo.estado === 'ambiguo') {
      logAjuste_(pedido, ERRO_DOCUMENT_AMBIGUOUS);
      return erroAjuste_(ERRO_DOCUMENT_AMBIGUOUS,
        'Ha ' + alvo.candidatos + ' ficheiros com o nome do documento. Nenhum foi escolhido.');
    }

    var doc, textoAnterior = null, ficheiro = alvo.ficheiro;

    if (alvo.estado === 'nenhum') {
      if (pedido.action === 'delete') {
        // Nada persistido: apagar e' no-op. Nao se cria ficheiro por causa de um delete.
        logAjuste_(pedido, 'OK_NOOP');
        return okAjuste_({
          companyId: AJUSTES_MANUAIS_COMPANY_ID, monthKey: pedido.monthKey, key: pedido.key,
          deleted: false, updatedAt: null
        });
      }
      doc = { companyId: AJUSTES_MANUAIS_COMPANY_ID, updatedAt: null, months: {} };
    } else {
      textoAnterior = d.lerTexto(ficheiro.id);
      var obj = (typeof textoAnterior === 'string') ? safeParse_(textoAnterior) : null;
      if (!ajustesManuaisDocumentoValido_(obj)) {
        logAjuste_(pedido, ERRO_DOCUMENT_CORRUPTED);
        return erroAjuste_(ERRO_DOCUMENT_CORRUPTED,
          'Documento existente ilegivel ou com estrutura invalida. Nada foi escrito.');
      }
      if (obj.companyId !== AJUSTES_MANUAIS_COMPANY_ID) {
        logAjuste_(pedido, ERRO_DOCUMENT_COMPANY_MISMATCH);
        return erroAjuste_(ERRO_DOCUMENT_COMPANY_MISMATCH,
          'O documento existente pertence a outra empresa. Nada foi escrito.');
      }
      doc = obj;
    }

    var agora = d.agora();
    var res = aplicarAjusteNoDocumento_(doc, pedido, agora);

    if (!res.alterado) {
      // Delete idempotente sobre rubrica inexistente: sem escrita e sem backup.
      logAjuste_(pedido, 'OK_NOOP');
      return okAjuste_({
        companyId: AJUSTES_MANUAIS_COMPANY_ID, monthKey: pedido.monthKey, key: pedido.key,
        deleted: false, updatedAt: doc.updatedAt || null
      });
    }

    // Backup do estado anterior, apenas quando havia documento e vamos mesmo escrever.
    if (textoAnterior !== null) {
      var bak = gravarBackupAjustes_(d, textoAnterior);
      if (!bak.ok) { logAjuste_(pedido, bak.error.code); return bak; }
    }

    /* FRONTEIRA DE ATOMICIDADE: dentro deste try esta apenas a gravacao do DADO
     * FINANCEIRO. A persistencia do indice fica deliberadamente de fora, porque uma
     * falha de indice sobre um documento ja gravado nao e uma falha de escrita. */
    var novoTexto = JSON.stringify(doc);
    var criado = null;
    try {
      if (ficheiro) {
        d.escreverTexto(ficheiro.id, novoTexto);
      } else {
        criado = d.criarFicheiro(AJUSTES_MANUAIS_FILE_NAME, novoTexto);
      }
    } catch (err) {
      logAjuste_(pedido, ERRO_WRITE_FAILED);
      return erroAjuste_(ERRO_WRITE_FAILED, 'Nao foi possivel gravar o documento.');
    }

    // Documento gravado. O indice e' otimizacao: nao repetir a criacao, nao apagar o
    // ficheiro criado, nao converter isto em erro.
    if (criado) guardarFileIdBestEffort_(d, criado.id);

    logAjuste_(pedido, 'OK');
    if (pedido.action === 'delete') {
      return okAjuste_({
        companyId: AJUSTES_MANUAIS_COMPANY_ID, monthKey: pedido.monthKey, key: pedido.key,
        deleted: true, updatedAt: agora
      });
    }
    return okAjuste_({
      companyId: AJUSTES_MANUAIS_COMPANY_ID, monthKey: pedido.monthKey, key: pedido.key,
      value: pedido.value, updatedAt: agora
    });

  } finally {
    try { lock.release(); } catch (e) { /* lock ja libertado */ }
  }
}

/* Log operacional. NUNCA regista o valor do CMV nem o conteudo da nota: os registos do
 * Apps Script sao legiveis por quem tenha acesso de edicao, e o numero nao acrescenta
 * poder de diagnostico face a mes + rubrica + accao. */
function logAjuste_(pedido, resultado) {
  var p = pedido || {};
  safeLog_('Ajuste manual | empresa: ' + AJUSTES_MANUAIS_COMPANY_ID +
    ' | mes: ' + (p.monthKey || '(invalido)') +
    ' | rubrica: ' + (p.key || '(invalida)') +
    ' | accao: ' + (p.action || '(invalida)') +
    ' | resultado: ' + resultado +
    ' | em: ' + new Date().toISOString());
}

/* ====================================================================================
 * Dependências reais. Única camada que toca em Drive, Properties e Lock.
 * ==================================================================================== */
function depsAjustesReais_() {
  return {
    listarPorNome: function (nome) {
      var it = DriveApp.getFilesByName(nome);
      var out = [];
      while (it.hasNext() && out.length < AJUSTES_MAX_FICHEIROS_INSPECIONADOS) {
        var f = it.next();
        out.push({ id: f.getId(), name: f.getName() });
      }
      return out;
    },
    obterPorId: function (id) {
      try {
        var f = DriveApp.getFileById(id);
        if (!f || f.isTrashed()) return null;
        return { id: f.getId(), name: f.getName() };
      } catch (e) { return null; }
    },
    lerTexto: function (id) {
      try { return DriveApp.getFileById(id).getBlob().getDataAsString(); }
      catch (e) { return null; }
    },
    escreverTexto: function (id, texto) { DriveApp.getFileById(id).setContent(texto); },
    criarFicheiro: function (nome, texto) {
      var f = DriveApp.createFile(nome, texto, 'application/json');
      return { id: f.getId(), name: f.getName() };
    },
    getProp: function (k) { return PropertiesService.getScriptProperties().getProperty(k); },
    setProp: function (k, v) { PropertiesService.getScriptProperties().setProperty(k, v); },
    deleteProp: function (k) { PropertiesService.getScriptProperties().deleteProperty(k); },
    obterLock: function (timeoutMs) {
      var l = LockService.getScriptLock();
      try { l.waitLock(timeoutMs); } catch (e) { return { ok: false, release: function () { } }; }
      return { ok: true, release: function () { l.releaseLock(); } };
    },
    agora: function () { return new Date().toISOString(); }
  };
}

/* ====================================================================================
 * WRAPPERS PARA O OPERADOR INTERNO.
 * O editor do Apps Script não passa argumentos ao botão Executar: use o painel de
 * execução, ou edite runExemploDefinirCmv abaixo antes de correr. Nenhum valor real da
 * Overcel está fixado neste ficheiro.
 * ==================================================================================== */
function runDefinirCmvMensal(monthKey, value, note) {
  var r = salvarAjusteManual_({
    monthKey: monthKey, key: 'cmv', action: 'upsert', value: value, note: note || null
  });
  safeLog_(r.ok ? 'CMV gravado para ' + monthKey + '.'
    : 'Falhou (' + r.error.code + '): ' + r.error.message);
  return r;
}

function runRemoverCmvMensal(monthKey) {
  var r = salvarAjusteManual_({ monthKey: monthKey, key: 'cmv', action: 'delete' });
  safeLog_(r.ok ? ('Remocao concluida para ' + monthKey + ' (removido: ' + r.data.deleted + ').')
    : 'Falhou (' + r.error.code + '): ' + r.error.message);
  return r;
}

/* EDITAR antes de executar. Placeholders propositadamente invalidos: correr sem os
 * alterar devolve INVALID_MONTH/INVALID_VALUE em vez de gravar seja o que for. */
function runExemploDefinirCmv() {
  var MES = '2026-06';
  var VALOR = 116039.70;

  return runDefinirCmvMensal(
    MES,
    VALOR,
    'CMV mensal confirmado'
  );
}

function runExemploRemoverCmv() {
  var resultado = runRemoverCmvMensal('2099-12');
  Logger.log(JSON.stringify(resultado, null, 2));
  return resultado;
}
/****************************************************************************************
 * COBERTURA CONFIRMADA DAS DESPESAS — escrita interna (fase de produto, 26/08/2026)
 * --------------------------------------------------------------------------------------
 * MESMO documento, MESMAS garantias, CONCEITO SEPARADO.
 *
 * Vive no bloco `coverage` do documento, ao lado de `months`, e nunca dentro dele. Um
 * CMV e uma cobertura confirmada nao partilham validacao (um e um numero, o outro e um
 * mes), nao partilham semantica (um e um valor que a plataforma nao conhece, o outro e
 * um estado que ela nao consegue apurar) e nao devem partilhar historico.
 *
 * ─── O QUE ESTA CONFIRMACAO SIGNIFICA ──────────────────────────────────────────────
 * "Ate onde o utilizador sabe, os documentos relevantes de despesas desse mes ja estao
 * disponiveis para analise." NAO e fecho contabilistico, NAO e validacao da
 * contabilidade, NAO afirma que os valores estao corretos e NAO afirma que nao existem
 * documentos desconhecidos.
 *
 * ─── SEM HTTP, PELA MESMA RAZAO QUE O CMV ──────────────────────────────────────────
 * Nao existe doPost e nada disto esta exposto na web. O Web App e ANYONE_ANONYMOUS: um
 * endpoint de escrita alcancavel a partir do frontend seria um endpoint de escrita
 * anonimo sobre dados financeiros. Enquanto nao houver autenticacao de utilizador, a
 * escrita acontece quando um operador executa `runConfirmarCoberturaDespesas` no editor
 * do Apps Script, autenticado pela sua propria conta Google.
 *
 * Quando existir autenticacao, o futuro doPost sera um involucro fino sobre
 * `salvarCoberturaConfirmada_` — a validacao, o lock, o backup e o merge ja vivem aqui.
 *
 * ─── NAO PUBLICADO ─────────────────────────────────────────────────────────────────
 * Este bloco existe apenas na fonte local. Producao corre a versao 12, que nao o tem.
 ****************************************************************************************/

/* Fontes cuja cobertura pode ser confirmada. Espelha FONTES_COBERTURA_CONFIRMAVEL do
 * frontend (src/utils/manualCoverage.js). So as contas a pagar: a cobertura dos pedidos
 * deriva do calendario e nao precisa de confirmacao humana. */
var COBERTURA_FONTES = ['payables'];

var ERRO_INVALID_SOURCE = 'INVALID_SOURCE';
var ERRO_FUTURE_MONTH = 'FUTURE_MONTH';

/* ====================================================================================
 * VALIDACAO — funcao PURA. `agora` e injetado: sem relogio implicito, o teste consegue
 * exercer a fronteira do mes sem depender do dia em que corre.
 *
 * A regra que importa: NAO se confirma um mes que ainda nao terminou. Confirmar a
 * cobertura de um mes em curso e afirmar sobre dias que ainda nao aconteceram, e
 * libertaria como completo um periodo que ainda esta a decorrer.
 *
 * Meses ANTERIORES sao aceites de proposito: e assim que se corrige uma confirmacao
 * feita a mais. Um valor que so sobe e um valor que nao se corrige.
 * ==================================================================================== */
function validarCoberturaConfirmada_(entrada, agora) {
  var e = entrada;
  if (!e || typeof e !== 'object' || Object.prototype.toString.call(e) === '[object Array]') {
    return erroAjuste_(ERRO_INVALID_PAYLOAD, 'Pedido tem de ser um objeto.');
  }
  if (COBERTURA_FONTES.indexOf(e.source) === -1) {
    return erroAjuste_(ERRO_INVALID_SOURCE, 'source tem de ser "payables".');
  }
  if (AJUSTES_ACOES.indexOf(e.action) === -1) {
    return erroAjuste_(ERRO_INVALID_PAYLOAD, 'action tem de ser "upsert" ou "delete".');
  }

  var note = null;
  if (e.note !== undefined && e.note !== null) {
    if (typeof e.note !== 'string') {
      return erroAjuste_(ERRO_INVALID_PAYLOAD, 'note tem de ser texto ou nulo.');
    }
    var t = e.note.replace(/^\s+|\s+$/g, '');
    if (t.length > AJUSTES_NOTE_MAX) {
      return erroAjuste_(ERRO_INVALID_PAYLOAD, 'note excede ' + AJUSTES_NOTE_MAX + ' caracteres.');
    }
    note = (t === '') ? null : t;
  }

  if (e.action === 'delete') {
    return okAjuste_({ source: e.source, action: 'delete', note: null });
  }

  if (typeof e.monthKey !== 'string' || !RE_MONTH_KEY_ESCRITA.test(e.monthKey)) {
    return erroAjuste_(ERRO_INVALID_MONTH, 'monthKey tem de ser aaaa-mm com mes entre 01 e 12.');
  }

  // Ultimo mes civil ENCERRADO. O mes corrente nunca esta encerrado.
  var d = (agora instanceof Date) ? agora : new Date();
  var ant = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  var mm = ant.getMonth() + 1;
  var limite = ant.getFullYear() + '-' + (mm < 10 ? '0' + mm : String(mm));
  // Comparacao lexicografica: correta para "aaaa-mm", sem parsing de datas.
  if (e.monthKey > limite) {
    return erroAjuste_(ERRO_FUTURE_MONTH,
      'Nao se confirma a cobertura de um mes que ainda nao terminou (limite: ' + limite + ').');
  }

  return okAjuste_({ source: e.source, action: 'upsert', monthKey: e.monthKey, note: note });
}

/* ====================================================================================
 * MERGE GRANULAR — funcao PURA. Toca apenas em coverage[source]. Tudo o resto do
 * documento e preservado por construcao, incluindo `months` (o CMV) e quaisquer campos
 * de topo desconhecidos.
 * ==================================================================================== */
function aplicarCoberturaNoDocumento_(doc, pedido, agoraIso) {
  if (!doc.coverage || typeof doc.coverage !== 'object') doc.coverage = {};

  if (pedido.action === 'delete') {
    if (doc.coverage[pedido.source] === undefined) {
      return { alterado: false, removido: false };   // idempotente
    }
    delete doc.coverage[pedido.source];
    // Bloco vazio nao fica no documento: um `coverage: {}` afirmaria que alguem mexeu
    // na cobertura e a deixou em branco, quando o que houve foi uma revogacao.
    if (contarChaves_(doc.coverage) === 0) delete doc.coverage;
    doc.updatedAt = agoraIso;
    return { alterado: true, removido: true };
  }

  var anterior = doc.coverage[pedido.source];
  var bloco = {};
  if (anterior && typeof anterior === 'object') {
    var ks = Object.keys(anterior);
    for (var i = 0; i < ks.length; i++) bloco[ks[i]] = anterior[ks[i]];
  }
  bloco.completeThroughMonth = pedido.monthKey;
  bloco.confirmedAt = agoraIso;
  /* PAPEL, nunca pessoa. O documento nao guarda PII: quem confirmou fica no log de
   * execucao do Apps Script, que ja e controlado por conta Google. */
  bloco.confirmedBy = 'user';
  bloco.note = pedido.note;
  doc.coverage[pedido.source] = bloco;
  doc.updatedAt = agoraIso;
  return { alterado: true, removido: false };
}

/* ====================================================================================
 * ORQUESTRACAO. Independente de HTTP, e com as MESMAS garantias da escrita do CMV:
 *
 *   validar -> lock -> resolver ficheiro -> ler -> merge -> backup -> escrever
 *
 * Reutiliza `resolverFicheiroPrincipal_`, `gravarBackupAjustes_` e `depsAjustesReais_`:
 * a resolucao do ficheiro, o backup rotativo e a camada de Drive sao exatamente os
 * mesmos. O que difere e a validacao e o merge, que sao de conceitos distintos.
 * ==================================================================================== */
function salvarCoberturaConfirmada_(entrada, deps) {
  var d = deps || depsAjustesReais_();
  var agora = d.agora();

  var validado = validarCoberturaConfirmada_(entrada, new Date(agora));
  if (!validado.ok) {
    logCobertura_(entrada, validado.error.code);
    return validado;
  }
  var pedido = validado.data;

  var lock = d.obterLock(AJUSTES_LOCK_TIMEOUT_MS);
  if (!lock || !lock.ok) {
    logCobertura_(pedido, ERRO_BUSY);
    return erroAjuste_(ERRO_BUSY,
      'Documento ocupado por outra operacao. Tente novamente dentro de instantes.');
  }

  try {
    var alvo = resolverFicheiroPrincipal_(d);
    if (alvo.estado === 'ambiguo') {
      logCobertura_(pedido, ERRO_DOCUMENT_AMBIGUOUS);
      return erroAjuste_(ERRO_DOCUMENT_AMBIGUOUS,
        'Ha ' + alvo.candidatos + ' ficheiros com o nome do documento. Nenhum foi escolhido.');
    }

    var doc, textoAnterior = null, ficheiro = alvo.ficheiro;

    if (alvo.estado === 'nenhum') {
      if (pedido.action === 'delete') {
        logCobertura_(pedido, 'OK_NOOP');
        return okAjuste_({ companyId: AJUSTES_MANUAIS_COMPANY_ID, source: pedido.source,
          deleted: false, updatedAt: null });
      }
      doc = { companyId: AJUSTES_MANUAIS_COMPANY_ID, updatedAt: null, months: {} };
    } else {
      textoAnterior = d.lerTexto(ficheiro.id);
      var obj = (typeof textoAnterior === 'string') ? safeParse_(textoAnterior) : null;
      if (!ajustesManuaisDocumentoValido_(obj)) {
        logCobertura_(pedido, ERRO_DOCUMENT_CORRUPTED);
        return erroAjuste_(ERRO_DOCUMENT_CORRUPTED,
          'Documento existente ilegivel ou com estrutura invalida. Nada foi escrito.');
      }
      if (obj.companyId !== AJUSTES_MANUAIS_COMPANY_ID) {
        logCobertura_(pedido, ERRO_DOCUMENT_COMPANY_MISMATCH);
        return erroAjuste_(ERRO_DOCUMENT_COMPANY_MISMATCH,
          'O documento existente pertence a outra empresa. Nada foi escrito.');
      }
      doc = obj;
    }

    var res = aplicarCoberturaNoDocumento_(doc, pedido, agora);
    if (!res.alterado) {
      logCobertura_(pedido, 'OK_NOOP');
      return okAjuste_({ companyId: AJUSTES_MANUAIS_COMPANY_ID, source: pedido.source,
        deleted: false, updatedAt: doc.updatedAt || null });
    }

    if (textoAnterior !== null) {
      var bak = gravarBackupAjustes_(d, textoAnterior);
      if (!bak.ok) { logCobertura_(pedido, bak.error.code); return bak; }
    }

    var novoTexto = JSON.stringify(doc);
    var criado = null;
    try {
      if (ficheiro) d.escreverTexto(ficheiro.id, novoTexto);
      else criado = d.criarFicheiro(AJUSTES_MANUAIS_FILE_NAME, novoTexto);
    } catch (err) {
      logCobertura_(pedido, ERRO_WRITE_FAILED);
      return erroAjuste_(ERRO_WRITE_FAILED, 'Nao foi possivel gravar o documento.');
    }
    if (criado) guardarFileIdBestEffort_(d, criado.id);

    logCobertura_(pedido, 'OK');
    if (pedido.action === 'delete') {
      return okAjuste_({ companyId: AJUSTES_MANUAIS_COMPANY_ID, source: pedido.source,
        deleted: true, updatedAt: agora });
    }
    return okAjuste_({ companyId: AJUSTES_MANUAIS_COMPANY_ID, source: pedido.source,
      completeThroughMonth: pedido.monthKey, updatedAt: agora });

  } finally {
    try { lock.release(); } catch (e) { /* lock ja libertado */ }
  }
}

/* Log operacional. O mes NAO e segredo (nao e um valor financeiro) e e o que torna o
 * registo util. A nota nao entra: e texto livre do utilizador. */
function logCobertura_(pedido, resultado) {
  var p = pedido || {};
  safeLog_('Cobertura confirmada | empresa: ' + AJUSTES_MANUAIS_COMPANY_ID +
    ' | fonte: ' + (p.source || '(invalida)') +
    ' | mes: ' + (p.monthKey || '(n/a)') +
    ' | accao: ' + (p.action || '(invalida)') +
    ' | resultado: ' + resultado +
    ' | em: ' + new Date().toISOString());
}

/* ====================================================================================
 * WRAPPERS PARA O EDITOR. E por aqui que um operador confirma a cobertura hoje.
 * ==================================================================================== */
function runConfirmarCoberturaDespesas(monthKey, note) {
  var r = salvarCoberturaConfirmada_({
    source: 'payables', action: 'upsert', monthKey: monthKey, note: note || null
  });
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}

/* REVOGAR. Apaga o bloco de cobertura: a cobertura volta a ser a de company.js. E o
 * caminho de correcao para uma confirmacao feita por engano — a par de simplesmente
 * confirmar outro mes, que tambem e permitido. */
function runRevogarCoberturaDespesas() {
  var r = salvarCoberturaConfirmada_({ source: 'payables', action: 'delete' });
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}

/* EDITAR antes de executar. O mes tem de ser um mes JA ENCERRADO. */
function runExemploConfirmarCobertura() {
  return runConfirmarCoberturaDespesas('2026-07', 'Documentos de despesas de julho recebidos');
}
