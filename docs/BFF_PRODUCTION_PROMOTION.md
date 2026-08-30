# Promoção do BFF a Produção — passos exatos

> # ✅ EXECUTADO. ESTE FICHEIRO É REGISTO, NÃO INSTRUÇÕES.
>
> **`74a1e0b` está em Production** e o smoke autenticado terminou. **Não voltar a correr
> os passos abaixo.** O corpo fica como estava, por ser o registo do que se fez.
>
> Duas correções ao que o corpo afirma, ambas de **30/08/2026**:
>
> 1. **§Estado de partida — "Protection Bypass: ainda existe (R-B)" está DESATUALIZADO.**
>    O bypass foi removido no passo 1 desta promoção. **R-B está FECHADO**, reconfirmado
>    pelo fio a 30/08: os quatro deployments antigos respondem `302` sem cabeçalho de
>    bypass, a Production responde `200`. Evidência em `RISK_REGISTER.md`.
> 2. **§1 — o critério de aceitação `esperado: 401` está desatualizado.** A Deployment
>    Protection da Vercel redireciona para o SSO: o que se observa é **`302`**, não `401`.
>    A afirmação que o passo queria provar — *um deployment protegido não entrega o corpo
>    sem autenticação* — está provada na mesma. Quem reler isto e vir `302` **não deve
>    parar**.

> Escrito a **29/08/2026**. **Nada disto foi executado nessa sessão.**
> Este ficheiro é a sequência para a próxima sessão de desktop, escrita quando havia
> contexto para a escrever com cuidado — e não a meio da execução, que é quando se salta
> um passo.
>
> O processo genérico está em `RUNBOOK_BFF_DEPLOY.md`. **Este documento é sobre este
> candidato**, e assume o que está em `BFF_RELEASE_CANDIDATE.md`.

---

## Estado de partida (29/08/2026)

| | |
|---|---|
| Candidato | `74a1e0b` — `origin/main == HEAD`, 235/235, predeploy verde |
| Preview validado | `finer-one-proxy-4exxus4x8-…` · `dpl_D6aQZwbC5hsEywGQeFDMwRZfqkPz` |
| Produção atual | `kgcs3qugg` · `https://finer-one-proxy.vercel.app` |
| Git ↔ Vercel | **desligado** (R-A fechado). Deploy manual por CLI. |
| Protection Bypass | ~~**ainda existe** (R-B). É o passo 1.~~ → **removido no passo 1. R-B FECHADO** (ver o cabeçalho). |
| Frontend | `VITE_PROTECTED_DATA_TRANSPORT` **vazio** → produção lê pelo **legado** |

⚠️ **A última linha é a mais importante desta página.** Hoje o frontend em produção lê
pelo endpoint legado. Portanto o que a promoção pode partir **não** é o caminho protegido
— é o legado. Todo o smoke pós-promoção tem de começar por aí.

---

## 1. Remover o Protection Bypass for Automation (R-B)

**Primeiro, e sozinho.** O smoke que o exigia já terminou; mantê-lo é uma porta aberta sem
utilizador.

1. Vercel → projeto `finer-one-proxy` → Settings → Deployment Protection;
2. remover o *Protection Bypass for Automation*;
3. **confirmar que foi removido, não rodado.**

**Verificação — sem isto o passo não está feito:**

```bash
# Um Preview protegido, SEM cabeçalho de bypass, tem de responder 401
curl -s -o /dev/null -w "%{http_code}\n" "$PREVIEW_URL/api/pedidos/vendas"
# esperado: 401  (a página de autenticação da Vercel)
```

Se responder `200`, o bypass **não** saiu. Parar aqui.

> **Não avançar para o passo 3 no mesmo minuto.** Se alguma coisa partir a seguir, quer-se
> saber se foi o bypass ou a promoção.

---

## 2. Ler o ambiente de Produção — **só ler**

Nenhuma alteração. O que confirmar:

- [ ] **`ALLOWED_ORIGINS` existe em Production** e o valor é exatamente a origem do
      frontend (`https://igororlandi999.github.io`).
      ⚠️ **É o risco de promoção nº 1.** O endpoint legado passou de "aberto por omissão"
      a "fechado por omissão". Sem esta variável, promover deixa o frontend **sem CORS** e
      a aplicação inteira mostra "indisponível". Ver `BFF_PRODUCTION_DELTA.md` §Risco nº 1;
- [ ] `GAS_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` presentes;
- [ ] `COVERAGE_WRITES_ENABLED` **ausente ou diferente de `true`**;
- [ ] **o SHA do deployment `kgcs3qugg`** — anotar. Fecha `BFF_PRODUCTION_DELTA.md`;
- [ ] **o id do deployment atual** — é o alvo do rollback. Anotar **antes** de promover.

Se `ALLOWED_ORIGINS` faltar: **configurá-la e parar por hoje.** Uma variável de ambiente
nova e uma promoção são duas mudanças.

---

## 3. Confirmar o candidato localmente

```bash
cd "C:\Users\User\Documents\VS Code\finer-one-proxy"
git status --short          # esperado: vazio
git log --oneline -1        # esperado: 74a1e0b
git rev-list --left-right --count origin/main...HEAD   # esperado: 0  0
npm test                    # esperado: 235 a passar
npm run check:predeploy     # esperado: tudo verde
```

Qualquer divergência: **parar e perceber porquê.** Um número que ninguém explica é uma
alteração que ninguém reviu.

---

## 4. Promover

Deploy **manual**, porque a integração Git está desligada de propósito (R-A).

```bash
cd "C:\Users\User\Documents\VS Code\finer-one-proxy"
vercel --prod
```

Anotar **imediatamente**:

- o novo deployment id;
- o deployment id **anterior** (do passo 2) — é para onde se volta;
- a hora.

Depois: confirmar que `https://finer-one-proxy.vercel.app` resolve para o **novo**
deployment, e não para um alias residual.

---

## 5. Smoke de pós-produção

`BFF_POST_PRODUCTION_SMOKE.md`. **Correr inteiro**, pela ordem escrita. O passo 1 desse
ficheiro (legado + CORS) é o que decide se se fica ou se se volta atrás.

---

## 6. Rollback

### Gatilhos — qualquer um, sem discussão

| Sintoma | Porque é gatilho |
|---|---|
| **Sem `Access-Control-Allow-Origin`** para a origem do frontend | A aplicação inteira fica "indisponível". É o modo de falha mais provável desta promoção. |
| **Ciclo de 401** no frontend | Um `401` faz `authorizedApi` terminar a sessão. Um ciclo põe o utilizador fora repetidamente. |
| **`403` a um `owner`** na sua própria empresa | Foi exatamente o sintoma de usar a `service_role` como interruptor (`5b2542d`). Se voltar, a autorização caiu. |
| **Overcel a responder vazio** onde antes tinha dados | Um zero indistinguível de "sem movimento" é a pior falha possível aqui. |
| **`5xx` sustentado** em qualquer endpoint | — |
| **Qualquer escrita em `company_coverage`** | Deve continuar a **0**. Uma linha nova significa que `COVERAGE_WRITES_ENABLED` ligou. |
| **Equivalência legacy quebrada** (contagens diferentes de antes da promoção) | Não é "provavelmente cache". |

### Como reverter

**Promover o deployment anterior** — não fazer um deploy novo a partir de um commit
revertido. A segunda opção acrescenta uma variável (o build) num momento em que se querem
**remover** variáveis.

```bash
vercel rollback <deployment-id-anterior>
# ou, na consola: Deployments -> o anterior -> Promote to Production
```

Os deployments antigos **estão preservados** — foi decisão explícita ao limpar os aliases
residuais (R-A). O alvo existe.

### Confirmar que o rollback pegou

```bash
curl -sI "https://finer-one-proxy.vercel.app/api/pedidos/vendas" \
  -H "Origin: https://igororlandi999.github.io" | grep -i "access-control-allow-origin"
curl -s "https://finer-one-proxy.vercel.app/api/pedidos/vendas" | head -c 200
```

Esperado: cabeçalho presente, e o mesmo corpo de antes da promoção. **Não** confiar no
painel: confirmar pelo fio.

Depois de reverter: `RUNBOOK_INCIDENTE_DADOS.md`.

---

## 7. O que **não** fazer no mesmo dia

- **Não** ligar `VITE_PROTECTED_DATA_TRANSPORT`. Depende desta promoção estar estável, e
  juntá-las torna impossível saber qual partiu o quê. Ver `FRONTEND_AUTH_RELEASE_PLAN.md`.
- **Não** ligar `COVERAGE_WRITES_ENABLED`.
- **Não** enviar os commits do frontend.
- **Não** tocar no Apps Script nem em `ANYONE_ANONYMOUS`.
- **Não** executar migrações SQL.
