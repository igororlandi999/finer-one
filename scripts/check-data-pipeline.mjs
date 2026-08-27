#!/usr/bin/env node
/****************************************************************************************
 * scripts/check-data-pipeline.mjs — DIAGNÓSTICO READ-ONLY do pipeline de dados
 * --------------------------------------------------------------------------------------
 * Responde, com um comando, à pergunta que custou uma investigação inteira a responder:
 * "os dados que a aplicação está a mostrar são de quando?"
 *
 *   node scripts/check-data-pipeline.mjs
 *   node scripts/check-data-pipeline.mjs --json      (saída legível por máquina)
 *   node scripts/check-data-pipeline.mjs --base=URL  (sobrepõe VITE_API_BASE_URL)
 *
 * ─── PORQUE EXISTE ──────────────────────────────────────────────────────────────────
 * O backend devolve HTTP 200 mesmo quando serve um snapshot de há um mês. Do lado de
 * fora, um pipeline parado é indistinguível de um pipeline saudável: os números
 * continuam lá, apenas deixaram de corresponder à realidade. Este script torna essa
 * diferença visível em segundos.
 *
 * ─── GARANTIAS ──────────────────────────────────────────────────────────────────────
 *   - SÓ FAZ GET. Nunca escreve, nunca reconstrói, nunca força rebuild, nunca apaga.
 *   - Não imprime tokens, segredos nem a query string (que poderia conter credenciais).
 *   - Não imprime conteúdo financeiro dos ajustes manuais: só o estado do documento.
 *   - Zero dependências: Node nativo (fetch do Node 18+).
 *   - Distingue "metadata AUSENTE" de "metadata ANTIGA" — não saber a idade dos dados
 *     não é o mesmo que saber que estão velhos.
 *
 * Código de saída:
 *   0  saudável     — todas as fontes recentes E explicitamente completas
 *   1  atenção      — alguma velha, sem data, sem veredito de completude, ou PARCIAL
 *   2  indisponível — falha técnica de transporte (HTTP, rede, JSON inválido)
 *
 * Nota: 1 NÃO significa dado errado. Significa que o pipeline não consegue afirmar
 * que está tudo recente e completo — o que é diferente de afirmar que está mal.
 ****************************************************************************************/

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

/* Mesmos limiares de src/utils/dataFreshness.js. Duplicados de propósito: este script
 * é uma ferramenta de operação e tem de correr sem importar nada da app. Se os
 * limiares lá mudarem, mudam aqui — são duas linhas e estão assinaladas. */
const AVISO_HORAS = 24;
const VELHO_HORAS = 72;

const TIMEOUT_MS = 60000;

/* ── Configuração ─────────────────────────────────────────────────────────────────── */

/** Lê VITE_API_BASE_URL do .env sem dependências. Não imprime o conteúdo do ficheiro. */
function lerBaseDoEnv() {
  for (const ficheiro of [".env.local", ".env"]) {
    try {
      const texto = readFileSync(join(RAIZ, ficheiro), "utf8");
      const linha = texto.split(/\r?\n/).find((l) => l.trim().startsWith("VITE_API_BASE_URL="));
      if (linha) {
        const valor = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
        if (valor) return valor;
      }
    } catch { /* ficheiro inexistente: segue para o seguinte */ }
  }
  return "";
}

const args = process.argv.slice(2);
const JSON_OUT = args.includes("--json");
const baseArg = args.find((a) => a.startsWith("--base="));
const BASE = (baseArg ? baseArg.slice("--base=".length) : (process.env.VITE_API_BASE_URL || lerBaseDoEnv())).replace(/\/+$/, "");

/* ── Recursos ─────────────────────────────────────────────────────────────────────── */

const RECURSOS = [
  { chave: "pedidos", rotulo: "PEDIDOS", params: null, campoData: "data", rotuloData: "venda" },
  { chave: "despesas", rotulo: "DESPESAS", params: { recurso: "despesas" }, campoData: "dataEmissao", campoData2: "vencimento", rotuloData: "emissão", rotuloData2: "vencimento" },
  { chave: "recebiveis", rotulo: "RECEBÍVEIS", params: { recurso: "recebiveis" }, campoData: "dataEmissao", campoData2: "vencimento", rotuloData: "emissão", rotuloData2: "vencimento" },
  { chave: "ajustes-manuais", rotulo: "AJUSTES MANUAIS", params: { recurso: "ajustes-manuais" }, documento: true },
];

/* ── Utilitários puros ────────────────────────────────────────────────────────────── */

const maxData = (linhas, campo) => {
  const v = linhas.map((l) => l && l[campo]).filter((d) => typeof d === "string" && d);
  return v.length ? v.sort()[v.length - 1] : null;
};

/** Idade em horas a partir de um ISO, ou null se a data não for utilizável. */
function idadeHoras(iso, agora = Date.now()) {
  if (typeof iso !== "string" || !iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, (agora - t) / 3600000);
}

function descreverIdade(h) {
  if (h == null) return "idade desconhecida";
  if (h < 1) return "há menos de 1 hora";
  if (h < 24) { const n = Math.floor(h); return `há ${n} hora${n === 1 ? "" : "s"}`; }
  const d = Math.floor(h / 24);
  return `há ${d} dia${d === 1 ? "" : "s"}`;
}

/** fresh | warning | stale | unknown — a MESMA escala da app. */
function estadoFrescura(h) {
  if (h == null) return "unknown";
  if (h >= VELHO_HORAS) return "stale";
  if (h >= AVISO_HORAS) return "warning";
  return "fresh";
}

const SIMBOLO = { fresh: "OK  ", warning: "AVISO", stale: "VELHO", unknown: "?   ", erro: "FALHA" };

/* ────────────────────────────────────────────────────────────────────────────────────
 * VEREDITO CONSOLIDADO. Pura: recebe os resultados por fonte e devolve o juízo.
 *
 * Extraída de `principal` para poder ser testada — antes vivia inline e só era
 * exercitável com rede. O bug que a motivou está descrito em `fontesComErro` abaixo.
 * ──────────────────────────────────────────────────────────────────────────────────── */
export function calcularConsolidado(resultados) {
  /* Frescura do CONJUNTO pela fonte mais antiga — a mesma regra de geradoEmMaisAntigo
   * em blingDataService: um conjunto não é mais fresco do que a sua pior fonte. */
  const comData = resultados.filter((r) => r.chave !== "ajustes-manuais" && r.estado !== "erro" && r.geradoEm);
  let conjunto = { iso: null, estado: "unknown", recurso: null, idadeHoras: null };
  if (comData.length) {
    const pior = comData.reduce((a, b) => (a.geradoEm <= b.geradoEm ? a : b));
    conjunto = { iso: pior.geradoEm, estado: pior.estado, recurso: pior.rotulo, idadeHoras: pior.idadeHoras };
  }

  /* ── COMPLETUDE do conjunto, eixo INDEPENDENTE da frescura ──────────────────────────
   * Mesma regra de src/utils/dataHealth.js, deliberadamente duplicada: este script é
   * ferramenta de operação e tem de correr sem importar nada da app. Se a regra lá
   * mudar, muda aqui — são poucas linhas e estão assinaladas nos dois sítios.
   *   basta UMA fonte parcial para o conjunto não estar completo;
   *   afirmar COMPLETO exige que TODAS se pronunciem explicitamente.
   *
   * Continua a olhar só para as COLEÇÕES: `parcial` é uma propriedade de uma listagem
   * paginada, e ajustes-manuais é um documento — não tem o conceito. */
  const colecoesTodas = resultados.filter((r) => r.chave !== "ajustes-manuais");
  const parciais = colecoesTodas.filter((r) => r.parcial === true);
  const semVeredito = colecoesTodas.filter((r) => r.estado !== "erro" && r.parcial !== true && r.parcial !== false);
  const semData = colecoesTodas.filter((r) => r.estado !== "erro" && !r.geradoEm);

  /* DISPONIBILIDADE olha para TODAS as fontes, ajustes-manuais incluído.
   *
   * Aqui estava o bug: `comErro` era filtrado sobre `colecoesTodas`, que exclui
   * ajustes-manuais. Um HTTP 502 nessa fonte imprimia `[FALHA] AJUSTES MANUAIS` na
   * listagem e, três linhas abaixo, `ESTADO TÉCNICO DO PIPELINE: SAUDÁVEL`. O código
   * de saída estava certo (2), mas ninguém lê códigos de saída num terminal — lê-se a
   * palavra. Uma ferramenta de operação que diz "saudável" com uma fonte em baixo é
   * pior do que não existir.
   *
   * A exclusão de ajustes-manuais faz sentido para frescura (não tem `geradoEm`
   * comparável) e para completude (não tem `parcial`). Não faz sentido nenhum para
   * "respondeu?". */
  const comErro = resultados.filter((r) => r.estado === "erro");

  const completude = parciais.length ? "partial"
    : (colecoesTodas.length && semVeredito.length === 0 && comErro.length === 0) ? "complete"
      : "unknown";

  /* ESTADO TÉCNICO do pipeline. Deliberadamente NÃO se chama "pronto para a DRE": essa
   * pergunta depende de regras financeiras (CMV lançado, classificação dos títulos,
   * mês de fecho declarado) que este script não conhece e não deve fingir conhecer.
   * O que aqui se afirma é apenas sobre o TRANSPORTE: os snapshots chegaram, são
   * recentes e declaram-se completos. */
  const estadoTecnico = comErro.length ? "indisponivel"
    : (conjunto.estado === "stale" || conjunto.estado === "warning" || conjunto.estado === "unknown"
       || completude !== "complete") ? "atencao"
      : "saudavel";

  return {
    conjunto,
    consolidado: {
      frescura: conjunto.estado,
      completude,
      piorFonte: conjunto.recurso,
      piorFonteIso: conjunto.iso,
      piorFonteIdadeHoras: conjunto.idadeHoras,
      algumaParcial: parciais.length > 0,
      fontesParciais: parciais.map((r) => r.rotulo),
      algumaSemVeredito: semVeredito.length > 0,
      fontesSemVeredito: semVeredito.map((r) => r.rotulo),
      fontesSemData: semData.map((r) => r.rotulo),
      fontesComErro: comErro.map((r) => r.rotulo),
      estadoTecnico,
    },
  };
}

/* ── Transporte (GET e nada mais) ─────────────────────────────────────────────────── */

function construirUrl(params) {
  const url = new URL(`${BASE}/pedidos/vendas`);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url;
}

async function obter(params) {
  const url = construirUrl(params);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" }, signal: ctrl.signal });
    const ms = Date.now() - t0;
    if (!res.ok) return { erro: `HTTP ${res.status}`, http: res.status, ms };
    let corpo;
    try { corpo = await res.json(); } catch { return { erro: "resposta não é JSON válido", http: res.status, ms }; }
    return { corpo, http: res.status, ms };
  } catch (e) {
    const ms = Date.now() - t0;
    if (e && e.name === "AbortError") return { erro: `tempo de espera excedido (${TIMEOUT_MS / 1000}s)`, ms };
    return { erro: `erro de rede: ${e && e.message ? e.message : e}`, ms };
  } finally {
    clearTimeout(timer);
  }
}

/* ── Análise por recurso ──────────────────────────────────────────────────────────── */

/* O Apps Script responde HTTP 200 mesmo em erro: o veredito está no CORPO, nunca no
 * código de estado. Um payload `{ error: true }` é uma recusa explícita do backend e
 * merece uma mensagem própria — sem isto cairia no genérico "payload sem array data",
 * que descreve o sintoma e esconde a causa.
 *
 * `code` existe desde a guarda de recurso desconhecido do doGet; payloads mais antigos
 * só trazem `message`. Nenhum dos dois é conteúdo financeiro. */
function erroDeclaradoPeloBackend(corpo) {
  if (!corpo || typeof corpo !== "object" || corpo.error !== true) return null;
  const codigo = typeof corpo.code === "string" && corpo.code ? corpo.code : null;
  if (codigo === "RECURSO_DESCONHECIDO") {
    const suportados = Array.isArray(corpo.recursosSuportados) ? corpo.recursosSuportados.join(", ") : null;
    return `o backend NÃO reconhece este recurso (RECURSO_DESCONHECIDO)` +
      (suportados ? ` — suporta: ${suportados}` : "");
  }
  const msg = typeof corpo.message === "string" && corpo.message ? corpo.message : "sem mensagem";
  return `o backend devolveu erro${codigo ? ` (${codigo})` : ""}: ${msg}`;
}

async function analisarColecao(rec, agora) {
  const r = await obter(rec.params);
  if (r.erro) return { chave: rec.chave, rotulo: rec.rotulo, estado: "erro", erro: r.erro, http: r.http ?? null, ms: r.ms };

  const corpo = r.corpo;
  const recusa = erroDeclaradoPeloBackend(corpo);
  if (recusa) {
    return { chave: rec.chave, rotulo: rec.rotulo, estado: "erro", erro: recusa, http: r.http, ms: r.ms,
      codigoErro: typeof corpo.code === "string" ? corpo.code : null };
  }
  const linhas = Array.isArray(corpo) ? corpo : (Array.isArray(corpo?.data) ? corpo.data : null);
  if (linhas === null) {
    return { chave: rec.chave, rotulo: rec.rotulo, estado: "erro", erro: "payload sem array `data`", http: r.http, ms: r.ms };
  }

  /* Data declarada: o contrato canónico é meta.geradoEm; debug.snapshotMeta.geradoEm é
   * o caminho legado que os recebíveis usavam antes da C7F.3C. Aceitam-se os dois. */
  const geradoEm = corpo?.meta?.geradoEm ?? corpo?.debug?.snapshotMeta?.geradoEm ?? null;
  const origemMeta = corpo?.meta?.geradoEm ? "meta" : (corpo?.debug?.snapshotMeta?.geradoEm ? "debug (legado)" : null);
  const parcial = corpo?.meta?.parcial ?? corpo?.debug?.snapshotMeta?.parcial ?? null;
  const h = idadeHoras(geradoEm, agora);

  return {
    chave: rec.chave,
    rotulo: rec.rotulo,
    estado: estadoFrescura(h),
    http: r.http,
    ms: r.ms,
    registos: linhas.length,
    geradoEm,
    origemMeta,
    idadeHoras: h == null ? null : Number(h.toFixed(2)),
    parcial,
    datas: [
      rec.campoData ? { rotulo: rec.rotuloData, valor: maxData(linhas, rec.campoData) } : null,
      rec.campoData2 ? { rotulo: rec.rotuloData2, valor: maxData(linhas, rec.campoData2) } : null,
    ].filter(Boolean),
  };
}

/** Ajustes manuais: SÓ o estado do documento. Nenhum valor financeiro é lido ou impresso. */
async function analisarDocumento(rec, agora) {
  const r = await obter(rec.params);
  if (r.erro) return { chave: rec.chave, rotulo: rec.rotulo, estado: "erro", erro: r.erro, http: r.http ?? null, ms: r.ms };

  const corpo = r.corpo;
  const recusaDoc = erroDeclaradoPeloBackend(corpo);
  if (recusaDoc) {
    return { chave: rec.chave, rotulo: rec.rotulo, estado: "erro", erro: recusaDoc, http: r.http, ms: r.ms,
      codigoErro: typeof corpo.code === "string" ? corpo.code : null };
  }
  const fonte = corpo?.debug?.fonte ?? null;
  const doc = corpo?.data;

  /* Um array aqui significa que o recurso não existe no backend e a resposta caiu no
   * ramo por omissão do doGet, devolvendo o snapshot de PEDIDOS. É um problema de
   * integração, não um documento. */
  if (Array.isArray(doc)) {
    return { chave: rec.chave, rotulo: rec.rotulo, estado: "erro", http: r.http, ms: r.ms,
      erro: "resposta é uma lista, não um documento — o recurso caiu no ramo por omissão do doGet" };
  }

  const atualizado = corpo?.debug?.documentoMeta?.lastUpdated ?? (typeof doc?.updatedAt === "string" ? doc.updatedAt : null);
  const h = idadeHoras(atualizado, agora);
  const meses = doc && doc.months && typeof doc.months === "object" ? Object.keys(doc.months).length : null;

  return {
    chave: rec.chave, rotulo: rec.rotulo,
    estado: fonte === "documento" ? "fresh" : "unknown",   // idade não é critério aqui
    http: r.http, ms: r.ms,
    fonte,
    documento: !!doc && !Array.isArray(doc),
    totalMeses: meses,           // quantidade, nunca os valores
    atualizadoEm: atualizado,
    idadeHoras: h == null ? null : Number(h.toFixed(2)),
  };
}

/* ── Apresentação ─────────────────────────────────────────────────────────────────── */

function imprimir(resultados, geradoEmConjunto, c) {
  const l = (t = "") => console.log(t);
  l();
  l("  FINER ONE — ESTADO DO PIPELINE DE DADOS");
  l("  " + "─".repeat(74));
  l(`  Backend : ${BASE || "(NÃO CONFIGURADO)"}`);
  l(`  Agora   : ${new Date().toISOString()}`);
  l();

  for (const r of resultados) {
    if (r.estado === "erro") {
      l(`  [${SIMBOLO.erro}] ${r.rotulo}`);
      l(`          ${r.erro}${r.http ? ` (HTTP ${r.http})` : ""}  ·  ${r.ms} ms`);
      l();
      continue;
    }

    if (r.chave === "ajustes-manuais") {
      l(`  [${SIMBOLO[r.estado]}] ${r.rotulo}`);
      l(`          fonte: ${r.fonte ?? "—"}  ·  documento: ${r.documento ? "sim" : "não"}  ·  meses com ajuste: ${r.totalMeses ?? "—"}`);
      l(`          atualizado: ${r.atualizadoEm ?? "não declarado"}${r.atualizadoEm ? `  (${descreverIdade(r.idadeHoras)})` : ""}  ·  ${r.ms} ms`);
      l();
      continue;
    }

    l(`  [${SIMBOLO[r.estado]}] ${r.rotulo}`);
    l(`          registos: ${r.registos}  ·  HTTP ${r.http}  ·  ${r.ms} ms`);
    if (r.geradoEm) {
      l(`          gerado em: ${r.geradoEm}  (${descreverIdade(r.idadeHoras)}, via ${r.origemMeta})`);
    } else {
      l("          gerado em: NÃO DECLARADO — a idade destes dados é desconhecida.");
      l("                     Atenção: desconhecida NÃO quer dizer recente.");
    }
    if (r.parcial === true) l("          PARCIAL: o snapshot não terminou de hidratar. Correr o rebuild outra vez.");
    else if (r.parcial === false) l("          completo: parcial=false");
    for (const d of r.datas) l(`          ${d.rotulo} mais recente: ${d.valor ?? "—"}`);
    l();
  }

  l("  " + "─".repeat(74));
  if (geradoEmConjunto.iso) {
    l(`  CONJUNTO: ${SIMBOLO[geradoEmConjunto.estado]} — vale pela fonte MAIS ANTIGA (${geradoEmConjunto.recurso}),`);
    l(`            ${geradoEmConjunto.iso}  ·  ${descreverIdade(geradoEmConjunto.idadeHoras)}`);
  } else {
    l("  CONJUNTO: idade desconhecida — nenhuma fonte declarou data.");
  }

  if (c) {
    const rotuloCompletude = { complete: "completo", partial: "PARCIAL", unknown: "desconhecido" }[c.completude];
    const rotuloTecnico = {
      saudavel: "SAUDÁVEL", atencao: "ATENÇÃO", indisponivel: "INDISPONÍVEL",
    }[c.estadoTecnico];
    l();
    l(`  frescura   : ${c.frescura}`);
    l(`  completude : ${rotuloCompletude}${c.algumaParcial ? `  (parciais: ${c.fontesParciais.join(", ")})` : ""}`);
    if (c.algumaSemVeredito) l(`               sem veredito de completude: ${c.fontesSemVeredito.join(", ")}`);
    if (c.fontesSemData.length) l(`               sem data declarada: ${c.fontesSemData.join(", ")}`);
    if (c.fontesComErro.length) l(`  falhas     : ${c.fontesComErro.join(", ")}`);
    l();
    l(`  ESTADO TÉCNICO DO PIPELINE: ${rotuloTecnico}`);
    /* A distinção que este script NÃO pode apagar: transporte não é contabilidade.
     * A frase descreve o EIXO medido, não o veredito — a versão anterior afirmava
     * "snapshots chegaram, são recentes e completos" mesmo quando o estado era
     * INDISPONÍVEL, ou seja, exatamente quando não tinham chegado. */
    l("  (afirma só sobre o TRANSPORTE: se os snapshots chegaram, quando foram gerados");
    l("   e se se declaram completos. NÃO afirma que a DRE pode ser fechada — isso");
    l("   depende de CMV, classificação dos títulos e do mês de fecho declarado, que");
    l("   este script não conhece.)");

    /* PRÓXIMO PASSO — o que fazer, não só o que se passa. Um diagnóstico que obriga
     * a ir procurar o procedimento a outro lado é meio diagnóstico. */
    const passo = {
      indisponivel: "verifique a rede e o VITE_API_BASE_URL; depois, script.google.com -> Execuções, filtre por Falhou.",
      atencao: "script.google.com -> Execuções: confirme se os gatilhos diários correram e se algum snapshot ficou parcial.",
      saudavel: null,
    }[c.estadoTecnico];
    if (passo) { l(); l(`  PRÓXIMO PASSO: ${passo}`); }
  }
  l();
}

/* ── Principal ────────────────────────────────────────────────────────────────────── */

async function principal() {
  if (!BASE) {
    console.error("\n  FALHA: não há backend configurado.");
    console.error("  Defina VITE_API_BASE_URL no .env, ou passe --base=https://…\n");
    process.exit(2);
  }

  const agora = Date.now();
  const resultados = [];
  for (const rec of RECURSOS) {
    resultados.push(rec.documento ? await analisarDocumento(rec, agora) : await analisarColecao(rec, agora));
  }

  const { conjunto, consolidado } = calcularConsolidado(resultados);

  if (JSON_OUT) {
    console.log(JSON.stringify({ base: BASE, verificadoEm: new Date(agora).toISOString(), conjunto, consolidado, recursos: resultados }, null, 2));
  } else {
    imprimir(resultados, conjunto, consolidado);
  }

  if (resultados.some((r) => r.estado === "erro")) process.exit(2);
  const colecoes = resultados.filter((r) => r.chave !== "ajustes-manuais");
  if (colecoes.some((r) => r.estado === "stale" || r.estado === "warning" || r.estado === "unknown" || r.parcial === true)) process.exit(1);
  process.exit(0);
}

/* Só corre quando invocado como programa (`node scripts/check-data-pipeline.mjs`).
 * Sem esta guarda, importar o ficheiro para testar calcularConsolidado disparava a
 * verificação inteira — rede e process.exit incluídos. */
const invocadoDiretamente =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invocadoDiretamente) {
  principal().catch((e) => {
    console.error("\n  FALHA inesperada:", e && e.message ? e.message : e, "\n");
    process.exit(2);
  });
}
