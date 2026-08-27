/****************************************************************************************
 * TesteContasPagar.gs  —  Finer One / Despesas (MVP-1)
 * --------------------------------------------------------------------------------------
 * Teste MANUAL e SOMENTE LEITURA para validar se a conta Bling da Overcel tem dados
 * reais de CONTAS A PAGAR suficientes para alimentar a aba Despesas.
 *
 * Cole este arquivo NO MESMO projeto Apps Script do Code.gs existente. Ele REUTILIZA,
 * sem redefinir: blingGet_, safeLog_, formatDateISO_, addDays_ e a constante PAGE_LIMIT.
 *
 * NÃO altera doGet (a rota /pedidos/vendas continua intacta), NÃO toca no proxy, NÃO
 * toca no front, NÃO grava nada. Apenas chama /contas/pagar e escreve no Logger.
 *
 * COMO USAR:
 *   1) Garanta que o app Bling tem o escopo de Finanças (contas a pagar). Se não tiver,
 *      a chamada retorna HTTP 403 — e isso já é diagnóstico: adicione o escopo no app e
 *      refaça o OAuth (buildAuthUrl_ + exchangeAuthorizationCode_), pois o refresh token
 *      atual NÃO ganha escopos novos sozinho.
 *   2) Rode runTestContasPagar (sem underline) pelo editor.
 *   3) Veja o resultado em "Execuções" / Logger.
 ****************************************************************************************/

// Trava de segurança do teste: no máx. estas páginas (cada uma = até PAGE_LIMIT títulos).
var TESTE_CP_MAX_PAGINAS = 5;
// Pausa entre páginas (ms) para respeitar o limite de 3 req/s do Bling.
var TESTE_CP_PAUSA_MS = 400;

/**
 * Wrapper executável (sem underline) — rode esta função no editor.
 */
function runTestContasPagar() {
  try {
    var registros = fetchContasPagarTeste_();
    analisarContasPagarTeste_(registros);
  } catch (e) {
    safeLog_('ERRO no teste de contas a pagar: ' + (e && e.message ? e.message : e));
    safeLog_('Se for HTTP 403 / sem permissao de escopo: o app provavelmente nao tem o');
    safeLog_('escopo de Financas. Adicione o escopo no app Bling e refaca o fluxo OAuth.');
    throw e;
  }
}

/**
 * Busca contas a pagar paginando, SEM filtro de data (para garantir que vemos dados se
 * existirem e descobrir os nomes REAIS dos campos). Reutiliza blingGet_ (auth + refresh).
 * Devolve o array bruto de títulos (sem normalizar).
 */
function fetchContasPagarTeste_() {
  var todos = [];
  for (var pagina = 1; pagina <= TESTE_CP_MAX_PAGINAS; pagina++) {
    var res = blingGet_('/contas/pagar', { pagina: pagina, limite: PAGE_LIMIT });

    var lote = (res && res.data) ? res.data : (Array.isArray(res) ? res : []);
    safeLog_('Pagina ' + pagina + ': ' + lote.length + ' titulos.');

    if (!lote.length) break;                 // acabou
    todos = todos.concat(lote);
    if (lote.length < PAGE_LIMIT) break;     // ultima pagina parcial

    Utilities.sleep(TESTE_CP_PAUSA_MS);      // throttle
  }
  return todos;
}

/**
 * Loga: total, chaves disponíveis, amostras cruas e leitura defensiva dos campos que a
 * aba Despesas precisa (vencimento, valor, situacao, contato/fornecedor, categoria,
 * formaPagamento), com exemplos e cobertura (quantos títulos têm cada campo).
 */
function analisarContasPagarTeste_(registros) {
  safeLog_('==================================================');
  safeLog_('TOTAL de titulos de contas a pagar lidos: ' + registros.length);
  safeLog_('==================================================');

  if (!registros.length) {
    safeLog_('NENHUM titulo encontrado. Possiveis causas:');
    safeLog_(' - A Overcel nao registra contas a pagar no Bling;');
    safeLog_(' - O escopo de Financas nao esta autorizado;');
    safeLog_(' - (Filtro de data nao foi usado aqui, entao e improvavel ser filtro.)');
    return;
  }

  // 1) Chaves reais do primeiro registro — confirma os nomes dos campos sem suposicao.
  var keys = Object.keys(registros[0] || {});
  safeLog_('CAMPOS no 1o registro: ' + JSON.stringify(keys));

  // 2) Amostra CRUA dos primeiros 5 registros.
  //    CPF/CNPJ saem mascarados (mantendo o comprimento): o objetivo aqui e ver a FORMA
  //    do contrato do Bling, e para isso nao e preciso reter documentos nos registos de
  //    execucao. Ver mascararDocumentos_ em Code.gs.
  safeLog_('--- AMOSTRA CRUA (ate 5 registros; CPF/CNPJ mascarados) ---');
  for (var i = 0; i < Math.min(5, registros.length); i++) {
    safeLogDiagnostico_('RAW[' + i + ']: ' + JSON.stringify(registros[i]));
  }

  // 3) Leitura DEFENSIVA: tenta varios nomes possiveis (v2/v3) e mede cobertura.
  safeLog_('--- LEITURA DEFENSIVA (confirmar nomes reais acima) ---');
  var n = registros.length;
  var comVenc = 0, comValor = 0, comSit = 0, comContato = 0, comCategoria = 0, comForma = 0;
  var distSituacao = {}, exVenc = [], exContato = [], exCategoria = [], exForma = [];

  registros.forEach(function (r) {
    var venc = r.vencimento || r.dataVencimento || r.vencimentoOriginal || null;
    var valor = (r.valor != null) ? r.valor : (r.valorTotal != null ? r.valorTotal : null);

    var sit = null;
    if (r.situacao && typeof r.situacao === 'object') {
      sit = (r.situacao.valor != null) ? r.situacao.valor
          : (r.situacao.id != null ? r.situacao.id : null);
    } else if (r.situacao != null) {
      sit = r.situacao;
    } else if (r.status != null) {
      sit = r.status;
    }

    var contato = r.contato ? (r.contato.nome || r.contato.id)
                : (r.fornecedor ? (r.fornecedor.nome || r.fornecedor.id) : null);
    var categoria = r.categoria ? (r.categoria.descricao || r.categoria.nome || r.categoria.id) : null;
    var forma = r.formaPagamento ? (r.formaPagamento.nome || r.formaPagamento.id) : (r.portador || null);

    if (venc) { comVenc++; if (exVenc.length < 5) exVenc.push(venc); }
    if (valor != null) comValor++;
    if (sit != null) { comSit++; var k = String(sit); distSituacao[k] = (distSituacao[k] || 0) + 1; }
    if (contato) { comContato++; if (exContato.length < 5) exContato.push(contato); }
    if (categoria) { comCategoria++; if (exCategoria.length < 5) exCategoria.push(categoria); }
    if (forma) { comForma++; if (exForma.length < 5) exForma.push(forma); }
  });

  safeLog_('vencimento em      ' + comVenc + '/' + n + ' | exemplos: ' + JSON.stringify(exVenc));
  safeLog_('valor em           ' + comValor + '/' + n);
  safeLog_('situacao/status em ' + comSit + '/' + n + ' | distribuicao: ' + JSON.stringify(distSituacao));
  safeLog_('contato/forn. em   ' + comContato + '/' + n + ' | exemplos: ' + JSON.stringify(exContato));
  safeLog_('categoria em       ' + comCategoria + '/' + n + ' | exemplos: ' + JSON.stringify(exCategoria));
  safeLog_('formaPagamento em  ' + comForma + '/' + n + ' | exemplos: ' + JSON.stringify(exForma));

  safeLog_('--- VEREDITO RAPIDO ---');
  safeLog_('Pronto para MVP-1 (KPIs + tabela)? ' +
    ((comVenc > 0 && comValor > 0 && comSit > 0 && comContato > 0) ? 'SIM' : 'PARCIAL / NAO'));
  safeLog_('Categoria utilizavel para o donut? ' +
    (comCategoria > 0 ? 'SIM (pode exigir resolver nome via /categorias/receitas-despesas)'
                      : 'NAO -> manter "Sem categoria"'));
}

/* -------------------------------------------------------------------------------------
 * OPCIONAL — variante com filtro de data (rode só DEPOIS de confirmar, na amostra crua
 * acima, os nomes REAIS dos parâmetros de data deste endpoint). Para /pedidos/vendas o
 * filtro é dataInicial/dataFinal; em /contas/pagar pode ser dataEmissaoInicial/Final ou
 * dataVencimentoInicial/Final — confirme antes de descomentar.
 * ----------------------------------------------------------------------------------- */
// function runTestContasPagarUltimos90Dias() {
//   var hoje = new Date();
//   var ini = addDays_(hoje, -90);
//   var res = blingGet_('/contas/pagar', {
//     pagina: 1,
//     limite: PAGE_LIMIT,
//     dataEmissaoInicial: formatDateISO_(ini),   // <-- CONFIRMAR nome real do parametro
//     dataEmissaoFinal:   formatDateISO_(hoje)   // <-- CONFIRMAR nome real do parametro
//   });
//   var lote = (res && res.data) ? res.data : (Array.isArray(res) ? res : []);
//   safeLog_('Ultimos 90 dias: ' + lote.length + ' titulos.');
//   analisarContasPagarTeste_(lote);
// }