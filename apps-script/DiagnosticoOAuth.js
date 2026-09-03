/****************************************************************************************
 * DIAGNÓSTICO OAuth — PROVA DO AUTHORIZATION CODE, SEM O EXIBIR.
 * --------------------------------------------------------------------------------------
 * TEMPORÁRIO. Vive só no HEAD, sai na limpeza, e Produção (v12) nunca o vê.
 *
 * ─── O PROBLEMA QUE ISTO RESOLVE ───────────────────────────────────────────────────────
 * Duas trocas falharam com `invalid_grant` / "The authorization code has expired". A
 * documentação oficial do Bling diz, na secção "Tokens de acesso":
 *
 *     "Lembrando que o prazo para realizar esta requisição é de 1 minuto,
 *      este é o tempo de expiração do code."
 *
 * SESSENTA SEGUNDOS. O caminho manual — copiar o code do callback, abrir Definições do
 * projeto, editar a propriedade, Guardar, voltar ao editor, escolher a função, Executar —
 * não cabe nesse orçamento com folga nenhuma.
 *
 * ─── PORQUE A PROVA E A TROCA ESTÃO NA MESMA FUNÇÃO ────────────────────────────────────
 * Porque separá-las custaria uma segunda execução, e cada execução gasta segundos de um
 * orçamento de sessenta. `runTrocarCodeComProva` regista a impressão digital e troca
 * IMEDIATAMENTE a seguir, no mesmo arranque. Um clique, e a prova fica no registo quer a
 * troca resulte quer não.
 *
 * ─── O QUE NUNCA SAI DAQUI ─────────────────────────────────────────────────────────────
 * O code, o access token, o refresh token, o client secret e a redirect URI. Só saem
 * comprimento, os 8 primeiros hexadecimais do SHA-256, e sinalizadores de sujidade de
 * colagem. Um prefixo de hash identifica sem revelar: chega para dizer "é outro code",
 * não chega para reconstruir nenhum.
 ****************************************************************************************/

/* ====================================================================================
 * PURAS — testadas em oauthProbe.test.js.
 * ==================================================================================== */

/**
 * Descreve um segredo sem o revelar. `hashHex` entra já calculado para esta função
 * poder ser testada sem o runtime da Google.
 *
 * Os sinalizadores existem porque uma colagem manual erra sempre da mesma maneira:
 * espaço à frente, quebra de linha atrás, aspas arrastadas do JSON, ou o valor colado
 * já percent-encoded a partir da barra de endereço.
 */
function analisarSegredo_(valor, hashHex) {
  if (valor === null || valor === undefined) {
    return { existe: false };
  }
  var s = String(valor);
  var limpo = s.trim();
  return {
    existe: true,
    comprimento: s.length,
    comprimentoAparado: limpo.length,
    fingerprint: String(hashHex || '').slice(0, 8),
    temEspacoNasPontas: s !== limpo,
    temQuebraLinha: /[\r\n]/.test(s),
    temAspas: /^["'].*["']$/.test(limpo) || /["']/.test(limpo),
    temPercentEncoding: /%[0-9A-Fa-f]{2}/.test(limpo),
    temEspacoInterno: /\s/.test(limpo)
  };
}

/* ====================================================================================
 * IMPURAS — leem propriedades e falam com o Bling.
 * ==================================================================================== */

/** SHA-256 em hexadecimal. Só o prefixo é alguma vez registado. */
function sha256Hex_(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s));
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = (bytes[i] + 256) % 256;
    hex += (b < 16 ? '0' : '') + b.toString(16);
  }
  return hex;
}

function impressaoDigitalDoEstado_() {
  var code = getProp_('BLING_AUTH_CODE');
  var redirect = getProp_('BLING_REDIRECT_URI');
  return {
    code: analisarSegredo_(code, code ? sha256Hex_(code) : ''),
    redirectUri: analisarSegredo_(redirect, redirect ? sha256Hex_(redirect) : ''),
    temClientId: !!getProp_('BLING_CLIENT_ID'),
    temClientSecret: !!getProp_('BLING_CLIENT_SECRET'),
    temRefreshTokenAntigo: !!getProp_('BLING_REFRESH_TOKEN'),
    agora: new Date().toISOString()
  };
}

/**
 * SÓ PROVA, sem trocar nada. Corra ANTES de autorizar para registar a impressão digital
 * do code velho; depois de colar o novo, a impressão TEM de ser outra. Se for igual, o
 * que está na propriedade não é o code novo — e aí o problema é a colagem, não o relógio.
 *
 * Não gasta o code: não faz pedido nenhum ao Bling.
 */
function runProvaDoCode() {
  Logger.log(JSON.stringify(impressaoDigitalDoEstado_()));
}

/**
 * PROVA + TROCA, num só arranque. É esta que se corre na tentativa a sério.
 *
 * A impressão digital é registada ANTES da troca, para existir no registo mesmo que a
 * troca falhe — e para ficar provado, sem dúvida possível, QUAL code foi enviado.
 */
function runTrocarCodeComProva() {
  var prova = impressaoDigitalDoEstado_();
  Logger.log('PROVA ' + JSON.stringify(prova));

  if (!prova.code.existe) {
    Logger.log('RESULTADO {"ok":false,"erro":"SEM_CODE"}');
    return;
  }

  try {
    exchangeAuthorizationCode_();
    Logger.log('RESULTADO {"ok":true,"erro":null}');
  } catch (e) {
    Logger.log('RESULTADO ' + JSON.stringify(classificarErroToken_(e)));
  }
}

/**
 * Classificação segura do erro da troca. O corpo cru NUNCA é registado: numa falha de
 * `postToken_` ele traz a resposta do Bling, e num `invalid_client` isso pode incluir
 * eco de credenciais.
 */
function classificarErroToken_(e) {
  var msg = (e && e.message) ? String(e.message) : '';
  var m = msg.match(/HTTP (\d+)/);
  var status = m ? Number(m[1]) : null;

  var codigo;
  if (/authorization code has expired|expired/i.test(msg)) codigo = 'CODE_EXPIRADO';
  else if (/already been used|has already/i.test(msg)) codigo = 'CODE_JA_USADO_UTILIZADOR_REVOGADO';
  else if (/invalid_client/i.test(msg)) codigo = 'CREDENCIAIS_INVALIDAS';
  else if (/invalid_grant/i.test(msg)) codigo = 'GRANT_INVALIDO';
  else if (/Empresa inativa/i.test(msg)) codigo = 'EMPRESA_INATIVA';
  else codigo = 'ERRO';

  return { ok: false, httpStatus: status, erro: codigo };
}
