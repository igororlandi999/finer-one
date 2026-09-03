/****************************************************************************************
 * Finer One — Backend intermediário (Google Apps Script)
 * --------------------------------------------------------------------------------------
 * Expõe um endpoint GET que devolve os pedidos de venda reais da Overcel (Bling API v3)
 * no formato que o front já aceita: { "data": [ ... ] }.
 *
 * FASE 1 (integridade histórica):
 *   - O rebuild deixou de SUBSTITUIR o snapshot pela janela de 90 dias. Agora consolida
 *     historico anterior + janela atualizada via mergePedidosSnapshot() (funcao pura).
 *   - Nenhum pedido histórico é apagado. Pedidos da janela ATUALIZAM a versão anterior.
 *   - Um pedido já hidratado (com itens) nunca é substituído por versão sem itens.
 *   - normalizePedido_ passa a preservar campos extra necessários à DRE (Fase 2),
 *     sem inventar nada: só grava o que o Bling devolver.
 *
 * Ordem de uso (uma vez):
 *   1) setCredentials_()             -> grava client_id / client_secret / redirect_uri
 *   2) Publicar como App da Web      -> obter a URL .../exec e usá-la como redirect_uri
 *   3) buildAuthUrl_()               -> abrir a URL no navegador (logado na Overcel)
 *   4) Definir Script Property BLING_AUTH_CODE com o "code" devolvido
 *   5) exchangeAuthorizationCode_()  -> troca o code por tokens e guarda
 *   6) Abrir .../exec no navegador   -> deve devolver { "data": [ ... ] }
 ****************************************************************************************/

var BLING_API_BASE = 'https://api.bling.com.br/Api/v3';
var BLING_AUTHORIZE = 'https://www.bling.com.br/Api/v3/oauth/authorize';
var BLING_TOKEN_URL = 'https://api.bling.com.br/Api/v3/oauth/token';
var TOKEN_SKEW_MS = 60 * 1000;   // renova 60s antes de expirar
var PAGE_LIMIT = 100;         // limite por página (máx. do Bling)
var MAX_PAGES = 50;          // trava de segurança contra loop infinito
var DEFAULT_DAYS = 90;          // janela ATUALIZADA a cada rebuild (o histórico é preservado)

var SNAPSHOT_FILE_NAME = 'finer_one_pedidos_snapshot.json';
var SNAPSHOT_CORROMPIDO_SUFIXO = '.corrompido.json';
var DETAIL_THROTTLE_MS = 500;             // throttle entre chamadas de detalhe (~2 req/s)
var REBUILD_TIME_BUDGET_MS = 5 * 60 * 1000;   // orçamento por execução (limite do GAS ~6 min)
var SNAPSHOT_TIMEZONE = 'America/Sao_Paulo';  // fuso do gatilho diário

/* ====================================================================================
 * RATE LIMIT DO BLING — o limite publicado é de 3 pedidos por SEGUNDO por conta.
 *
 * Porque isto existe: DETAIL_THROTTLE_MS só espaça o laço de DETALHE. As LISTAGENS
 * (paginação de /contas/pagar, /contas/receber, /pedidos/vendas) e os mapas de apoio
 * (/formas-pagamentos, /categorias/receitas-despesas) disparam em rajada, sem pausa
 * nenhuma entre chamadas. Na madrugada de 2026-08-23 essa rajada rebentou o limite:
 * 4 pedidos dentro do mesmo segundo e HTTP 429 em /formas-pagamentos, no rebuild de
 * despesas das 02:05. A execução das 00:48, com a mesma sequência, escapou por sorte.
 *
 * Duas defesas, deliberadamente independentes:
 *   1) ESPAÇAMENTO (blingEsperaAntesDaChamadaMs_): impede a rajada. Custa ~350ms por
 *      chamada e evita o 429 em vez de o remediar.
 *   2) BACKOFF (blingDeveRepetirPorRateLimit_): recupera se mesmo assim acontecer —
 *      o relógio do Bling não é o nosso e há outras integrações na mesma conta.
 *
 * O backoff repete SÓ em 429 e SÓ até um teto duro. Qualquer outro código de estado
 * continua a rebentar imediatamente, com a mensagem original: mascarar um 401, um 404
 * ou um 500 atrás de tentativas seria pior do que não ter backoff nenhum.
 * ==================================================================================== */
var BLING_HTTP_RATE_LIMIT = 429;
var BLING_MIN_INTERVAL_MS = 350;          // 1000/3 = 333ms; 350 dá margem ao relógio
var BLING_RATE_LIMIT_MAX_RETRIES = 3;     // teto duro: nunca há ciclo infinito
var BLING_RATE_LIMIT_BACKOFF_MS = 1100;   // >1s: a janela do Bling é por segundo

/* Instante da última chamada. Vive no escopo da execução — o Apps Script recria o
 * ambiente a cada execução, portanto não há estado a limpar entre gatilhos. */
var blingUltimaChamadaMs_ = 0;

/* PURA. Quanto falta esperar para respeitar o intervalo mínimo entre chamadas.
 * Devolve 0 quando não há espera a fazer (primeira chamada, ou já passou tempo
 * suficiente). Nunca devolve negativo. */
function blingEsperaAntesDaChamadaMs_(agoraMs, ultimaChamadaMs, intervaloMs) {
  if (!ultimaChamadaMs) return 0;
  var decorrido = Number(agoraMs) - Number(ultimaChamadaMs);
  if (!(decorrido >= 0)) return 0;   // relógio recuou: não inventa espera
  var falta = Number(intervaloMs) - decorrido;
  return falta > 0 ? falta : 0;
}

/* PURA. Repete SÓ em 429 e SÓ enquanto houver tentativas por gastar. */
function blingDeveRepetirPorRateLimit_(codigoHttp, tentativasFeitas, maxTentativas) {
  if (Number(codigoHttp) !== BLING_HTTP_RATE_LIMIT) return false;
  return Number(tentativasFeitas) < Number(maxTentativas);
}

/* PURA. Backoff linear crescente: 1100, 2200, 3300 ms. Linear e não exponencial de
 * propósito — o limite do Bling é por segundo, não uma sobrecarga de servidor, e o
 * orçamento de execução do Apps Script é de 6 minutos. */
function blingBackoffMs_(tentativa, baseMs) {
  var n = Number(tentativa);
  if (!(n >= 1)) return 0;
  return Number(baseMs) * n;
}

/* ====================================================================================
 * P0 — ZERO REAL vs. ZERO POR FALHA.
 *
 * Um rebuild que recebe uma listagem vazia tem duas leituras possíveis e opostas:
 *   (a) a empresa realmente não tem títulos — zero é o dado correto;
 *   (b) alguma coisa correu mal a montante e o zero é o sintoma.
 *
 * O caminho (b) é real e não é hipotético: blingGet_ devolve o resultado de
 * safeParse_, que engolia um corpo ilegível num `null` silencioso. Um HTTP 200 com
 * corpo inválido produzia `res = null` -> `lote = []` -> laço de paginação a parar
 * na primeira página -> snapshot inteiro reescrito com `data: []`. Sem exceção,
 * sem aviso, e com o snapshot bom já perdido.
 *
 * Regra: zero só substitui o snapshot anterior quando NÃO havia nada antes. Havendo
 * histórico, uma listagem vazia é tratada como suspeita e o rebuild aborta SEM gravar.
 * Preferimos um snapshot de ontem a um snapshot vazio de hoje: o primeiro está velho,
 * o segundo está errado, e só o segundo é irrecuperável.
 *
 * Isto NÃO impede uma empresa de chegar legitimamente a zero títulos: impede que lá
 * chegue por acidente, num único rebuild, sem deixar rasto. Um zero real e persistente
 * exige limpar/apagar o snapshot à mão — uma ação deliberada, que é exatamente o que
 * uma perda total de dados devia exigir.
 *
 * PURA: sem rede, sem Drive, sem relógio.
 * ==================================================================================== */
function podeGravarListagemVazia_(totalRecebido, totalAnterior) {
  if (Number(totalRecebido) > 0) return true;   // não está vazio: sempre grava
  return !(Number(totalAnterior) > 0);          // vazio: só grava se antes também era
}

/* ====================================================================================
 * SHAPE DA LISTAGEM — o `data` de um endpoint de lista tem de ser uma lista.
 *
 * Sem esta verificação, um `data` que venha objeto (um {error:...} embrulhado, uma
 * mudança de contrato do Bling) passava despercebido de uma forma peculiarmente má:
 * `lote.length` fica undefined, o `for` não corre, e `undefined < PAGE_LIMIT` é FALSO
 * — portanto o `break` da paginação nunca dispara e o laço vai até MAX_PAGES, a gastar
 * 50 chamadas contra o rate limit para não recolher nada. O snapshot ficava protegido
 * pela guarda de listagem vazia, mas só depois de queimar o orçamento todo em silêncio.
 *
 * Ausência de `data` continua a valer lista vazia: é o comportamento antigo, está
 * coberto pela guarda, e transformá-lo em erro arriscaria partir uma última página
 * legitimamente vazia. O que muda é só o caso impossível — `data` presente e não-lista.
 *
 * PURA: sem rede, sem Drive, sem relógio.
 * ==================================================================================== */
function loteDaListagem_(res, path) {
  var d = (res && res.data != null) ? res.data : null;
  if (d === null) return [];
  if (!Array.isArray(d)) {
    throw new Error('Bling GET ' + path + ' devolveu `data` que nao e uma lista (tipo ' +
      (typeof d) + '). Contrato da listagem quebrado; rebuild abortado sem gravar.');
  }
  return d;
}

/* ====================================================================================
 * PAGINACAO: FIM NATURAL vs TETO DE SEGURANCA — funcao PURA, sem rede e sem relogio.
 *
 * ─── PORQUE ISTO EXISTE ────────────────────────────────────────────────────────────
 * Todos os laços de paginação deste projeto têm a mesma forma:
 *
 *     while (pagina <= MAX_PAGES) { ...; if (lote.length < PAGE_LIMIT) break; pagina++; }
 *
 * e param por UMA DE DUAS razões que o código não distinguia:
 *
 *   A) FIM NATURAL   — a última página veio INCOMPLETA. Não há mais nada no Bling.
 *                      O dataset está completo. É o caso normal.
 *   B) TETO MAX_PAGES — a última página veio CHEIA e o laço acabou por trava de
 *                      segurança. Existem títulos do lado de lá que nunca foram lidos,
 *                      e não há como saber quantos.
 *
 * Só (B) é truncamento. Até aqui, (A) e (B) produziam exatamente o mesmo snapshot e a
 * mesma meta: um conjunto truncado era indistinguível de um conjunto completo, em
 * silêncio, em toda a cadeia até aos KPIs. `/contas/pagar` e `/contas/receber` são
 * listados SEM filtro de data e crescem monotonicamente — com PAGE_LIMIT 100 e
 * MAX_PAGES 50, o teto de 5000 títulos é atingível por acumulação, não por acidente.
 *
 * ─── O QUE ISTO NAO DECIDE ─────────────────────────────────────────────────────────
 * Diz que a LEITURA foi truncada. Não diz quantos títulos faltam (indeterminável), nem
 * se o que falta é material (isso seria uma política, e não há política de
 * materialidade neste projeto). O único uso legítimo é vetar a afirmação "completo".
 * ==================================================================================== */
function paginacaoTruncada_(paginasLidas, ultimoLoteLength, pageLimit, maxPages) {
  return Number(paginasLidas) >= Number(maxPages) && Number(ultimoLoteLength) >= Number(pageLimit);
}

/* ====================================================================================
 * TERMINACAO PREMATURA — a queda massiva que a guarda de listagem vazia nao apanha.
 *
 * ─── O DEFEITO, MEDIDO ─────────────────────────────────────────────────────────────
 * `podeGravarListagemVazia_` pergunta "veio vazio?". So isso. Uma listagem que traga 5
 * titulos onde ontem havia 1390 NAO vem vazia, portanto passa — e o snapshot bom e
 * substituido por um quase vazio, sem excecao e sem aviso. Esta lacuna estava fixada
 * em teste, de proposito, para ser visivel em vez de silenciosa.
 *
 * O caminho e concreto: o laco termina em `if (lote.length < PAGE_LIMIT) break;`. Uma
 * pagina que devolva 47 titulos em vez de 100, por qualquer motivo transitorio,
 * ENCERRA A PAGINACAO como se fosse a ultima pagina.
 *
 * ─── PORQUE E ESTA A ESTRATEGIA, E NAO UM LIMIAR ───────────────────────────────────
 * A medicao de 2026-08-23 (docs/INTEGRIDADE_SNAPSHOT_ESTRATEGIAS.md) comparou dois
 * snapshots de contas a pagar com 9,1 dias de intervalo: ZERO titulos desapareceram.
 * Titulos liquidados mudam de situacao e CONTINUAM na listagem. A listagem e
 * append-only na pratica.
 *
 * Isso desfaz a suposicao que justificaria um limiar percentual ("quedas legitimas sao
 * normais, portanto so bloqueamos quedas grandes"). Mas escolher o K de "bloquear
 * quando novo < anterior - K" continua a ser uma DECISAO DE NEGOCIO: apagar um titulo
 * lancado por engano e legitimo e produz uma queda de 1.
 *
 * Esta guarda nao tem limiar nenhum e nao pede decisao nenhuma. Ataca a CAUSA medida
 * (terminacao precoce) em vez do sintoma (contagem baixa), e por isso deteta um
 * truncamento de 1% tao bem como um de 99% — que nenhum limiar percentual apanharia.
 *
 * ─── O QUE ISTO NAO COBRE ──────────────────────────────────────────────────────────
 * Nao cobre a API a devolver paginas completas com conteudo errado, nem um colapso
 * consistente do lado do Bling. Se a falha for persistente, a sonda tambem falha — e o
 * resultado e abortar. Falha fechado, que e o lado certo.
 *
 * PURA: sem rede, sem Drive, sem relogio. Quem faz a chamada da sonda e o paginador.
 * ==================================================================================== */
function terminacaoPrematura_(ultimoLoteLength, pageLimit, sondaLength) {
  /* So ha terminacao prematura quando o laco parou por FIM NATURAL (ultima pagina
   * incompleta). Se a ultima pagina veio cheia, o laco parou no teto MAX_PAGES — isso
   * e truncamento, ja medido por paginacaoTruncada_, e nao se conta duas vezes. */
  if (Number(ultimoLoteLength) >= Number(pageLimit)) return false;
  // Fim natural verdadeiro: a pagina seguinte nao tem nada. Ter alguma coisa prova que
  // a paginacao parou antes do fim.
  return Number(sondaLength) > 0;
}

/* ====================================================================================
 * RECURSOS SUPORTADOS pelo doGet. Lista única: o doGet valida contra ela e a resposta
 * de erro publica-a, para o cliente saber o que existe sem adivinhar.
 * 'pedidos' é o comportamento por omissão e está aqui como ALIAS explícito: quem
 * escrever ?recurso=pedidos recebe pedidos, tal como quem não escreve recurso nenhum.
 * ==================================================================================== */
var RECURSOS_SUPORTADOS = ['pedidos', 'despesas', 'recebiveis', 'ajustes-manuais'];

/* PURA. Um recurso está PRESENTE se o cliente escreveu alguma coisa. Ausente, vazio ou
 * só espaços é omissão — e omissão significa pedidos, como sempre significou. */
function recursoPresente_(valor) {
  if (valor === null || valor === undefined) return false;
  return String(valor).trim() !== '';
}

/* PURA. Conhecido = está na lista. Comparação exata depois de aparar espaços; NÃO
 * normaliza acentos nem maiúsculas de propósito: o contrato do parâmetro é literal e
 * um ?recurso=Despesas é um erro do cliente que vale a pena ver, não adivinhar. */
function recursoConhecido_(valor) {
  var v = String(valor === null || valor === undefined ? '' : valor).trim();
  for (var i = 0; i < RECURSOS_SUPORTADOS.length; i++) {
    if (RECURSOS_SUPORTADOS[i] === v) return true;
  }
  return false;
}

/* ====================================================================================
 * 1) doGet(e) — entrada do Web App. Contrato público inalterado: { data: [...] }.
 * ==================================================================================== */
function doGet(e) {
  try {
    var p = (e && e.parameter) ? e.parameter : {};

    /* CALLBACK OAuth. Só dispara com `code` presente — nenhum dos quatro recursos o
     * envia, portanto esta guarda não os pode alcançar. Ver serveOauthCallback_. */
    if (p.code) {
      return serveOauthCallback_(p);
    }

    if (p.recurso === 'despesas') {
      return serveDespesas_(p);
    }
    if (p.recurso === 'recebiveis') {
      return serveRecebiveis_(p);
    }
    // Ajustes manuais (CMV e rubricas futuras). Tem de ficar ANTES do fallback de
    // pedidos: sem esta rota, ?recurso=ajustes-manuais cai no ramo por omissão e
    // devolve o snapshot de PEDIDOS. Implementação em AjustesManuaisBackend.gs.
    if (p.recurso === 'ajustes-manuais') {
      return serveAjustesManuais_(p);
    }

    /* RECURSO DESCONHECIDO — falha alto, em vez de servir a coisa errada em silêncio.
     *
     * Antes desta guarda, QUALQUER valor não reconhecido caía no ramo por omissão e
     * devolvia o snapshot de PEDIDOS com HTTP 200. Uma gralha (?recurso=depesas), um
     * recurso ainda não implantado ou um cliente mais novo do que o backend recebiam
     * 1071 pedidos onde esperavam contas a pagar — e nada, em lado nenhum, dizia que
     * a resposta não correspondia ao pedido. É a pior classe de erro: silencioso,
     * plausível e do tipo certo.
     *
     * COMPATIBILIDADE: só rejeita um recurso PRESENTE e DESCONHECIDO. Recurso omitido,
     * vazio, ou explicitamente 'pedidos' continuam a servir pedidos exatamente como
     * antes — é esse o contrato que o front e o check:data usam hoje.
     *
     * O corpo mantém HTTP 200 porque o ContentService do Apps Script não permite
     * escolher o código de estado; o erro viaja no payload, no mesmo formato de
     * errorOut_ (error: true), com um campo code estável para o cliente distinguir. */
    if (recursoPresente_(p.recurso) && !recursoConhecido_(p.recurso)) {
      safeLog_('Recurso desconhecido pedido: ' + sanitize_(String(p.recurso)));
      return jsonOut_({
        error: true,
        code: 'RECURSO_DESCONHECIDO',
        message: 'Recurso nao reconhecido.',
        recursosSuportados: RECURSOS_SUPORTADOS.slice()
      });
    }

    var snap = readPedidosSnapshot_();
    if (snap && snap.data && snap.data.length > 0) {
      safeLog_('Servindo do snapshot. Pedidos: ' + snap.data.length +
        (snap.meta ? (' | gerado ' + snap.meta.geradoEm + (snap.meta.parcial ? ' (parcial)' : '')) : ''));
      return jsonOut_({ data: snap.data, meta: snap.meta || null });
    }

    var hoje = new Date();
    var dataFinal = p.dataFinal || formatDateISO_(hoje);
    var dataInicial = p.dataInicial || formatDateISO_(addDays_(hoje, -DEFAULT_DAYS));

    safeLog_('Snapshot ausente. Fallback ao vivo | periodo ' + dataInicial + ' a ' + dataFinal + ' (sem itens).');

    var data = fetchPedidosVendas_(dataInicial, dataFinal);
    return jsonOut_({ data: data });

  } catch (err) {
    return errorOut_(err);
  }
}

/* ====================================================================================
 * 2) setCredentials_() — manual. Edite os 3 valores e rode UMA vez.
 * ==================================================================================== */
function setCredentials_() {
  var CLIENT_ID = 'COLE_AQUI_O_CLIENT_ID';
  var CLIENT_SECRET = 'COLE_AQUI_O_CLIENT_SECRET';
  var REDIRECT_URI = 'COLE_AQUI_A_URL_EXEC_DO_WEB_APP';

  if (CLIENT_ID.indexOf('COLE_AQUI') === 0 ||
    CLIENT_SECRET.indexOf('COLE_AQUI') === 0 ||
    REDIRECT_URI.indexOf('COLE_AQUI') === 0) {
    throw new Error('Preencha CLIENT_ID, CLIENT_SECRET e REDIRECT_URI antes de rodar.');
  }

  setProps_({
    BLING_CLIENT_ID: CLIENT_ID,
    BLING_CLIENT_SECRET: CLIENT_SECRET,
    BLING_REDIRECT_URI: REDIRECT_URI
  });
  safeLog_('Credenciais gravadas (client_id e redirect_uri definidos; secret nao exibido).');
}

/* ====================================================================================
 * 3) buildAuthUrl_() — gera a URL de autorização OAuth.
 * ==================================================================================== */
function buildAuthUrl_() {
  var clientId = getProp_('BLING_CLIENT_ID');
  var redirect = getProp_('BLING_REDIRECT_URI');
  if (!clientId || !redirect) throw new Error('Rode setCredentials_() primeiro.');

  /* STATE — deixa de ser decorativo.
   *
   * Era 'finerone_' + Date.now(): gerado, enviado, ecoado de volta e nunca verificado.
   * Enquanto a troca do code era manual, isso passava: havia um humano a olhar para o
   * callback antes de agir. A partir do momento em que o callback troca sozinho, essa
   * verificação humana desaparece — e o Web App é ANYONE_ANONYMOUS.
   *
   * Sem validar o state, qualquer pessoa que alcance a URL de /exec com um `?code=` seu
   * faria este script trocar o code DELA por tokens e guardá-los: as leituras passariam
   * a vir da conta Bling do atacante. Não é fuga de dados — é substituição da fonte
   * financeira, que é pior, porque parece funcionar.
   *
   * Passa a ser aleatório (getUuid, não o relógio), guardado, com prazo, e de uso único.
   */
  var state = Utilities.getUuid();
  setProps_({
    BLING_OAUTH_STATE: state,
    BLING_OAUTH_STATE_AT: String(Date.now())
  });

  var url = BLING_AUTHORIZE +
    '?response_type=code' +
    '&client_id=' + encodeURIComponent(clientId) +
    '&redirect_uri=' + encodeURIComponent(redirect) +
    '&state=' + encodeURIComponent(state);

  Logger.log('Abra esta URL no navegador (logado na conta Overcel):');
  Logger.log(url);
  return url;
}

/* ====================================================================================
 * 4) exchangeAuthorizationCode_() — troca o code inicial por tokens.
 * ==================================================================================== */
/* ====================================================================================
 * TROCA DO AUTHORIZATION CODE.
 *
 * O code do Bling vive SESSENTA SEGUNDOS ("o prazo para realizar esta requisição é de
 * 1 minuto", documentação oficial). O caminho manual — copiar do callback, abrir as
 * propriedades do script, colar, guardar, voltar ao editor, executar — não cabe nesse
 * orçamento: três tentativas, três `invalid_grant / has expired`, a última já provada
 * com um code novo e limpo por impressão digital.
 *
 * Por isso o núcleo passa a receber o code por ARGUMENTO. Quem o tem primeiro é o
 * callback, e é lá que a troca acontece, sem humano no meio.
 * ==================================================================================== */
function trocarCodePorTokens_(code) {
  /* .trim(): o valor podia vir de uma colagem manual. Um espaço invisível dava um
   * invalid_grant indistinguível de um code expirado — e passámos uma sessão a
   * perseguir exatamente essa ambiguidade. */
  var limpo = String(code === null || code === undefined ? '' : code).trim();
  if (!limpo) throw new Error('Authorization code ausente.');

  var json = postToken_({ grant_type: 'authorization_code', code: limpo });
  saveTokens_(json);
  safeLog_('Tokens salvos com sucesso (access/refresh guardados; nao exibidos).');
}

/* Caminho MANUAL, mantido como recurso de recurso. Já não é o caminho normal — o
 * callback trata disso — mas continua a funcionar se alguém precisar dele. */
function exchangeAuthorizationCode_() {
  var code = getProp_('BLING_AUTH_CODE');
  if (!code) {
    throw new Error('Grave a Script Property BLING_AUTH_CODE com o code antes de rodar.');
  }

  trocarCodePorTokens_(code);

  PropertiesService.getScriptProperties().deleteProperty('BLING_AUTH_CODE');
}

/* ====================================================================================
 * CALLBACK OAuth — o Bling redireciona para cá com ?code=&state=, e a troca acontece
 * aqui, no mesmo instante. Latência humana: zero.
 *
 * ORDEM DAS GUARDAS, e porquê esta ordem:
 *   1) LOCK      — duas execuções simultâneas do mesmo callback não podem trocar o
 *                  mesmo code duas vezes.
 *   2) STATE     — recusa um callback que este script não pediu. Antes de tocar no code.
 *   3) MARCA     — o code é marcado (por HASH) ANTES da troca. Um refresh do browser ou
 *                  um re-pedido da mesma URL não reenvia o code.
 *   4) TROCA     — só aqui o code sai daqui para o Bling.
 *
 * A marca vem antes da troca de propósito. O Bling revoga o utilizador quando um code
 * válido é usado duas vezes ("por medidas de segurança o usuário vinculado ao code terá
 * o seu acesso revogado"). Marcar depois deixaria essa janela aberta a um duplo clique.
 *
 * A resposta ao browser é sempre uma mensagem. Nunca o code, nunca os tokens.
 * ==================================================================================== */
var OAUTH_STATE_TTL_MS = 15 * 60 * 1000;  // prazo para concluir a autorização
var OAUTH_MARCA_TTL_S = 600;              // memória anti-reenvio do mesmo code

function serveOauthCallback_(p) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return jsonOut_({ oauth: true, ok: false, erro: 'OCUPADO',
      message: 'Outra autorizacao esta em curso. Tente novamente.' });
  }

  try {
    if (!estadoOAuthCorresponde_(p.state, getProp_('BLING_OAUTH_STATE'),
                                 Number(getProp_('BLING_OAUTH_STATE_AT') || 0),
                                 Date.now(), OAUTH_STATE_TTL_MS)) {
      safeLog_('Callback OAuth RECUSADO: state ausente, desconhecido ou fora de prazo.');
      return jsonOut_({ oauth: true, ok: false, erro: 'STATE_INVALIDO',
        message: 'Pedido de autorizacao nao reconhecido. Gere uma nova URL com runBuildAuthUrl.' });
    }

    var marca = 'oauth_' + oauthSha256Hex_(p.code).slice(0, 32);
    var cache = CacheService.getScriptCache();
    if (cache.get(marca)) {
      safeLog_('Callback OAuth ignorado: este code ja foi processado.');
      return jsonOut_({ oauth: true, ok: false, erro: 'CODE_JA_PROCESSADO',
        message: 'Este pedido ja foi processado. Nao recarregue esta pagina.' });
    }
    cache.put(marca, '1', OAUTH_MARCA_TTL_S);

    trocarCodePorTokens_(p.code);

    /* State de uso único: consumido só depois de a troca resultar. */
    PropertiesService.getScriptProperties().deleteProperty('BLING_OAUTH_STATE');
    PropertiesService.getScriptProperties().deleteProperty('BLING_OAUTH_STATE_AT');

    safeLog_('Callback OAuth concluido com sucesso. Tokens renovados.');
    return jsonOut_({ oauth: true, ok: true,
      message: 'Autorizacao concluida. Pode fechar esta pagina.' });

  } catch (e) {
    var c = oauthClassificarErro_(e);
    safeLog_('Callback OAuth falhou: ' + c.erro + ' (HTTP ' + c.httpStatus + ').');
    return jsonOut_({ oauth: true, ok: false, erro: c.erro, httpStatus: c.httpStatus,
      message: 'Nao foi possivel concluir a autorizacao. Gere uma nova URL e repita.' });
  } finally {
    lock.releaseLock();
  }
}

/* PURA. O state recebido tem de existir, bater exatamente com o guardado e estar dentro
 * do prazo. Ausência de qualquer um dos lados é recusa — nunca "deixa passar". */
function estadoOAuthCorresponde_(recebido, guardado, guardadoEmMs, agoraMs, ttlMs) {
  if (!recebido || !guardado) return false;
  if (String(recebido) !== String(guardado)) return false;
  if (!guardadoEmMs || guardadoEmMs <= 0) return false;
  var idade = agoraMs - guardadoEmMs;
  if (idade < 0) return false;              // relógio a andar para trás: recusa
  return idade <= ttlMs;
}

/* PURA. Classificação segura do erro da troca. O corpo cru NUNCA sai daqui: numa falha
 * de postToken_ ele traz a resposta do Bling. */
function oauthClassificarErro_(e) {
  var msg = (e && e.message) ? String(e.message) : '';
  var m = msg.match(/HTTP (\d+)/);
  var status = m ? Number(m[1]) : null;

  var codigo;
  if (/already been used|has already/i.test(msg)) codigo = 'CODE_JA_USADO_UTILIZADOR_REVOGADO';
  else if (/has expired|expired/i.test(msg)) codigo = 'CODE_EXPIRADO';
  else if (/invalid_client/i.test(msg)) codigo = 'CREDENCIAIS_INVALIDAS';
  else if (/Empresa inativa/i.test(msg)) codigo = 'EMPRESA_INATIVA';
  else if (/invalid_grant/i.test(msg)) codigo = 'GRANT_INVALIDO';
  else if (/Authorization code ausente/i.test(msg)) codigo = 'CODE_AUSENTE';
  else codigo = 'ERRO';

  return { erro: codigo, httpStatus: status };
}

/* SHA-256 em hexadecimal. Serve só para MARCAR um code sem o guardar: o que fica em
 * cache é o hash, nunca o code. Nome prefixado para não colidir com o homónimo do
 * ficheiro de diagnóstico temporário — no Apps Script todos os ficheiros partilham o
 * mesmo espaço global, e um nome repetido é substituído em silêncio. */
function oauthSha256Hex_(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s));
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = (bytes[i] + 256) % 256;
    hex += (b < 16 ? '0' : '') + b.toString(16);
  }
  return hex;
}

/* ====================================================================================
 * 5) ensureAccessToken_() / 6) refreshAccessToken_()
 * ==================================================================================== */
function ensureAccessToken_() {
  var token = getProp_('BLING_ACCESS_TOKEN');
  var expiresAt = Number(getProp_('BLING_TOKEN_EXPIRES_AT') || 0);

  if (token && Date.now() < (expiresAt - TOKEN_SKEW_MS)) {
    return token;
  }
  return refreshAccessToken_();
}

function refreshAccessToken_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var token = getProp_('BLING_ACCESS_TOKEN');
    var expiresAt = Number(getProp_('BLING_TOKEN_EXPIRES_AT') || 0);
    if (token && Date.now() < (expiresAt - TOKEN_SKEW_MS)) {
      return token;
    }

    var refresh = getProp_('BLING_REFRESH_TOKEN');
    if (!refresh) {
      throw new Error('refresh_token ausente. Refaca o fluxo OAuth (buildAuthUrl_ + exchange).');
    }

    var json = postToken_({ grant_type: 'refresh_token', refresh_token: refresh });
    saveTokens_(json);
    safeLog_('Access token renovado. Validade (s): ' + (json.expires_in || 21600));
    return getProp_('BLING_ACCESS_TOKEN');

  } finally {
    lock.releaseLock();
  }
}

/* ====================================================================================
 * 7) blingGet_() — GET autenticado. Em 401, força refresh e tenta de novo uma vez.
 * ==================================================================================== */
function blingGet_(path, params) {
  var url = BLING_API_BASE + path + buildQuery_(params);

  var doFetch = function (token) {
    return UrlFetchApp.fetch(url, {
      method: 'get',
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', 'enable-jwt': '1' },
      muteHttpExceptions: true
    });
  };

  /* Espaçamento: impede a rajada que rebenta o limite de 3 req/s. */
  var chamar = function (tok) {
    var espera = blingEsperaAntesDaChamadaMs_(Date.now(), blingUltimaChamadaMs_, BLING_MIN_INTERVAL_MS);
    if (espera > 0) Utilities.sleep(espera);
    blingUltimaChamadaMs_ = Date.now();
    return doFetch(tok);
  };

  var token = ensureAccessToken_();
  var res = chamar(token);

  if (res.getResponseCode() === 401) {
    safeLog_('HTTP 401 recebido. Forcando refresh e repetindo a chamada uma vez.');
    token = refreshAccessToken_();
    res = chamar(token);
  }

  /* Backoff SÓ para 429, com teto duro. Qualquer outro código sai pelo throw abaixo,
   * inalterado — o backoff não pode mascarar erros que não são de rate limit. */
  var tentativas = 0;
  while (blingDeveRepetirPorRateLimit_(res.getResponseCode(), tentativas, BLING_RATE_LIMIT_MAX_RETRIES)) {
    tentativas++;
    var backoff = blingBackoffMs_(tentativas, BLING_RATE_LIMIT_BACKOFF_MS);
    safeLog_('HTTP 429 em ' + path + ' (limite de 3 req/s do Bling). Backoff ' + backoff +
      'ms, tentativa ' + tentativas + '/' + BLING_RATE_LIMIT_MAX_RETRIES + '.');
    Utilities.sleep(backoff);
    res = chamar(token);
  }
  if (tentativas > 0 && res.getResponseCode() >= 200 && res.getResponseCode() < 300) {
    safeLog_('HTTP 429 recuperado em ' + path + ' apos ' + tentativas + ' tentativa(s).');
  }

  var code = res.getResponseCode();
  var body = res.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('Bling GET ' + path + ' falhou (HTTP ' + code + '): ' + sanitize_(body));
  }
  /* Um 2xx com corpo ilegível é uma FALHA, não uma resposta vazia. Devolver null aqui
   * fazia o chamador ver `res.data` indefinido, tratar como lote vazio e — no caso das
   * listagens — reescrever o snapshot com zero títulos. Rebenta com mensagem clara. */
  var parsed = safeParse_(body);
  if (parsed === null) {
    throw new Error('Bling GET ' + path + ' devolveu HTTP ' + code +
      ' com corpo ilegivel (JSON invalido, ' + (body ? body.length : 0) + ' bytes).');
  }
  return parsed;
}

/* ====================================================================================
 * 8) fetchPedidosVendas_() — pagina /pedidos/vendas e normaliza.
 * ==================================================================================== */
function fetchPedidosVendas_(dataInicial, dataFinal) {
  var todos = [];
  var pagina = 1;
  var paginasLidas = 0;
  var ultimoLote = 0;

  while (pagina <= MAX_PAGES) {
    var res = blingGet_('/pedidos/vendas', {
      pagina: pagina,
      limite: PAGE_LIMIT,
      dataInicial: dataInicial,
      dataFinal: dataFinal
    });

    var lote = loteDaListagem_(res, '/pedidos/vendas');
    paginasLidas++;
    ultimoLote = lote.length;
    safeLog_('Pagina ' + pagina + ': ' + lote.length + ' pedidos.');

    for (var i = 0; i < lote.length; i++) {
      todos.push(normalizePedido_(lote[i]));
    }

    if (lote.length < PAGE_LIMIT) break;
    pagina++;
  }

  /* Propriedades ADITIVAS no array: invisíveis para todos os `for` e `.length` que já o
   * percorrem, e evitam mudar a assinatura de todos os chamadores. Mesmo padrão já
   * usado em fetchContasPagarLista_. */
  todos.paginasLidas = paginasLidas;
  todos.truncado = paginacaoTruncada_(paginasLidas, ultimoLote, PAGE_LIMIT, MAX_PAGES);

  safeLog_('Total de pedidos normalizados: ' + todos.length +
    ' | paginas lidas: ' + paginasLidas + (todos.truncado ? ' | LISTAGEM TRUNCADA (teto MAX_PAGES)' : ''));
  return todos;
}

/* ====================================================================================
 * 9) normalizePedido_() — campos esperados pelo front + campos extra para a DRE.
 * ==================================================================================== */
function normalizePedido_(p) {
  if (!p) {
    return { id: null, numero: null, data: null, total: 0, situacao: null, contato: null, itens: [] };
  }

  var out = {
    id: (p.id != null) ? p.id : null,
    numero: (p.numero != null) ? p.numero : null,
    data: formatDateISO_(p.data),
    total: Number(p.total) || 0,
    situacao: p.situacao ? {
      id: (p.situacao.id != null) ? p.situacao.id : null,
      valor: (p.situacao.valor != null) ? p.situacao.valor : null
    } : null,
    contato: p.contato ? {
      id: (p.contato.id != null) ? p.contato.id : null,
      nome: p.contato.nome || null
    } : null,
    itens: []
  };

  if (p.vendedor) {
    out.vendedor = { id: (p.vendedor.id != null) ? p.vendedor.id : null, nome: p.vendedor.nome || null };
  }
  if (p.formaPagamento) {
    out.formaPagamento = { nome: p.formaPagamento.nome || p.formaPagamento.descricao || null };
  }

  aplicarCamposExtraPedido_(out, p);
  return out;
}

/* ====================================================================================
 * 9b) Campos extra necessários à DRE (Fase 2). NÃO inventa: só grava o que existir.
 *     A forma exata destes campos no Bling deve ser confirmada com
 *     runInspecionarPedidoDetalheBruto() antes de qualquer fórmula os usar.
 * ==================================================================================== */
function aplicarCamposExtraPedido_(out, fonte) {
  if (!out || !fonte) return out;

  var totalProdutos = extrairValorNumerico_(fonte.totalProdutos);
  if (totalProdutos != null) out.totalProdutos = totalProdutos;

  // desconto pode vir como número ou como objeto { valor, unidade }
  var desconto = extrairValorNumerico_(fonte.desconto);
  if (desconto != null) out.desconto = desconto;

  // frete pode vir na raiz ou dentro de transporte
  var frete = extrairValorNumerico_(fonte.frete);
  if (frete == null && fonte.transporte) frete = extrairValorNumerico_(fonte.transporte.frete);
  if (frete != null) out.frete = frete;

  var outras = extrairValorNumerico_(fonte.outrasDespesas);
  if (outras != null) out.outrasDespesas = outras;

  if (fonte.dataSaida) out.dataSaida = formatDateISO_(fonte.dataSaida);

  if (fonte.notaFiscal) {
    if (fonte.notaFiscal.id != null) out.notaFiscalId = fonte.notaFiscal.id;
    if (fonte.notaFiscal.numero != null) out.numeroNotaFiscal = fonte.notaFiscal.numero;
  }
  if (fonte.notaFiscalId != null) out.notaFiscalId = fonte.notaFiscalId;
  if (fonte.numeroNotaFiscal != null) out.numeroNotaFiscal = fonte.numeroNotaFiscal;
  if (fonte.numeroLoja != null) out.numeroLoja = fonte.numeroLoja;

  return out;
}

// Extrai número de um campo que pode ser número, string numérica ou { valor }.
function extrairValorNumerico_(v) {
  if (v == null) return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  if (typeof v === 'string') {
    if (v === '') return null;
    var n = Number(v);
    return isNaN(n) ? null : n;
  }
  if (typeof v === 'object' && v.valor != null) {
    var nv = Number(v.valor);
    return isNaN(nv) ? null : nv;
  }
  return null;
}

/* ====================================================================================
 * 10) mergePedidosSnapshot() — FUNÇÃO PURA de consolidação do histórico.
 *
 *  historico anterior + janela atualizada = snapshot histórico consolidado
 *
 *  Regras (todas cobertas por testes):
 *   - chave única: pedido.id (comparado como string);
 *   - pedido da janela SUBSTITUI a versão antiga do mesmo id (situação, total, ...);
 *   - pedido histórico fora da janela é PRESERVADO;
 *   - ids duplicados são eliminados (fica uma só versão);
 *   - uma versão hidratada (com itens) NUNCA é substituída por outra sem itens;
 *   - campos extra já conhecidos não são perdidos se a nova versão não os trouxer;
 *   - ordenação determinística: data desc, depois id desc.
 *
 *  @return {{data: Array, stats: Object}}
 * ==================================================================================== */
function mergePedidosSnapshot(previousData, refreshedData) {
  var prev = Array.isArray(previousData) ? previousData : [];
  var fresh = Array.isArray(refreshedData) ? refreshedData : [];

  var porId = {};
  var stats = {
    totalNovos: 0,
    totalAtualizados: 0,
    totalPreservados: 0,
    totalRemovidosDuplicados: 0,
    totalIgnoradosSemId: 0
  };

  // 1) Histórico. Duplicados dentro do próprio histórico são colapsados.
  for (var i = 0; i < prev.length; i++) {
    var a = prev[i];
    if (!a || a.id == null) { stats.totalIgnoradosSemId++; continue; }
    var ka = String(a.id);
    if (porId[ka]) {
      stats.totalRemovidosDuplicados++;
      porId[ka] = escolherVersaoPedido_(porId[ka], a);
    } else {
      porId[ka] = a;
    }
  }
  var idsHistoricos = Object.keys(porId).length;

  // 2) Janela atualizada. Atualiza existentes, acrescenta novos.
  var vistosNaJanela = {};
  for (var j = 0; j < fresh.length; j++) {
    var n = fresh[j];
    if (!n || n.id == null) { stats.totalIgnoradosSemId++; continue; }
    var kn = String(n.id);

    if (vistosNaJanela[kn]) stats.totalRemovidosDuplicados++;

    if (porId[kn]) {
      porId[kn] = escolherVersaoPedido_(porId[kn], n);
      if (!vistosNaJanela[kn]) stats.totalAtualizados++;
    } else {
      porId[kn] = n;
      if (!vistosNaJanela[kn]) stats.totalNovos++;
    }
    vistosNaJanela[kn] = true;
  }

  stats.totalPreservados = idsHistoricos - stats.totalAtualizados;
  if (stats.totalPreservados < 0) stats.totalPreservados = 0;

  // 3) Ordenação determinística: data mais recente primeiro; empate por id desc.
  var out = [];
  var chaves = Object.keys(porId);
  for (var k = 0; k < chaves.length; k++) out.push(porId[chaves[k]]);
  out.sort(function (x, y) {
    var dx = x && x.data ? String(x.data) : '';
    var dy = y && y.data ? String(y.data) : '';
    if (dx !== dy) return dx < dy ? 1 : -1;      // data desc ('' fica no fim)
    var ix = String(x && x.id != null ? x.id : '');
    var iy = String(y && y.id != null ? y.id : '');
    if (ix === iy) return 0;
    return ix < iy ? 1 : -1;                      // id desc
  });

  stats.totalPedidos = out.length;
  return { data: out, stats: stats };
}

/* Decide a versão final de um pedido: a NOVA vence, mas nunca perde informação
 * já conquistada (itens hidratados e campos extra do detalhe). */
function escolherVersaoPedido_(anterior, novo) {
  if (!anterior) return novo;
  if (!novo) return anterior;

  var out = {};
  var kn = Object.keys(novo);
  for (var i = 0; i < kn.length; i++) out[kn[i]] = novo[kn[i]];

  // Itens: só aceita a versão nova se ela realmente trouxer itens.
  var itensNovo = (novo.itens && novo.itens.length) ? novo.itens.length : 0;
  var itensAnt = (anterior.itens && anterior.itens.length) ? anterior.itens.length : 0;
  if (itensNovo === 0 && itensAnt > 0) out.itens = anterior.itens;

  // Campos extra: preserva o que a nova versão não trouxer.
  var ka = Object.keys(anterior);
  for (var j = 0; j < ka.length; j++) {
    var campo = ka[j];
    if (campo === 'itens') continue;
    if (out[campo] == null && anterior[campo] != null) out[campo] = anterior[campo];
  }

  return out;
}

/* ====================================================================================
 * 11) jsonOut_() e errorOut_()
 * ==================================================================================== */
function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function errorOut_(err) {
  var message = (err && err.message) ? String(err.message) : 'Erro inesperado.';
  return jsonOut_({
    error: true,
    message: sanitize_(message),
    details: ''
  });
}

/* ====================================================================================
 * 12) Auxiliares
 * ==================================================================================== */
function postToken_(payloadObj) {
  var clientId = getProp_('BLING_CLIENT_ID');
  var clientSecret = getProp_('BLING_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw new Error('Credenciais ausentes. Rode setCredentials_().');
  }

  var basic = Utilities.base64Encode(clientId + ':' + clientSecret);
  var res = UrlFetchApp.fetch(BLING_TOKEN_URL, {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    headers: { Authorization: 'Basic ' + basic, 'enable-jwt': '1' },
    payload: payloadObj,
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  var body = res.getContentText();
  var json = safeParse_(body);

  if (code < 200 || code >= 300 || !json || !json.access_token) {
    throw new Error('Falha no token (HTTP ' + code + '): ' + sanitize_(body));
  }
  return json;
}

function saveTokens_(tokenJson) {
  var now = Date.now();
  var expiresIn = Number(tokenJson.expires_in || 21600);
  var props = {
    BLING_ACCESS_TOKEN: tokenJson.access_token,
    BLING_TOKEN_EXPIRES_AT: String(now + (expiresIn * 1000))
  };
  if (tokenJson.refresh_token) {
    props.BLING_REFRESH_TOKEN = tokenJson.refresh_token;
  }
  setProps_(props);
}

function formatDateISO_(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Utilities.formatDate(value, 'UTC', 'yyyy-MM-dd');
  }
  var s = String(value).trim();
  var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
  var br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return br[3] + '-' + br[2] + '-' + br[1];
  var d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
  return s;
}

function addDays_(date, n) {
  var d = new Date(date.getTime());
  d.setDate(d.getDate() + n);
  return d;
}

function getProp_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function setProps_(obj) {
  PropertiesService.getScriptProperties().setProperties(obj, false);
}

function buildQuery_(params) {
  if (!params) return '';
  var parts = [];
  Object.keys(params).forEach(function (k) {
    var v = params[k];
    if (v !== undefined && v !== null && v !== '') {
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    }
  });
  return parts.length ? ('?' + parts.join('&')) : '';
}

function safeParse_(text) {
  try { return JSON.parse(text); } catch (e) { return null; }
}

function sanitize_(text) {
  if (!text) return '';
  return String(text).replace(/[A-Za-z0-9_\-]{24,}/g, '***');
}

function safeLog_(msg) {
  Logger.log(sanitize_(String(msg)));
}

/* ====================================================================================
 * DUMPS DE DIAGNÓSTICO SEM DADOS PESSOAIS.
 *
 * sanitize_ mascara corridas de 24+ alfanuméricos — apanha tokens, não apanha um CPF,
 * que tem 11 dígitos. Um diagnóstico que despeje registos crus do Bling (ver
 * TesteContasPagar) grava CPF de fornecedor pessoa singular nos registos de execução,
 * onde fica retido e visível a quem tiver acesso ao projeto.
 *
 * A máscara PRESERVA O COMPRIMENTO em vez de apagar: quem corre o diagnóstico quer
 * saber se o campo vinha preenchido e com que forma, e isso continua legível. O que
 * deixa de existir é o número.
 *
 * Assumidamente heurístico: uma corrida isolada de exatamente 11 ou 14 dígitos que não
 * seja um documento também é mascarada. Num dump de diagnóstico isso é uma troca que
 * vale a pena — ids do Bling têm 7-9 dígitos e valores têm separador decimal.
 * ==================================================================================== */
function mascararDocumentos_(texto) {
  if (!texto) return '';
  return String(texto)
    .replace(/\d{14}/g, '***CNPJ(14)***')
    .replace(/\d{11}/g, '***CPF(11)***');
}

/* Log de diagnóstico: sanitize_ (tokens) + mascararDocumentos_ (CPF/CNPJ). */
function safeLogDiagnostico_(msg) {
  Logger.log(mascararDocumentos_(sanitize_(String(msg))));
}

/****************************************************************************************
 * Detalhe de pedido e mapeamento de itens.
 ****************************************************************************************/
function fetchPedidoDetalhe_(id) {
  var res = blingGet_('/pedidos/vendas/' + encodeURIComponent(id), null);
  return (res && res.data) ? res.data : null;
}

function mapItens_(itens) {
  if (!itens || !itens.length) return [];
  return itens.map(function (it) {
    return {
      produto: { id: (it.produto && it.produto.id != null) ? it.produto.id : null },
      codigo: (it.codigo != null) ? it.codigo : null,
      descricao: (it.descricao != null) ? it.descricao : null,
      quantidade: Number(it.quantidade) || 0,
      valor: Number(it.valor) || 0
    };
  });
}

/****************************************************************************************
 * REBUILD INCREMENTAL DO SNAPSHOT (nunca apaga histórico).
 ****************************************************************************************/
function rebuildPedidosSnapshot_() {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    safeLog_('Rebuild ja em andamento. Abortando esta execucao.');
    return { ok: false, motivo: 'lock' };
  }

  var inicio = Date.now();
  try {
    var hoje = new Date();
    var dataFinal = formatDateISO_(hoje);
    var dataInicial = formatDateISO_(addDays_(hoje, -DEFAULT_DAYS));

    // Histórico anterior. Snapshot ilegível é preservado numa cópia antes de prosseguir.
    var leitura = readPedidosSnapshotSeguro_();
    var anteriorData = leitura.data;
    if (leitura.corrompido) {
      safeLog_('ATENCAO: snapshot anterior ilegivel. Copia preservada; a consolidar so com a janela atual.');
    }

    // Janela atualizada (lista normalizada, itens ainda vazios).
    var janela = fetchPedidosVendas_(dataInicial, dataFinal);
    safeLog_('Rebuild | pedidos na janela ' + dataInicial + ' a ' + dataFinal + ': ' + janela.length);

    // Versões anteriores indexadas por id: servem para reutilizar itens já hidratados
    // e para saber se o pedido já foi inspecionado para os campos adicionais da DRE.
    var anteriorPorId = {};
    for (var a = 0; a < anteriorData.length; a++) {
      var pa = anteriorData[a];
      if (pa && pa.id != null) anteriorPorId[String(pa.id)] = pa;
    }

    var comItensJanela = 0, semItensJanela = 0, chamadasDetalhe = 0;
    var inspecionadosNesta = 0, jaInspecionados = 0, parcial = false;

    for (var i = 0; i < janela.length; i++) {
      var p = janela[i];
      var key = String(p.id);
      var anterior = anteriorPorId[key] || null;

      // Reutiliza itens já hidratados: evita rebuscar o detalhe só por causa dos itens.
      if (anterior && anterior.itens && anterior.itens.length > 0) {
        p.itens = anterior.itens;
      }

      // Já tem itens E já foi inspecionado para a DRE: nada a fazer, sem chamada.
      if (!pedidoPrecisaDetalhe_(anterior)) {
        p.dreDetalheInspecionado = true; // propaga o marcador para a versão consolidada
        jaInspecionados++;
        comItensJanela++;
        continue;
      }

      // Orçamento de tempo: paramos aqui. Os pedidos restantes CONTINUAM na
      // consolidação com o que já têm e SEM marcador, ficando pendentes para a
      // próxima execução. O merge garante que não degradam a versão anterior.
      if (Date.now() - inicio > REBUILD_TIME_BUDGET_MS) {
        parcial = true;
        safeLog_('Orcamento de tempo atingido. Consolidacao PARCIAL (nada e descartado).');
        break;
      }

      // Uma única chamada resolve as duas coisas: itens e campos adicionais da DRE.
      var detalhe = fetchPedidoDetalhe_(p.id);
      chamadasDetalhe++;
      if (detalhe) {
        var itensDetalhe = mapItens_(detalhe.itens || []);
        if (itensDetalhe.length > 0) p.itens = itensDetalhe; // nunca degrada itens existentes
        aplicarCamposExtraPedido_(p, detalhe);
        // Marca mesmo que o detalhe não traga nenhum campo adicional: o pedido foi
        // inspecionado e não deve gerar novas chamadas em execuções futuras.
        p.dreDetalheInspecionado = true;
        inspecionadosNesta++;
      }
      if (p.itens && p.itens.length > 0) comItensJanela++; else semItensJanela++;

      Utilities.sleep(DETAIL_THROTTLE_MS);
    }

    // CONSOLIDAÇÃO: histórico + janela. Nenhum pedido histórico é perdido.
    var merged = mergePedidosSnapshot(anteriorData, janela);

    var comItens = 0, semItens = 0;
    for (var m = 0; m < merged.data.length; m++) {
      if (merged.data[m].itens && merged.data[m].itens.length > 0) comItens++; else semItens++;
    }

    var snapshot = {
      data: merged.data,
      meta: {
        geradoEm: new Date().toISOString(),
        periodoAtualizado: { dataInicial: dataInicial, dataFinal: dataFinal },
        totalPedidos: merged.data.length,
        totalNovos: merged.stats.totalNovos,
        totalAtualizados: merged.stats.totalAtualizados,
        totalPreservados: merged.stats.totalPreservados,
        totalRemovidosDuplicados: merged.stats.totalRemovidosDuplicados,
        comItens: comItens,
        semItens: semItens,
        /* ── TRUNCAMENTO DA LISTAGEM (aditivo) ───────────────────────────────────────
         * `parcial` sempre significou "o rebuild não chegou ao fim" no eixo do TEMPO
         * (orçamento de execução esgotado). Não dizia nada sobre o eixo da PAGINAÇÃO:
         * uma janela que batesse no teto MAX_PAGES gravava um snapshot com
         * `parcial: false` — completo aos olhos de toda a cadeia a jusante, e com
         * pedidos por ler do lado de lá.
         *
         * São dois truncamentos diferentes, e ambos impedem a afirmação "completo".
         * `listagemTruncada` publica o FACTO (qual dos dois foi); `parcial` continua a
         * ser o agregado pessimista que o frontend já lê. Nenhum campo existente muda
         * de significado: `parcial` só passa a ser verdadeiro em MAIS casos, nunca em
         * menos — a direção segura. */
        listagemTruncada: !!janela.truncado,
        paginasLidas: janela.paginasLidas != null ? janela.paginasLidas : null,
        parcial: parcial || !!janela.truncado
      }
    };

    saveSnapshot_(snapshot);

    var ms = Date.now() - inicio;
    safeLog_('Rebuild concluido' + (parcial ? ' (PARCIAL)' : '') + '.');
    safeLog_('Total consolidado: ' + snapshot.meta.totalPedidos +
      ' | novos ' + snapshot.meta.totalNovos +
      ' | atualizados ' + snapshot.meta.totalAtualizados +
      ' | preservados ' + snapshot.meta.totalPreservados +
      ' | duplicados removidos ' + snapshot.meta.totalRemovidosDuplicados);
    safeLog_('Com itens: ' + comItens + ' | Sem itens: ' + semItens +
      ' | chamadas de detalhe nesta execucao: ' + chamadasDetalhe);
    safeLog_('Enriquecimento DRE -> inspecionados agora: ' + inspecionadosNesta +
      ' | ja inspecionados antes: ' + jaInspecionados +
      ' | pendentes na janela: ' + Math.max(0, janela.length - inspecionadosNesta - jaInspecionados));
    safeLog_('Tempo aprox.: ' + Math.round(ms / 1000) + 's | tamanho ~' +
      Math.round(JSON.stringify(snapshot).length / 1024) + ' KB');
    if (parcial) {
      safeLog_('PARCIAL: rode runRebuildPedidosSnapshot novamente para continuar a hidratacao.');
    }

    return { ok: true, parcial: parcial, meta: snapshot.meta };

  } finally {
    lock.releaseLock();
  }
}

/* Valida a ESTRUTURA de um snapshot de pedidos já parseado. Função pura (testável).
 * Válido = objeto simples (não array) com a propriedade `data` a ser um array.
 * Um `data: []` é válido (snapshot legitimamente vazio). */
function snapshotPedidosValido_(obj) {
  if (!obj) return false;                                             // null, undefined, '', 0
  if (typeof obj !== 'object') return false;                          // string, número, booleano
  if (Array.isArray(obj)) return false;                               // array na raiz
  if (!Object.prototype.hasOwnProperty.call(obj, 'data')) return false; // sem `data`
  if (!Array.isArray(obj.data)) return false;                         // data: {}, null, string...
  return true;
}

/* Leitura segura: distingue "nao existe" de "ilegivel/estruturalmente invalido" e
 * nunca apaga o ficheiro. Qualquer shape inesperado e tratado como CORROMPIDO
 * (com copia de seguranca), nunca como snapshot vazio valido — para que uma
 * escrita seguinte nao possa ser confundida com "historico legitimamente vazio". */
function readPedidosSnapshotSeguro_() {
  var file = findSnapshotFile_();
  if (!file) return { data: [], corrompido: false, existia: false };

  var obj = null;
  try {
    obj = JSON.parse(file.getBlob().getDataAsString());
  } catch (e) {
    backupSnapshotCorrompido_(file);
    return { data: [], corrompido: true, existia: true };
  }

  if (!snapshotPedidosValido_(obj)) {
    safeLog_('Snapshot com estrutura invalida (sem data-array). Tratado como corrompido.');
    backupSnapshotCorrompido_(file);
    return { data: [], corrompido: true, existia: true };
  }

  return { data: obj.data, corrompido: false, existia: true };
}

/* Decide se um pedido precisa de uma chamada ao detalhe do Bling. Função pura.
 * Precisa quando: e novo; ou nao tem itens hidratados; ou ainda nao foi
 * inspecionado para os campos adicionais da DRE (marcador dreDetalheInspecionado).
 * Assim, pedidos historicos que ja tinham itens sao enriquecidos progressivamente. */
function pedidoPrecisaDetalhe_(pedidoAnterior) {
  return !pedidoAnterior ||
    !(pedidoAnterior.itens && pedidoAnterior.itens.length) ||
    pedidoAnterior.dreDetalheInspecionado !== true;
}

/* Guarda uma copia do snapshot ilegivel antes de qualquer escrita. */
function backupSnapshotCorrompido_(file) {
  try {
    var nome = SNAPSHOT_FILE_NAME.replace('.json', '') + '-' +
      Utilities.formatDate(new Date(), 'UTC', 'yyyyMMdd-HHmmss') + SNAPSHOT_CORROMPIDO_SUFIXO;
    DriveApp.createFile(nome, file.getBlob().getDataAsString(), 'application/json');
    safeLog_('Copia do snapshot ilegivel guardada como: ' + nome);
  } catch (e) {
    safeLog_('Nao foi possivel guardar copia do snapshot ilegivel.');
  }
}

function readPedidosSnapshot_() {
  var file = findSnapshotFile_();
  if (!file) return null;
  try {
    return JSON.parse(file.getBlob().getDataAsString());
  } catch (e) {
    safeLog_('Snapshot ilegivel (JSON invalido).');
    return null;
  }
}

function findSnapshotFile_() {
  var it = DriveApp.getFilesByName(SNAPSHOT_FILE_NAME);
  return it.hasNext() ? it.next() : null;
}

function getOrCreateSnapshotFile_() {
  var file = findSnapshotFile_();
  if (file) return file;
  return DriveApp.createFile(SNAPSHOT_FILE_NAME, '{"data":[]}', 'application/json');
}

function saveSnapshot_(obj) {
  var file = getOrCreateSnapshotFile_();
  file.setContent(JSON.stringify(obj));
}

/****************************************************************************************
 * Gatilho diário (instalação MANUAL e idempotente).
 * Executar UMA vez no editor: installDailyPedidosSnapshotTrigger()
 ****************************************************************************************/
function installDailyPedidosSnapshotTrigger() {
  var alvo = 'runRebuildPedidosSnapshot';
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
    .atHour(1)
    .nearMinute(0)
    .everyDays(1)
    .inTimezone(SNAPSHOT_TIMEZONE)
    .create();

  safeLog_('Gatilho diario instalado para ' + alvo + ' (~01:00 ' + SNAPSHOT_TIMEZONE + ').');
  safeLog_('Gatilhos duplicados removidos: ' + removidos);
  return { ok: true, removidos: removidos };
}

function listPedidosSnapshotTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  var n = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'runRebuildPedidosSnapshot') n++;
  }
  safeLog_('Gatilhos de runRebuildPedidosSnapshot: ' + n);
  return n;
}

/****************************************************************************************
 * Wrappers SEM underline (para rodar pelo editor do Apps Script).
 ****************************************************************************************/
function runRebuildPedidosSnapshot() {
  return rebuildPedidosSnapshot_();
}

function runReadPedidosSnapshotTest() {
  var s = readPedidosSnapshot_();
  if (!s) { safeLog_('Snapshot inexistente (null).'); return; }
  safeLog_('Snapshot lido. Pedidos: ' + (s.data ? s.data.length : 0));
  if (s.meta) {
    safeLog_('Meta -> gerado ' + s.meta.geradoEm +
      ' | total ' + s.meta.totalPedidos +
      ' | novos ' + s.meta.totalNovos +
      ' | atualizados ' + s.meta.totalAtualizados +
      ' | preservados ' + s.meta.totalPreservados +
      ' | parcial ' + s.meta.parcial);
  }
}

/* Diagnostico read-only: confirma os NOMES dos campos do detalhe de um pedido.
 * Necessario antes de a Fase 2 usar totalProdutos/desconto/frete nas formulas. */
var TEST_PEDIDO_ID = 26576405725; // preencher com um id real antes de rodar

function runInspecionarPedidoDetalheBruto() {
  if (!TEST_PEDIDO_ID) throw new Error('Defina TEST_PEDIDO_ID com um id real de pedido.');
  var d = fetchPedidoDetalhe_(TEST_PEDIDO_ID);
  if (!d) { safeLog_('Detalhe nao retornado.'); return; }
  safeLog_('Campos na raiz do detalhe: ' + Object.keys(d).join(', '));
  var internos = ['desconto', 'transporte', 'notaFiscal', 'situacao', 'contato'];
  for (var i = 0; i < internos.length; i++) {
    var k = internos[i], v = d[k];
    if (v === undefined) safeLog_(k + ': AUSENTE');
    else if (v === null) safeLog_(k + ': null');
    else if (typeof v === 'object') safeLog_(k + ' (objeto) -> ' + Object.keys(v).join(', '));
    else safeLog_(k + ': escalar (' + typeof v + ')');
  }
}

function runBuildAuthUrl() {
  buildAuthUrl_();
}

function runEncontrarIdPedidoPorNumero() {
  var numeroProcurado = "1318";

  var snapshot = readPedidosSnapshot_();
  if (!snapshot || !Array.isArray(snapshot.data)) {
    throw new Error("Snapshot de pedidos não encontrado ou inválido.");
  }

  var pedido = snapshot.data.find(function (p) {
    return String(p.numero) === numeroProcurado;
  });

  if (!pedido) {
    Logger.log("Pedido número " + numeroProcurado + " não encontrado no snapshot.");
    return;
  }

  Logger.log("Pedido encontrado:");
  Logger.log("numero = " + pedido.numero);
  Logger.log("id = " + pedido.id);
  Logger.log(JSON.stringify(pedido, null, 2));
}

function runExchangeAuthorizationCode() {
  return exchangeAuthorizationCode_();
}
