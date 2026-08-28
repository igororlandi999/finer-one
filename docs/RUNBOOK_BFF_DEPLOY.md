# Runbook — publicar o BFF

> **Nenhum passo deste ficheiro contém um token, uma chave ou um URL de deployment.**
> Onde for preciso um segredo, o passo diz onde ele vive — nunca qual é.

Repositório: `igororlandi999/finer-one-bff` (**privado**).
Local: `C:\Users\User\Documents\VS Code\finer-one-proxy`.

---

## Antes de tudo: o repositório certo

Este projeto já teve o Vercel ligado ao `finer-one-proxy` **público e antigo**. Enquanto
isso durou, cada `push` publicava o código errado e nada o dizia.

```bash
npm run check:predeploy
```

Verifica, por esta ordem: remoto correto (e explicitamente **não** o público antigo),
árvore limpa, sincronia com o remoto, varredura de segredos, `.env` não versionados,
testes. **Falha fechado.** Não publica nada.

Se bloquear, resolver o que bloqueou. Não contornar.

---

## 1. Linha de base

```bash
cd "C:\Users\User\Documents\VS Code\finer-one-proxy"
git status
git log --oneline -5
git diff --check
npm test
```

Registar o número de testes. Se divergir do esperado sem que se saiba porquê, **parar**:
um número que ninguém explica é uma alteração que ninguém reviu.

---

## 2. Preview — e só Preview

```bash
vercel
```

**Nunca** `vercel --prod` neste passo. O Preview tem Deployment Protection ativa; o URL
que sai daqui só abre com o Protection Bypass, e é assim que deve ser.

Anotar o URL do Preview. Não o promover.

---

## 3. Smoke test ao Preview

Cada um destes tem uma resposta esperada. Uma resposta diferente é um bloqueio.

| # | Pedido | Esperado |
|---|---|---|
| 1 | `GET /api/pedidos/vendas` | `200`, corpo `{"data":[...]}`, `Cache-Control: private, no-store` |
| 2 | `GET /api/pedidos/vendas?recurso=inexistente` | `400`, `RECURSO_DESCONHECIDO` |
| 3 | `GET /api/pedidos/vendas?dataInicial=2026-02-30` | `400`, `DATA_INVALIDA` |
| 4 | `GET /api/pedidos/vendas?dataInicial=2026-07-31&dataFinal=2026-07-01` | `400`, `PERIODO_INVALIDO` |
| 5 | `GET /api/companies/overcel/financial-data` **sem** `Authorization` | `401`, `UNAUTHENTICATED` |
| 6 | idem, com `Authorization: Bearer lixo` | `401` |
| 7 | `POST /api/companies/overcel/manual-coverage` sem token | `401`, e **zero** escritas |
| 8 | `OPTIONS` em qualquer um | `204` |
| 9 | `DELETE`/`PUT`/`PATCH` em qualquer um | `405` |
| 10 | qualquer um com `Origin: https://exemplo.invalid` | **sem** `Access-Control-Allow-Origin` |

O passo 5 é o que confirma que a proteção está ligada. O passo 10 é o que confirma que o
CORS não caiu no wildcard.

**Os passos que exigem um token válido ficam para uma sessão com desktop e login.**
Estão marcados como bloqueados em `docs/RISK_REGISTER.md`.

---

## 4. Equivalência com produção

O endpoint legado é o que serve a aplicação hoje. Antes de promover, provar que o Preview
responde **o mesmo** que produção para o caminho legado:

- mesmo número de registos em `data` para os quatro recursos;
- mesmo `meta.geradoEm` (ou a mesma ausência dele);
- mesmo `debug.fonte` nos recebíveis.

Uma diferença aqui não é "provavelmente cache". É um bloqueio até se explicar.

---

## 5. Produção — **exige autorização explícita e nominal**

Não fazer parte de nenhuma sessão automática. Os pré-requisitos, todos:

- [ ] `npm run check:predeploy` verde;
- [ ] smoke test do Preview completo, incluindo os passos com token;
- [ ] equivalência com produção confirmada;
- [ ] `ALLOWED_ORIGINS` configurada no Vercel **antes** de publicar
      (⚠️ o endpoint legado passou de "aberto por omissão" a "fechado por omissão":
      publicar sem esta variável deixa o frontend em produção sem cabeçalho de CORS);
- [ ] `GAS_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
      presentes no ambiente de produção;
- [ ] `COVERAGE_WRITES_ENABLED` **ausente ou diferente de `true`**;
- [ ] autorização explícita de quem é dono do produto.

---

## 6. Reverter

O Vercel guarda os deployments anteriores. Reverter é **promover o deployment anterior**,
não fazer um deploy novo a partir de um commit revertido — a segunda opção acrescenta uma
variável (o build) a um momento em que se quer remover variáveis.

Depois de reverter, abrir `docs/RUNBOOK_INCIDENTE_DADOS.md`.

---

## O que este runbook deliberadamente **não** manda fazer

- **Não** ativar `VITE_PROTECTED_DATA_TRANSPORT` ao mesmo tempo que se publica o BFF.
  São duas mudanças, e juntá-las torna impossível saber qual delas partiu o quê.
- **Não** ativar `COVERAGE_WRITES_ENABLED`. A autorização de escrita é uma decisão
  separada da publicação, de propósito.
- **Não** mexer no Apps Script. Continua `ANYONE_ANONYMOUS`, e mudá-lo no mesmo dia de um
  deploy do BFF junta duas variáveis pela mesma razão de cima.
