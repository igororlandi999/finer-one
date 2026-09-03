/****************************************************************************************
 * DIAGNÓSTICO NF-e — SONDA DE LEITURA, EXECUTADA NO EDITOR.
 * --------------------------------------------------------------------------------------
 * PERGUNTA ÚNICA que este ficheiro responde:
 *
 *     o token atual da Overcel já tem permissão para ler GET /nfe/{id}?
 *
 * E, se tiver, QUAIS DOS CAMPOS prometidos pela documentação vêm mesmo preenchidos numa
 * nota real desta conta — `numero`, `serie`, `chaveAcesso`, `linkDanfe`, `linkPDF`, `xml`.
 *
 * ─── PORQUE NÃO É UMA ROTA DO doGet ────────────────────────────────────────────────────
 * Porque a implantação @HEAD exige login Google (medido: redireciona para
 * accounts.google.com), pelo que uma rota só seria alcançável se fosse PUBLICADA em
 * produção. Publicar uma rota de diagnóstico em produção para responder a uma pergunta de
 * diagnóstico é a troca errada. Uma função de editor responde à mesma pergunta com ZERO
 * superfície pública — e é o padrão que este projeto já usa (TesteContasPagar,
 * DiagnosticoRecebiveis, TesteEnriquecimentoDespesas).
 *
 * `Código.js` não é tocado: nem `doGet`, nem `RECURSOS_SUPORTADOS`, nem `blingGet_`.
 * O contrato dos quatro recursos fica byte a byte igual, e Produção fica na versão 12.
 *
 * ─── O QUE ESTA SONDA NUNCA FAZ ────────────────────────────────────────────────────────
 * Não escreve. Não altera OAuth nem escopos. Não chama /nfe/documento. Não descarrega
 * PDF nem XML. Faz UMA chamada GET e deita fora tudo menos booleanos, comprimentos,
 * `situacao` e `tipo`.
 *
 * Nenhum valor sai daqui: nem token, nem chave de acesso, nem accessKey, nem URL, nem
 * conteúdo fiscal, nem dados do destinatário. Só a FORMA da resposta.
 ****************************************************************************************/

/* ====================================================================================
 * PURAS — testadas em nfeProbe.test.js.
 * ==================================================================================== */

/**
 * ID de nota fiscal → inteiro positivo, ou null.
 *
 * Mesma regra do `toNotaFiscalId` do frontend, e pela mesma razão: `0` é a sentinela do
 * Bling para "sem nota", e uma sonda que aceitasse 0 iria pedir `/nfe/0` e trazer de
 * volta um 404 que parecia falta de escopo. O tipo é verificado ANTES da coerção porque
 * `Number(true)` é 1 e `Number(['7'])` é 7.
 */
function nfeProbeId_(valor) {
  var n;
  if (typeof valor === 'number') {
    n = valor;
  } else if (typeof valor === 'string') {
    var t = valor.trim();
    if (t === '') return null;
    n = Number(t);
  } else {
    return null;
  }
  if (!isFinite(n)) return null;
  if (Math.floor(n) !== n) return null;
  return n > 0 ? n : null;
}

/** Campo preenchido = existe e não é string vazia. `0` e `false` contam como presentes. */
function preenchidoNfe_(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim() !== '';
  return true;
}

/**
 * ERRO → classificação segura.
 *
 * `blingGet_` lança `Error('Bling GET <path> falhou (HTTP <code>): <corpo>')`. Lemos o
 * código de lá e o `insufficient_scope` do corpo — e depois DEITAMOS O CORPO FORA. Um
 * corpo de erro do Bling pode trazer dados da nota; devolvê-lo "para ajudar a depurar"
 * é como esta classe de fuga costuma começar.
 */
function classificarErroNfe_(e) {
  var msg = (e && e.message) ? String(e.message) : '';
  var m = msg.match(/falhou \(HTTP (\d+)\)/);
  var status = m ? Number(m[1]) : null;
  var semEscopo = /insufficient_scope/i.test(msg);

  var codigo;
  if (semEscopo) codigo = 'SEM_ESCOPO';
  else if (status === 404) codigo = 'NAO_ENCONTRADA';
  else if (status === 403) codigo = 'PROIBIDO';
  else if (status === 401) codigo = 'NAO_AUTENTICADO';
  else codigo = 'ERRO';

  return { ok: false, httpStatus: status, erro: codigo, escopoInsuficiente: semEscopo };
}

/**
 * RESPOSTA 200 → resumo seguro.
 *
 * Só a forma. Os comprimentos existem porque distinguem "campo presente mas vazio" de
 * "campo com conteúdo a sério" sem revelar o conteúdo — 44 caracteres é uma chave de
 * acesso plausível, 3 não é.
 *
 * `xmlParece` fecha a única dúvida que a documentação oficial deixa em aberto: se o
 * campo `xml` traz uma URL ou o próprio XML. Olha para os primeiros caracteres e diz
 * qual dos dois — sem imprimir nenhum deles.
 */
function resumoNfeSeguro_(d) {
  if (!d) return { ok: false, httpStatus: 200, erro: 'SEM_DATA' };

  var chave = d.chaveAcesso;
  var pdf = d.linkPDF;
  var danfe = d.linkDanfe;
  var xml = d.xml;
  var comp = function (v) { return preenchidoNfe_(v) ? String(v).length : 0; };
  var ehUrl = function (v) {
    return preenchidoNfe_(v) && String(v).trim().toLowerCase().indexOf('http') === 0;
  };

  return {
    ok: true,
    httpStatus: 200,
    hasNumero: preenchidoNfe_(d.numero),
    hasSerie: preenchidoNfe_(d.serie),
    hasChaveAcesso: preenchidoNfe_(chave),
    hasLinkDanfe: preenchidoNfe_(danfe),
    hasLinkPDF: preenchidoNfe_(pdf),
    hasXml: preenchidoNfe_(xml),
    situacao: (d.situacao !== null && d.situacao !== undefined) ? d.situacao : null,
    tipo: (d.tipo !== null && d.tipo !== undefined) ? d.tipo : null,
    chaveAcessoLen: comp(chave),
    linkDanfeLen: comp(danfe),
    linkPDFLen: comp(pdf),
    xmlLen: comp(xml),
    xmlParece: preenchidoNfe_(xml) ? (ehUrl(xml) ? 'url' : 'conteudo') : null,
    linksTemAccessKey: (ehUrl(pdf) && String(pdf).indexOf('accessKey') !== -1) ||
                       (ehUrl(danfe) && String(danfe).indexOf('accessKey') !== -1)
  };
}

/* ====================================================================================
 * IMPURA — a única que fala com a rede. UMA chamada, GET, e mais nada.
 * ==================================================================================== */

/**
 * Corre isto no editor: selecionar `runNfeProbe` e Executar, depois de pôr o id em
 * NFE_PROBE_ID abaixo (o editor do Apps Script não permite passar argumentos).
 */
/* NF real da conta, escolhida por ser a de maior confiança possível: aparece no pedido
 * 1470 (26/08/2026) E numa conta a receber com `origem.tipoOrigem = 'notafiscal'` e
 * `origem.situacao = 7` — "Emitida DANFE", ou seja, autorizada na SEFAZ. Se `linkPDF` e
 * `linkDanfe` vierem vazios NESTA nota, não virão em nenhuma. */
var NFE_PROBE_ID = 26703842453;

function runNfeProbe(id) {
  var alvo = (id === undefined || id === null) ? NFE_PROBE_ID : id;
  var n = nfeProbeId_(alvo);

  if (n === null) {
    Logger.log(JSON.stringify({ ok: false, httpStatus: null, erro: 'ID_INVALIDO' }));
    return;
  }

  var saida;
  try {
    var res = blingGet_('/nfe/' + encodeURIComponent(n), null);
    saida = resumoNfeSeguro_(res && res.data ? res.data : null);
  } catch (e) {
    saida = classificarErroNfe_(e);
  }

  /* Uma linha, já redigida por construção. É isto — e só isto — que sai daqui. */
  Logger.log(JSON.stringify(saida));
}
