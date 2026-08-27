// O NÚCLEO DE AUTORIZAÇÃO DO BFF NÃO PODE DIVERGIR DESTE.
//
// ─── O PROBLEMA QUE ESTE TESTE RESOLVE ──────────────────────────────────────────────
// A decisão de autorização é do SERVIDOR, e o servidor é outro repositório
// (`finer-one-proxy`), que não tem runner de testes. A suite que exercita a matriz de
// segurança inteira vive aqui.
//
// Logo, o BFF VENDORA este ficheiro — `lib/authorizationCore.js`, cópia literal. E uma
// cópia literal é exatamente o tipo de coisa que diverge em silêncio: alguém corrige
// uma regra de um lado, esquece o outro, e passa a haver duas respostas diferentes para
// a mesma pergunta de segurança. A que conta é a do servidor, e é a que ninguém testa.
//
// Este teste torna essa divergência impossível de não notar.
//
// ─── PORQUE NÃO SE IMPORTA O PACOTE, EM VEZ DE COPIAR ───────────────────────────────
// Porque não há pacote: são dois repositórios sem publicação em npm nem monorepo. Um
// pacote partilhado seria a solução certa quando este código estabilizar, e está no
// plano de migração. Até lá, a cópia é honesta — desde que verificada.
//
// ─── SE O REPOSITÓRIO DO PROXY NÃO ESTIVER PRESENTE ─────────────────────────────────
// O teste passa sem verificar, porque não há nada para verificar: numa máquina que só
// tenha o frontend, a cópia não existe e não pode divergir. O que ele NÃO faz é passar
// em silêncio quando a cópia existe e está diferente.

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const aqui = dirname(fileURLToPath(import.meta.url));
const canonico = join(aqui, "authorizationCore.js");

/* O proxy vive ao lado do frontend. O caminho é relativo e não absoluto para que o
 * teste funcione em qualquer máquina onde os dois repositórios sejam irmãos. */
const copiaDoBff = join(aqui, "..", "..", "..", "finer-one-proxy", "lib", "authorizationCore.js");

/** Normaliza fins de linha: um `git config core.autocrlf` diferente entre repositórios
 *  não é uma divergência de regra de segurança e não deve falhar o teste. */
function conteudo(caminho) {
  return readFileSync(caminho, "utf8").replace(/\r\n/g, "\n");
}

describe("o núcleo de autorização do BFF é idêntico ao canónico", () => {
  const existe = existsSync(copiaDoBff);

  it("o ficheiro canónico existe", () => {
    expect(existsSync(canonico)).toBe(true);
  });

  it.skipIf(!existe)("a cópia do BFF é byte a byte igual", () => {
    const c = conteudo(canonico);
    const b = conteudo(copiaDoBff);
    if (c !== b) {
      /* Mensagem acionável: dizer O QUE fazer, e não só que está diferente. */
      expect.fail(
        "lib/authorizationCore.js do finer-one-proxy divergiu do canónico.\n" +
        "Copie o canónico por cima:\n" +
        "  cp src/auth/authorizationCore.js ../finer-one-proxy/lib/authorizationCore.js\n" +
        "E confirme que as regras alteradas continuam cobertas por authorizationCore.test.js."
      );
    }
    expect(b).toBe(c);
  });

  it.skipIf(!existe)("a cópia exporta tudo o que os handlers do BFF importam", () => {
    /* Os símbolos que `lib/protect.js` e os handlers importam por nome. Se algum deixar
     * de ser exportado, o BFF rebenta no arranque da função — e é melhor descobri-lo
     * aqui do que num pedido de um cliente. */
    const b = conteudo(copiaDoBff);
    for (const simbolo of [
      "authorizeCompanyRequest", "safeErrorBody", "AUTHZ", "AUTHZ_HTTP_STATUS", "CAPABILITIES",
    ]) {
      const exportado = new RegExp(`^export\\s+(const|function|async function)\\s+${simbolo}\\b`, "m");
      expect(exportado.test(b), `${simbolo} não é exportado pela cópia`).toBe(true);
    }
  });

  it.skipIf(!existe)("a cópia não tem imports — é o que a torna vendorável", () => {
    /* Um `import` no núcleo tornaria a cópia dependente da árvore de ficheiros do
     * frontend, e o BFF deixaria de a poder usar tal como está. */
    const b = conteudo(copiaDoBff);
    const linhasDeImport = b.split("\n").filter((l) => /^\s*import\s/.test(l));
    expect(linhasDeImport).toEqual([]);
  });
});
