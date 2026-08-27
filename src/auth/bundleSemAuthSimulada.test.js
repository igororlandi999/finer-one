// O BUNDLE DE PRODUÇÃO NÃO PODE CONTER AUTENTICAÇÃO SIMULADA.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// ESTE É O TESTE PEDIDO PELA FASE 9: "o teste deve falhar se o mock auth puder entrar
// num production build".
// ═══════════════════════════════════════════════════════════════════════════════════
//
// ─── PORQUE NÃO CHEGAM AS GUARDAS DE RUNTIME ────────────────────────────────────────
// `resolveAuthMode` e `assertDevAuthAllowed` impedem que o adaptador simulado SEJA
// USADO em produção. Este teste verifica outra coisa: que ele nem sequer LÁ ESTÁ.
//
// A diferença importa. Código que existe no bundle é código que alguém pode alcançar:
// por um `import()` a partir da consola, por um bug num ramo que se pensava morto, ou
// por uma futura alteração que troque a guarda por engano. Código ausente não tem
// nenhuma dessas possibilidades.
//
// ─── COMO É QUE ISTO CAI ────────────────────────────────────────────────────────────
// Basta que alguém, em `authAdapters.js`:
//   - troque `if (import.meta.env.DEV)` por uma variável que o Rollup não consiga
//     avaliar em tempo de compilação;
//   - ponha o `import` do adaptador simulado no topo do ficheiro;
//   - importe qualquer coisa de `devAuthAdapter.js` a partir de código de produção
//     (uma constante, um tipo, um rótulo — arrasta o módulo inteiro).
//
// Nos três casos a sentinela aparece no `dist/` e este teste falha, dizendo em que
// ficheiro apareceu.
//
// ─── SE NÃO HOUVER `dist/` ──────────────────────────────────────────────────────────
// O teste CONSTRÓI. Custa alguns segundos e só acontece quando ninguém construiu antes;
// no fluxo normal (`npm test && npm run build`) o `dist/` já existe. Um teste de
// segurança que se ignora a si próprio quando lhe falta um pré-requisito não é um teste
// de segurança — é uma sugestão.

import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SENTINELA_AUTH_SIMULADA } from "./devAuthAdapter.js";
import { UTILIZADORES_FIXTURE, EMPRESAS_FIXTURE, PREFIXO_TOKEN_DEV } from "./devAuthAdapter.js";

const raizProjeto = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const distDir = join(raizProjeto, "dist");

/** Todos os ficheiros de texto servidos ao browser. */
function ficheirosDoBundle(dir) {
  const out = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) { out.push(...ficheirosDoBundle(caminho)); continue; }
    if (/\.(js|mjs|css|html|map)$/i.test(nome)) out.push(caminho);
  }
  return out;
}

let ficheiros = [];

beforeAll(() => {
  if (!existsSync(distDir)) {
    /* Invoca-se o binário do Vite com o PRÓPRIO Node, e não `npm run build`.
     *
     * Duas razões, e a segunda foi apanhada a correr isto: o `npm` no Windows é um
     * `.cmd`, e desde a correção do CVE-2024-27980 o Node recusa-se a lançar ficheiros
     * `.cmd` sem shell — `spawnSync npm.cmd EINVAL`. Lançar com `shell: true` resolveria
     * e traria um interpretador de comandos ao meio de um teste de segurança, que é
     * precisamente onde ele não deve estar. Isto não usa shell nenhuma.
     *
     * A primeira razão é mais simples: sem `npm` pelo meio, corre o Vite deste projeto
     * e não o que estiver no PATH. */
    /* `NODE_ENV` é REMOVIDA do ambiente do build. O vitest exporta `NODE_ENV=test`, e
     * um build herdado com essa variável não é o build que vai para produção — é um
     * build de teste. Testar o artefacto errado é pior do que não testar: dá confiança
     * sobre um ficheiro que ninguém publica.
     *
     * Removê-la reproduz exatamente o que `npm run build` faz. E é também o ambiente em
     * que o defeito do `DEV` NÃO aparece — a guarda contra esse defeito está no teste
     * dedicado abaixo, que constrói de propósito com `NODE_ENV=test`. */
    const ambiente = { ...process.env };
    delete ambiente.NODE_ENV;
    execFileSync(process.execPath, [join(raizProjeto, "node_modules", "vite", "bin", "vite.js"), "build"], {
      cwd: raizProjeto, stdio: "ignore", env: ambiente,
    });
  }
  ficheiros = ficheirosDoBundle(distDir);
}, 300000);

/** Em que ficheiros do bundle aparece esta cadeia. */
function ondeAparece(agulha) {
  return ficheiros
    .filter((f) => readFileSync(f, "utf8").includes(agulha))
    .map((f) => f.slice(distDir.length + 1));
}

describe("o bundle de produção não contém autenticação simulada", () => {
  it("existe bundle para inspecionar", () => {
    expect(ficheiros.length).toBeGreaterThan(0);
  });

  it("a SENTINELA do adaptador simulado está ausente", () => {
    expect(ondeAparece(SENTINELA_AUTH_SIMULADA)).toEqual([]);
  });

  it("nenhum email de fixture aparece no bundle", () => {
    for (const u of UTILIZADORES_FIXTURE) {
      expect(ondeAparece(u.email), `fixture ${u.email} no bundle`).toEqual([]);
      expect(ondeAparece(u.id), `id ${u.id} no bundle`).toEqual([]);
    }
  });

  it("a empresa-fixture não aparece no bundle", () => {
    const fixture = EMPRESAS_FIXTURE["empresa-exemplo"];
    expect(ondeAparece(fixture.companyId)).toEqual([]);
    expect(ondeAparece(fixture.name)).toEqual([]);
  });

  it("o prefixo dos tokens simulados não aparece no bundle", () => {
    expect(ondeAparece(PREFIXO_TOKEN_DEV)).toEqual([]);
  });

  it("nenhum ficheiro do bundle se chama devAuthAdapter", () => {
    const suspeitos = ficheiros
      .map((f) => f.slice(distDir.length + 1))
      .filter((f) => /devauth/i.test(f));
    expect(suspeitos).toEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * O AMBIENTE CONTAMINADO
 *
 * ─── O DEFEITO QUE ESTE BLOCO EXISTE PARA IMPEDIR QUE VOLTE ────────────────────────
 * A guarda era só `import.meta.env.DEV`. O Vite deriva `DEV` de `process.env.NODE_ENV`
 * quando ela está definida, e só cai no `mode` quando não está. Resultado, verificado:
 *
 *     NODE_ENV=test vite build   ->   dist/assets/devAuthAdapter-XlECL-hX.js
 *
 * `NODE_ENV=test` é o que praticamente qualquer runner de testes exporta e o que muitos
 * CI definem globalmente para todo o pipeline. Um `npm test && npm run build` no mesmo
 * processo publicava autenticação simulada.
 *
 * A correção foi acrescentar `import.meta.env.MODE !== "production"`, que é
 * determinista para `vite build`. Este teste constrói NUM AMBIENTE CONTAMINADO DE
 * PROPÓSITO e falha se o adaptador voltar a aparecer.
 *
 * É o único teste do ficheiro que constrói sempre (para um `dist` próprio, sem tocar no
 * do projeto). Custa alguns segundos e paga-os na primeira vez que alguém simplificar
 * a guarda.
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("um build com NODE_ENV contaminado continua limpo", () => {
  const outDir = join(raizProjeto, "node_modules", ".cache", "finer-bundle-guard");

  it("NODE_ENV=test não faz entrar a autenticação simulada no bundle", () => {
    execFileSync(
      process.execPath,
      [join(raizProjeto, "node_modules", "vite", "bin", "vite.js"), "build", "--outDir", outDir, "--emptyOutDir"],
      { cwd: raizProjeto, stdio: "ignore", env: { ...process.env, NODE_ENV: "test" } }
    );

    const doAmbienteSujo = ficheirosDoBundle(outDir);
    expect(doAmbienteSujo.length).toBeGreaterThan(0);

    const comSentinela = doAmbienteSujo
      .filter((f) => readFileSync(f, "utf8").includes(SENTINELA_AUTH_SIMULADA))
      .map((f) => f.slice(outDir.length + 1));
    expect(comSentinela).toEqual([]);

    const nomeSuspeito = doAmbienteSujo
      .map((f) => f.slice(outDir.length + 1))
      .filter((f) => /devauth/i.test(f));
    expect(nomeSuspeito).toEqual([]);
  }, 300000);
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * SEGREDOS
 *
 * Tudo o que começa por `VITE_` é substituído literalmente no bundle e é PÚBLICO.
 * A chave `anon` do Supabase está lá de propósito — é ela que as políticas de RLS
 * esperam ver, e não concede nada por si. A `service_role` ignora RLS por completo:
 * no browser, seria acesso total à base de dados de todas as empresas.
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("nenhum segredo no bundle", () => {
  const PADROES_PROIBIDOS = [
    ["service_role", /service_role/i],
    ["SERVICE_KEY", /SUPABASE_SERVICE/i],
    ["chave privada PEM", /-----BEGIN (RSA |EC )?PRIVATE KEY-----/],
    ["JWT secret", /VITE_[A-Z_]*(SECRET|PRIVATE)/],
    /* O formato NOVO de chave secreta do Supabase (`sb_secret_...`). Exige-se pelo
     * menos 8 caracteres depois do prefixo: o próprio SDK traz a string `"sb_secret_"`
     * numa verificação de prefixo, e essa é legítima — o que não pode aparecer é uma
     * chave a seguir a ele. */
    ["chave secreta Supabase", /sb_secret_[A-Za-z0-9]{8,}/],
  ];

  it.each(PADROES_PROIBIDOS)("%s não aparece no bundle", (_rotulo, padrao) => {
    const encontrados = ficheiros
      .filter((f) => padrao.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(distDir.length + 1));
    expect(encontrados).toEqual([]);
  });

  /* ─── PORQUE NÃO CHEGA OLHAR PARA `.env` ─────────────────────────────────────────
   * Este teste inspecionava SÓ `.env` — e o Vite carrega `.env.local` POR CIMA dele,
   * com precedência. Quando as credenciais reais do Supabase chegaram, foram para
   * `.env.local`, que é exatamente o ficheiro que o guardião não estava a ver. A
   * proteção existia no sítio de onde o risco já tinha saído.
   *
   * Passa a olhar para todos os ficheiros de ambiente que o Vite lê. */
  const FICHEIROS_ENV = [".env", ".env.local", ".env.development", ".env.development.local",
    ".env.production", ".env.production.local"];

  it.each(FICHEIROS_ENV)("%s não define nenhuma VITE_* com aspeto de segredo", (nome) => {
    const envPath = join(raizProjeto, nome);
    if (!existsSync(envPath)) return;
    const linhas = readFileSync(envPath, "utf8").split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.startsWith("VITE_"));
    for (const linha of linhas) {
      const chave = linha.split("=")[0];
      /* A mensagem tem o NOME da variável e nunca o valor: um teste que imprima
       * segredos ao falhar é um teste que os publica no CI. */
      expect(/SECRET|SERVICE_ROLE|PRIVATE|PASSWORD/i.test(chave), `variável suspeita: ${chave}`).toBe(false);
    }
  });

  it.each(FICHEIROS_ENV)("%s não tem um VALOR com forma de chave secreta", (nome) => {
    const envPath = join(raizProjeto, nome);
    if (!existsSync(envPath)) return;
    const conteudo = readFileSync(envPath, "utf8");
    /* Uma variável pode ter nome inocente e valor fatal: `VITE_SUPABASE_ANON_KEY` com
     * uma `sb_secret_` lá dentro vai LITERALMENTE para o bundle e anula a RLS. O nome
     * do ficheiro entra na mensagem; o valor, nunca. */
    expect(/sb_secret_[A-Za-z0-9]{8,}/.test(conteudo), `${nome} contém uma chave secreta`).toBe(false);
    expect(/-----BEGIN (RSA |EC )?PRIVATE KEY-----/.test(conteudo), `${nome} contém uma chave privada`).toBe(false);
  });
});
