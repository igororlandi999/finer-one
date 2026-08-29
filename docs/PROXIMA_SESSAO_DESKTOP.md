# Próxima sessão — o que exige desktop

> **Reescrito a 29/08/2026**, ao fim da segunda sessão de telemóvel.
> A versão anterior (28/08) está **obsoleta**: descrevia 222 testes no BFF, 2272 no
> frontend, "BFF ahead 4, frontend ahead 9" e o repositório Git **ligado** à Vercel.
> Nenhuma dessas coisas é verdade hoje. Os passos 3 a 8 dessa versão **foram executados**.
>
> **Ordem importa.** Cada passo assume os anteriores.

---

## Estado real no início desta sessão de desktop

| | |
|---|---|
| **BFF** | `74a1e0b`, **0 à frente / 0 atrás** de `origin/main`, árvore limpa. **235** testes. |
| **Frontend** | **18 commits à frente** de `origin/main` (`4e8b309`). **2316** testes, 92 ficheiros. |
| `.mcp.json` | modificado localmente, **fora do stage**. Não versionar a alteração. |
| Vercel ↔ Git | **desligado** (R-A fechado). Deploy manual por CLI. |
| Production | `kgcs3qugg` — **não** é o candidato, e **não está mapeado a um SHA**. |
| Protection Bypass | **ainda existe** (R-B). É o passo 1. |

Se os números divergirem, **parar e perceber porquê** antes de continuar.

---

## 0. Reposicionar (5 min)

```bash
cd "C:\Users\User\Documents\VS Code\finer-one-proxy"
git status --short && git log --oneline -3
npm test                    # esperado: 235
npm run check:predeploy     # esperado: tudo verde

cd "C:\Users\User\Documents\VS Code\finer-one"
git status --short && git log --oneline -5
npm run check:predeploy     # NOVO nesta sessão — corre testes E build
```

O `check:predeploy` do frontend **imprime os interruptores**. Olhar para eles: dizem em
que etapa do rollout a máquina está configurada, e é isso que seria publicado.

---

## 1. Remover o Protection Bypass (R-B) — **primeiro, e sozinho**

`BFF_PRODUCTION_PROMOTION.md` §1. O smoke que o exigia terminou.

Confirmar pelo fio que um Preview responde `401` **sem** cabeçalho de bypass. Se responder
`200`, o bypass não saiu.

**Não avançar para a promoção no mesmo minuto.** Se algo partir a seguir, quer-se saber se
foi o bypass ou o deploy.

---

## 2. Ler o ambiente de Produção — **só ler** (10 min)

`BFF_PRODUCTION_PROMOTION.md` §2. As duas leituras que mais importam:

- [ ] **`ALLOWED_ORIGINS` existe em Production?** É o risco de promoção nº 1. Sem ela, o
      endpoint legado — que é o que serve a aplicação hoje — fica sem CORS e a aplicação
      inteira mostra "indisponível";
- [ ] **o SHA de `kgcs3qugg`.** Anotar. Fecha `BFF_PRODUCTION_DELTA.md`, que hoje é
      inferência e passa a ser facto:

```bash
git log --oneline <SHA-de-kgcs3qugg>..74a1e0b     # isto É o delta
```

Se `ALLOWED_ORIGINS` faltar: **configurá-la e parar por hoje.**

---

## 3. Promover o BFF (15 min)

`BFF_PRODUCTION_PROMOTION.md` §3–4. Anotar o deployment **anterior** antes de promover —
é o alvo do rollback.

## 4. Smoke de pós-produção (30 min)

`BFF_POST_PRODUCTION_SMOKE.md`, inteiro e pela ordem escrita.

O §6 tem uma verificação que **exige isolamento**: fazer uma recusa autenticada, esperar
dois minutos **sem tráfego nenhum**, e só então consultar o `audit_log`. Foi assim que R-H
foi apanhado — sob tráfego o registo funcionava.

**Depois disto, parar.** O frontend não se mexe no mesmo dia.

---

## 5. (Sessão seguinte) Frontend

`FRONTEND_AUTH_RELEASE_PLAN.md`. Três etapas, uma de cada vez:

| | | |
|---|---|---|
| **E1** | publicar os 18 commits com os interruptores **desligados** | comportamento de hoje, byte a byte |
| **E2** | ligar `VITE_AUTH_MODE=supabase`, leitura ainda legada | ⚠️ ver abaixo |
| **E3** | ligar `VITE_PROTECTED_DATA_TRANSPORT=true` | nunca no mesmo dia de E2 |

> ⚠️ **E2 só é segura a partir de `9531cc8` + `b99c97d`.** Esta sessão encontrou e provou
> um **P1** (R-18) que vivia exatamente nessa etapa: com autenticação ligada e transporte
> legado, trocar para a Finer Teste mostrava os números **reais da Overcel** sob o nome da
> Finer Teste. Publicar a autenticação a partir de `origin/main` reintroduzia-o.
>
> O teste de aceitação de E2 é literalmente esse: **trocar para a Finer Teste tem de
> mostrar "empresa sem dados ligados"**, e não números.

---

## O que **não** fazer

- **Não** enviar os commits do frontend antes do BFF estar em produção e estável.
- **Não** ligar `VITE_PROTECTED_DATA_TRANSPORT` no mesmo dia da promoção do BFF.
- **Não** ligar `COVERAGE_WRITES_ENABLED`.
- **Não** tocar no Apps Script nem em `ANYONE_ANONYMOUS` (R-14).
- **Não** executar migrações SQL.
- **Não** versionar a alteração local do `.mcp.json` (o `check:predeploy` bloqueia se
  estiver em stage).
- **Não** apagar o utilizador de smoke `smoke-fb99be3@example.com` — está ativo de
  propósito.

---

## Se sobrar tempo, por ordem de valor

1. **R-07** — endurecer o contrato do upstream no BFF: recusar `{"error":true}` com `502`
   em vez de o reencaminhar com `200`. Local e testável; precisa do Preview só para
   confirmar que nenhuma resposta legítima do GAS tem essa forma.
2. **R-06 / B-03** — cadeia real de redirects do Apps Script
   (`curl -sIL "$GAS_URL"`). Se for sempre `script.google.com → script.googleusercontent.com`,
   R-06 fecha com uma lista de hosts permitidos em vez de `redirect: "follow"` cego.
3. **R-15** — desenhar `004_audit_log_retention.sql`. **Escrever, não executar.**
4. **R-09** — repor `cobertura.confirmada` na troca de empresa. Sem impacto visível hoje
   (o campo é escrito e nunca lido), mas é a última aresta da mesma família de R-18/R-19.
