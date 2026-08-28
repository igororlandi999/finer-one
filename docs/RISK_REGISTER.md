# Registo de riscos

> Atualizado a 28/08/2026, ao fim da sessão de auditoria autónoma.
> **Estados:** `aberto` · `mitigado` · `fechado` · `aceite` · `bloqueado` (precisa de
> acesso que a sessão não tinha).

## Etapas, para a coluna "bloqueia"

| Etapa | O que é |
|---|---|
| **E1** | publicar o BFF em produção |
| **E2** | ligar autenticação no frontend |
| **E3** | ligar `VITE_PROTECTED_DATA_TRANSPORT` |
| **E4** | primeiro cliente-piloto além da Overcel |
| **E5** | escala (vários clientes, escritas ligadas) |

---

## Resolvidos nesta sessão

| ID | Risco | Sev. | Estado | Onde |
|---|---|---|---|---|
| R-01 | O dataset era etiquetado com a empresa **compilada**, não com a lida. Com o transporte protegido ligado, o guarda de escopo recusaria apresentar dados a **todas** as empresas menos uma. E, mais fundo: uma etiqueta que não depende da leitura nunca pode detetar uma leitura errada. | **P1** | fechado | `7994255` |
| R-02 | Um período de datas invertido (`dataInicial > dataFinal`) atravessava os dois endpoints. Desfecho provável: `{"data":[]}` com 200 — um zero indistinguível de um zero verdadeiro. | **P2** | fechado | `9152ae4` |
| R-03 | Injeção de fórmula no CSV exportado. As colunas incluem `cliente`, `fornecedor`, `title` e `description`, com origem no Bling. Quem abre o ficheiro é quem tem os números todos à frente. | **P2** | fechado | `15f49e8` |
| R-04 | `metadata.requestedCompanyId` entrava no `audit_log` **sem limite de tamanho**. Um titular de conta legítimo podia escrever, por pedido recusado, tanto texto quanto coubesse num URL — em 500 MB sem retenção. | **P3** | fechado | `69935df` |
| R-05 | O score declarava "a empresa atingiu o score máximo" quando uma dimensão não tinha sido avaliada. Em julho/2026, com o CMV ausente, isso é uma afirmação sobre a saúde da empresa a partir da dimensão mais importante, nunca calculada. | **P2** | fechado | `d1b0eff`, `a7c46a4` |

---

## Abertos

| ID | Risco | Sev. | Estado | Bloqueia | Mitigação |
|---|---|---|---|---|---|
| R-06 | **`redirect: "follow"` nos dois endpoints.** Se o upstream for comprometido, um `302` para `169.254.169.254` seria seguido pelo BFF. | P2 | **aceite** | — | É **obrigatório**: o Apps Script responde `302` de `script.google.com` para `script.googleusercontent.com`, e `redirect: "error"` partiria produção. Mitigado por o destino inicial vir só de `process.env` (nenhum input do cliente lhe toca — testado) e por o corpo ter de passar `corpoEhJsonDoContrato`. **Fechar com uma lista de hosts permitidos após confirmar em Preview a cadeia real de redirects do GAS.** |
| R-07 | **`{"error":true}` do Apps Script chega ao BFF com HTTP 200 e sai como 200.** `corpoEhJsonDoContrato` só prova "é um objeto". | P2 | aberto | E3 | Defendido a jusante: `linhasOuFalha` (`blingDataService.js:1224`) rejeita `res.error === true` e transforma-o em fonte indisponível. É uma defesa numa camada só. Endurecer o BFF (recusar `error:true` com 502) é local e testável, mas muda o contrato de um endpoint em produção — **fazer com Preview disponível**. |
| R-08 | **`{ok:false, error:{...}}` passaria a guarda do frontend**, porque `res.error === true` é falso quando `error` é um objeto. | P3 | aberto | E3 | Hoje **não é alcançável**: essa forma é produzida por `erroAjuste_`, que só serve o `doPost`, e o BFF só faz `GET`. Fica registado porque a distância entre "não alcançável" e "alcançável" é uma rota nova. |
| R-09 | **`cobertura.confirmada` não é reposta na troca de empresa.** | P3 | aberto | E4 | Sem impacto visível: o campo é escrito e nunca lido. Ver `CACHE_E_ESTADO_INVENTARIO.md` §C1. |
| R-10 | **Empresa preferida é uma chave global de `localStorage`**, partilhada entre utilizadores do mesmo browser. | P3 | mitigado | — | `sessionContract.js` revalida contra as memberships da sessão; um id sem membership é descartado. Pior caso: preferência ignorada. Nunca acesso concedido. |
| R-11 | **`ALLOWED_ORIGINS="*"` é honrado** (com aviso), em vez de falhar fechado. | P3 | aceite | — | É uma decisão explícita, não um acidente: o `*` só existe se alguém o escrever, nunca por omissão, e é registado em voz alta. Não há `Allow-Credentials` em resposta nenhuma, pelo que `*` não expõe sessões — expõe o endpoint **legado anónimo**, que já é anónimo. |
| R-12 | **`monthKeyOf` usa `new Date(string)` no ramo de string** — `"2026-07-01"` é meia-noite **UTC** e, em `America/Sao_Paulo`, `getMonth()` devolve **junho**. | P2 | aberto (latente) | E4 | **Não alcançável hoje**: os três chamadores passam sempre um objeto `Date`. É uma armadilha, não um defeito. Fixar com um teste que force o contrato antes de alguém lhe passar uma string. |
| R-13 | **`npm audit`: 5 vulnerabilidades** (1 baixa, 2 moderadas, 2 altas) — `@babel/core`, `esbuild`/`vite`, `nanoid`, `postcss`. | P3 | aceite | — | **Todas em ferramentas de build**, nenhuma no bundle de produção. A do `esbuild` é do servidor de desenvolvimento. Corrigir exige `vite@8` (mudança maior). Reavaliar quando houver janela para a atualização. |
| R-14 | **Apps Script continua `ANYONE_ANONYMOUS`** e o URL do proxy vai no bundle. | **P1** | aceite (conhecido) | E4 | É o motivo de existir o endpoint legado e de as escritas de cobertura estarem desligadas. Nada a fazer sem tocar no Apps Script — fora do âmbito desta sessão por decisão explícita. |
| R-15 | **Sem política de retenção no `audit_log`.** | P3 | aberto | E5 | R-04 limitou o tamanho de cada linha; não limita o número. Exige DDL — migração `004` a desenhar, **não executar**. |
| R-16 | **Sem limitação de taxa em lado nenhum.** | P2 | aberto | E5 | Fora do âmbito local: exige Redis ou o produto da plataforma. Documentar antes de E5. |

---

## Bloqueados — precisam de desktop com sessão iniciada

Nenhum destes é uma falha conhecida. São **verificações que não foi possível fazer**, e
não fazer uma verificação não é o mesmo que passá-la.

| ID | O que falta verificar | Bloqueia |
|---|---|---|
| B-01 | Smoke test do Preview **com token válido**: `200` com membership, `403` sem, e o isolamento entre duas empresas | E1 |
| B-02 | Que a cadeia `Apps Script 401 → BFF 502 → sem logout` se comporta assim **em rede real**, e não só nos duplos | E1 |
| B-03 | A cadeia real de redirects do Apps Script em Preview (quantos saltos, para que hosts) — fecha R-06 | E1 |
| B-04 | Equivalência entre o Preview e a produção para os quatro recursos do caminho legado | E1 |
| B-05 | Que `ALLOWED_ORIGINS` está configurada no Vercel **antes** de publicar (⚠️ o legado passou de aberto a fechado por omissão) | E1 |
| B-06 | Estado real das variáveis de ambiente de produção e da Deployment Protection | E1 |
| B-07 | Estado real das políticas de RLS no Supabase — a matriz documentada vem do **SQL versionado**, não da base de dados | E2 |
| B-08 | Que `company_coverage` tem mesmo 0 linhas e `company_integration` não guarda nenhuma URL | E2 |
| B-09 | Comportamento de `HEAD` **no runtime da Vercel** (a plataforma pode convertê-lo em `GET`). O handler rejeita-o com 405; o que a plataforma faz antes não é verificável localmente | E1 |
