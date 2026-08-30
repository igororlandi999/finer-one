# BFF — candidato a produção

> **✅ Este candidato FOI promovido.** `74a1e0b` está em Production desde 30/08/2026,
> com smoke autenticado concluído. O ficheiro fica como registo do candidato; a lista de
> pré-condições abaixo **já foi cumprida**, R-B incluído.

> Escrito a **29/08/2026**. Uma página. Se estiver a ler isto amanhã e só quiser saber
> uma coisa, é esta: **`74a1e0b` é o candidato. Produção ainda não o tem.**

---

## O candidato

| | |
|---|---|
| **SHA** | `74a1e0b96a74e07b8a08dd63cf6f3ef0b631701a` |
| Mensagem | `fix: tornar auditoria autenticada confiável` |
| Repositório | `igororlandi999/finer-one-bff` (privado) |
| Local | `C:\Users\User\Documents\VS Code\finer-one-proxy` |
| Sincronia | `origin/main == HEAD` — **0 à frente, 0 atrás** |
| Testes | **235 / 235** |
| `check:predeploy` | tudo verde (repositório, árvore limpa, sincronia, segredos, `.env`, testes) |

Verificado nesta sessão, não copiado do resumo anterior.

## O Preview que foi validado

| | |
|---|---|
| URL | `https://finer-one-proxy-4exxus4x8-igor-orlandi-s-projects.vercel.app` |
| Deployment | `dpl_D6aQZwbC5hsEywGQeFDMwRZfqkPz` |
| Target | **Preview** |

## Produção, hoje

| | |
|---|---|
| Deployment | `kgcs3qugg` |
| Domínio | `https://finer-one-proxy.vercel.app` |
| Corresponde ao candidato? | **Não.** |
| Corresponde a que SHA? | **Não mapeado com certeza a um SHA local.** Ver `BFF_PRODUCTION_DELTA.md`. |

---

## A matriz que este Preview passou

Autenticação · authorization · Overcel real · Finer Teste sem integração ·
equivalência legacy × protected · CORS · datas · erros de upstream · coverage desligada ·
`company_coverage` a zero · logs · **auditoria autenticada persistente**.

Foi corrida contra a infraestrutura real, com token real, no browser. Não é uma matriz
de testes unitários — esses são os 235 acima, e são uma afirmação diferente.

---

## Riscos, no estado de hoje

| ID | Estado | O que é |
|---|---|---|
| **R-A** | **FECHADO** | A integração Git antiga foi removida. **Nenhum** repositório ligado ao projeto Vercel; nenhum novo foi ligado. Deploy manual por CLI durante a migração. Os aliases residuais que apontavam para builds velhos foram removidos; os deployments antigos ficam preservados para rollback. |
| **R-H** | **FECHADO** | `registarAuditoria` era `void` e podia perder a última escrita quando a função serverless terminava. Passou a **aguardar** a tentativa de auditoria autenticada, sem deixar que uma falha de `audit_log` altere a resposta principal. Provado ao vivo: duas recusas autenticadas isoladas → duas linhas persistidas, sem depender de tráfego posterior. |
| **R-B** | ✅ **FECHADO** — 30/08/2026 | ~~O *Protection Bypass for Automation* ainda existe.~~ **Removido**, e foi o primeiro passo da promoção. Reconfirmado pelo fio a 30/08: quatro deployments antigos a `302` sem bypass, Production a `200`. Ver `RISK_REGISTER.md`. |

---

## Condição para promover

Todas, por esta ordem. Nenhuma é dispensável.

1. **Remover o Protection Bypass for Automation** (R-B) — e só depois disso;
2. confirmar que os Previews voltam a exigir autenticação (o bypass foi mesmo removido,
   não apenas rodado);
3. `npm test` → 235 e `npm run check:predeploy` → verde, com a árvore limpa em `74a1e0b`;
4. promoção **manual**, por CLI, com o candidato identificado pelo SHA;
5. smoke de pós-produção — `BFF_POST_PRODUCTION_SMOKE.md`;
6. gatilhos de rollback armados **antes** do passo 4 — `BFF_PRODUCTION_PROMOTION.md` §5.

**O frontend não se mexe no mesmo dia.** Publicar o BFF e ligar
`VITE_PROTECTED_DATA_TRANSPORT` juntos torna impossível saber qual dos dois partiu o quê.

---

## O que este documento não diz

Não diz que o candidato está aprovado para produção. Diz que está **congelado, testado e
identificado**. A decisão de promover é humana, é da próxima sessão de desktop, e depende
de R-B estar fechado primeiro.
