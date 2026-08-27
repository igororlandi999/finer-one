# Checklist de publicação dos P0 — executar quando chegar a casa

> ## 🔒 REDIGIDO PARA VERSIONAMENTO
>
> Os identificadores de deployment do Apps Script foram substituídos por
> `<APPS_SCRIPT_DEPLOYMENT_ID — NÃO VERSIONAR>`, `<DEPLOYMENT_OFICIAL>` e `<DEPLOYMENT_HEAD>`.
>
> **Porquê:** este repositório é **público**, o Web App está publicado como
> `ANYONE_ANONYMOUS`, e o URL de leitura constrói-se diretamente a partir do
> deployment ID (`https://script.google.com/macros/s/{id}/exec`). Versionar o
> identificador equivaleria a publicar a fonte de dados financeiros da Overcel —
> sem password, sem token, a quem passasse pelo repositório.
>
> **Onde está o valor real:** `cd apps-script && npx clasp deployments`. O oficial é o
> que está em `@12`; o outro é o `@HEAD` de desenvolvimento. O `scriptId` vive em
> `apps-script/.clasp.json`, que passou a ser ignorado pelo git pela mesma razão.
>
> Todo o resto do documento — comandos, ordem, verificações, rollback — está intacto.


Estado em 23/08/2026: **código pronto e verde localmente, publicação bloqueada** por uma
definição de conta Google. Tudo o resto já foi verificado.

> **25/08/2026, 20:01–20:05 — a versão 12 FOI PUBLICADA.** Registo de execução no fim do
> ficheiro. O texto abaixo descreve o estado antes dessa publicação e mantém-se por ser o
> procedimento a repetir.
>
> **Atualização de 25/08/2026 — este checklist estava CONCLUÍDO; havia uma versão 12 por fazer.**
> A versão 11 foi publicada em 24/08 (registo no fim do ficheiro). Depois disso, o
> backend local ganhou trabalho que **nunca foi publicado** e que este checklist não cobre:
>
> - deteção de **truncamento de paginação** (`paginacaoTruncada_`) e a sua propagação a
>   `meta.parcial` nos três paginadores;
> - **sonda de página +1** (`terminacaoPrematura_`) e o aborto do rebuild de despesas e
>   recebíveis quando a paginação termina cedo — ver
>   `docs/INTEGRIDADE_SNAPSHOT_ESTRATEGIAS.md` §4;
> - medição do **custo da listagem** de recebíveis em `meta` (`listagemMs`, `orcamentoMs`).
>
> Produção corre hoje a **versão 11**: nenhuma destas alterações está lá. Os passos 1 a 6
> repetem-se tal como estão para uma **versão 12** — só muda a mensagem do passo 2 — e a
> decisão de publicar é sua. **Nada foi publicado na sessão de 25/08.**

Contexto que não precisa de rever:

- conta autenticada no clasp: `igororlandibarros@gmail.com` (**a correta** — o bloqueio
  não é de conta trocada);
- deployment do Web App: `<APPS_SCRIPT_DEPLOYMENT_ID — NÃO VERSIONAR>`;
- **versão ativa hoje: `@10`** — este é o alvo de rollback;
- o proxy aponta **exclusivamente** para esse deployment (payload byte-idêntico, verificado);
- o deployment `@HEAD` **exige login Google** — não é uma superfície anónima.

Todos os comandos correm em `apps-script/`.

---

## 0. Desbloquear (o passo que falta)

- [ ] Abrir **https://script.google.com/home/usersettings** com `igororlandibarros@gmail.com`
- [ ] Ligar **Google Apps Script API**
- [ ] Esperar 2-3 minutos a propagar

Confirmar que destrancou — este comando falhava antes e tem de passar agora:

```sh
cd apps-script && npx clasp status
```

---

## 1. Push

```sh
npx clasp push --force
```

- [ ] Termina **sem erro**
- [ ] Envia **15 ficheiros**
- [ ] **Nenhum `*.test.js`** na lista. São **9** desde 25/08/2026 — `blingRateLimit`,
      `recursoDesconhecido`, `redacaoPublica`, `snapshotIntegridade`, `logSemPII`,
      `paginacaoTruncada`, `metadataCobertura`, `quedaMassiva`, `escalaListagem`. O
      `.claspignore` exclui-os por padrão (`*.test.js`), pelo que a contagem pode crescer
      sem que a lista de envio mude. **O que verifica é a lista do `clasp status`, não
      este número.**

Se aparecer algum ficheiro de teste: **PARAR**. Não continuar para o passo 2.

---

## 2. Criar a versão 11

```sh
npx clasp version "P0: redacao de PII em recebiveis, guarda de snapshot vazio, backoff 429"
```

- [ ] Anotar o número devolvido. **Deve ser `11`.**
- [ ] Se devolver outro número, usar esse nos passos seguintes.

---

## 3. Atualizar o deployment EXISTENTE

`update-deployment` altera a versão **mantendo o mesmo Deployment ID e o mesmo URL**.
Não usar `clasp deploy` sem `-i`: isso criaria um deployment novo.

```sh
npx clasp update-deployment <APPS_SCRIPT_DEPLOYMENT_ID — NÃO VERSIONAR> -V 11 -d "P0 publicados"
```

Confirmar:

```sh
npx clasp deployments
```

- [ ] Continuam **2 deployments** (nenhum criado)
- [ ] `<DEPLOYMENT_OFICIAL>` agora diz **`@11`**
- [ ] `<DEPLOYMENT_HEAD>` continua `@HEAD`
- [ ] `appsscript.json` não foi tocado → `executeAs` e `access` inalterados

---

## 4. Validar

```sh
node -e "
const B='https://finer-one-proxy.vercel.app/api/pedidos/vendas';
const P=/telefone|celular|email|endereco|logradouro|cep|municipio|numeroDocumento/i;
(async()=>{
  const g=async r=>{const u=new URL(B);if(r)u.searchParams.set('recurso',r);
    return (await fetch(u,{headers:{Accept:'application/json'}})).json();};
  for(const [r,esp] of [[null,1071],['despesas',301],['recebiveis',1390]]){
    const j=await g(r); const d=j.data||[];
    console.log((r||'pedidos').padEnd(12), d.length, 'registos', d.length===esp?'OK':'<-- DIVERGE (esperado '+esp+')');
  }
  const j=await g('recebiveis'); const d=j.data||[];
  const ck=new Set(); let doc=0;
  for(const t of d){ if(t.contato) { for(const k of Object.keys(t.contato)) ck.add(k);
    if(t.contato.numeroDocumento) doc++; } }
  console.log('contato ->', [...ck].sort().join(','), '| com documento:', doc);
  console.log('PII residual:', [...ck].filter(k=>P.test(k)).join(',')||'NENHUMA');
  const a=await g('ajustes-manuais');
  console.log('ajustes ->', Array.isArray(a.data)?'LISTA (ERRADO)':'documento OK');
  const x=await g('xyz');
  console.log('recurso xyz ->', x.code||('fallback '+(x.data||[]).length+' pedidos <-- ERRADO'));
})();
"
```

Aceitar **só** se:

- [ ] pedidos **1071**, despesas **301**, recebíveis **1390**
- [ ] `contato -> id,nome,tipo` — exatamente estes três
- [ ] `com documento: 0`
- [ ] `PII residual: NENHUMA`
- [ ] `ajustes -> documento OK`
- [ ] `recurso xyz -> RECURSO_DESCONHECIDO`

Depois:

```sh
cd .. && npm run check:data
```

- [ ] **SAUDÁVEL**, três fontes com `parcial=false`

---

## 5. Rollback — se qualquer caixa do passo 4 falhar

```sh
cd apps-script && npx clasp update-deployment <APPS_SCRIPT_DEPLOYMENT_ID — NÃO VERSIONAR> -V 10 -d "rollback"
```

Confirmar `@10` em `npx clasp deployments` e repetir a validação do passo 4 — deve voltar
ao comportamento antigo (`recurso xyz` volta a devolver 1071 pedidos, PII volta a aparecer).

O rollback é imediato porque a versão 10 continua a existir: publicar uma versão **nova**,
em vez de sobrepor, é precisamente o que o torna possível.

---

## 6. Na madrugada seguinte

Os três gatilhos correm às 01:00, 02:00 e 03:00 (America/Sao_Paulo).

- [ ] `script.google.com` → **Execuções**: 3 execuções, todas `Concluído`
- [ ] Sem `HTTP 429` — ou, havendo, com `HTTP 429 recuperado em … apos N tentativa(s)`
- [ ] Sem `ABORTADO: listagem … veio VAZIA`
- [ ] Sem `devolveu 'data' que nao e uma lista`
- [ ] Acionadores: continuam **3**, taxa de erro 0%
- [ ] `npm run check:data` → `geradoEm` do próprio dia nas três fontes

---

## Não fazer

- `clasp deploy` **sem `-i`** — cria deployment novo
- `clasp push --watch` — publica a cada gravação local
- tocar em `appsscript.json` (`executeAs`, `access`)
- tocar em OAuth/scopes, `closedThroughMonth`, ou classificação de títulos

---

## REGISTO DE EXECUÇÃO — 24/08/2026, 18:02–18:06 (hora local)

O toggle do passo 0 foi ligado e **destrancou o push**. Executado até ao fim, sem rollback.

| Etapa | Resultado |
|---|---|
| `clasp status` | 15 tracked, 0 `*.test.js`, 0 `node_modules`, 0 `diagnostico/*.json` |
| `npm test` | 1359 passed / 43 ficheiros |
| `npm run build` | verde |
| `clasp push --force` | **Pushed 15 files** — desbloqueado |
| `clasp version` | **Created version 11** |
| `update-deployment -V 11` | `<DEPLOYMENT_OFICIAL> @11`, mesmo ID, mesmo URL |
| `clasp deployments` | continuam **2** — nenhum criado |
| `appsscript.json` | não tocado → `USER_DEPLOYING` / `ANYONE_ANONYMOUS` inalterados |

### Antes → depois (mesma máquina, ~4 min de intervalo)

| | pré-push (@10) | pós-push (@11) |
|---|---|---|
| pedidos | 1071, `parcial=false` | 1071, `parcial=false` |
| despesas | 301, `parcial=false` | 301, `parcial=false` |
| recebíveis | 1414, `parcial=false` | 1414, `parcial=false` |
| `meta.geradoEm` (3 fontes) | 08-23T04:06 / 08-24T05:05 / 08-24T06:05 | **idênticos** |
| `contato` em recebíveis | `id, nome, numeroDocumento, tipo` | **`id, nome, tipo`** |
| títulos com documento pessoal | **1413** (481 CPF, 932 CNPJ) | **0** |
| `?recurso=xyz` | 1071 pedidos, HTTP 200, silencioso | **`RECURSO_DESCONHECIDO`**, `data` vazio |

`meta.geradoEm` byte-idêntico nas três fontes prova que a publicação não regenerou
snapshots: a redação vive só na serialização pública.

### PII — varredura do payload completo, não só de `contato`

- `contato` por recurso: pedidos `id,nome` · despesas `id,nome` · recebíveis `id,nome,tipo`
- zero ocorrências de CPF/CNPJ formatado (`###.###.###-##`, `##.###.###/####-##`) em
  qualquer um dos três payloads
- sem `telefone`, `celular`, `email`, `endereco`, `logradouro`, `cep`, `municipio`
- o `numeroDocumento` que subsiste está no **título**, não no contato: é o número da
  nota/duplicata (`#########`, `######/##`). 0 valores com forma de CPF ou de CNPJ.
  Não é PII e o front usa-o.

### Recurso em branco

`?recurso=` (vazio ou só espaços) continua a servir pedidos — **intencional**,
documentado em `Código.js:214-216`: a guarda só rejeita recurso *presente e desconhecido*.
`?recurso=pedidosX` → `RECURSO_DESCONHECIDO`.

### Não relacionado com esta publicação

`check:data` fica em **ATENÇÃO** por frescura de PEDIDOS (`geradoEm` de 23/08, 41 h).
Estava **exatamente igual antes do push** — não é regressão. Despesas (02 h) e
recebíveis (03 h) correram esta madrugada; pedidos (01 h) não atualizou o snapshot.
A confirmar em `script.google.com` → Execuções.

---

## REBUILD MANUAL DE PEDIDOS — 24/08/2026, 18:36 (recuperação da falha de 01:06)

O trigger das 01:06 falhou com `HTTP 429` do Bling (código antigo, sem throttle). Rebuild
manual disparado pelo editor às 18:36:52, já com o `blingGet_` endurecido no HEAD.

```
18:36:55  Access token renovado. Validade (s): 21600
18:36:55  Pagina 1, 2                    ← 2 no segundo
18:36:56  Pagina 3, 4, 5                 ← 3 no segundo (teto do throttle de 350 ms)
18:36:57  Pagina 6, 7, 8 (2 pedidos)     ← 3 no segundo. NENHUM 429.
18:36:57  Rebuild | pedidos na janela 2026-05-26 a 2026-08-24: 702
18:37:27  Total consolidado: 1103 | novos 32 | atualizados 670 | preservados 401
18:37:27  Com itens: 1103 | Sem itens: 0 | Tempo aprox.: 34s
```

Status **Concluído**, 35.18 s. Zero `429`, zero backoff, zero warning, `parcial=false`.

Contraste com a falha da madrugada: o código antigo morreu na **página 4**; o novo passou
as **8** sem um único 429. Nunca mais de 3 chamadas por segundo-calendário — o máximo
que 350 ms de espaçamento permite.

Integridade verificada contra um baseline capturado antes do rebuild:

- **0** ids do snapshot anterior desapareceram (1071 → 1103, +32 todos de agosto)
- março, abril, maio, **junho e julho**: contagem e total idênticos ao cêntimo
- `semItens: 0` antes e depois — nenhum pedido degradou
- `preservados` 390 → 401: a janela deslizou um dia, 11 pedidos saíram dela e passaram
  a histórico. Aritmética fecha: 702 na janela + 401 preservados = 1103.

`npm run check:data` → **SAUDÁVEL**, `frescura: fresh`, 4 fontes completas, pior fonte
passa a ser DESPESAS (16 h, normal). PEDIDOS volta a `fresh` com `geradoEm`
`2026-08-24T21:37:25.313Z`.

**Por validar:** o backoff de 429 não chegou a ser exercitado (não houve 429 para
recuperar). O throttle que o evita, esse, está provado em runtime.


---

## REGISTO DE EXECUÇÃO — 25/08/2026, 20:01–20:05 (hora local)

Versão **12** publicada no deployment oficial. **Sem rollback.**

### Prechecks

| Verificação | Resultado |
|---|---|
| `node --check` (14 ficheiros não-teste) | todos OK |
| Testes Apps Script | 146 passed / 9 ficheiros |
| `npm test` | **1632 passed / 60 ficheiros** |
| `npm run build` | verde |
| `npm run check:data` | SAUDÁVEL — 3 fontes `parcial=false` |
| `clasp status` | **15 tracked**, 0 `*.test.js` (os 9 ficam untracked), 0 diagnósticos, 0 secrets |
| Busca de secrets nos tracked | só placeholders (`COLE_AQUI_O_CLIENT_SECRET`) e nomes de Script Properties |
| `appsscript.json` | `USER_DEPLOYING` / `ANYONE_ANONYMOUS` — inalterado, sem bloco `oauthScopes` |
| `clasp deployments` (antes) | `<DEPLOYMENT_OFICIAL>` **@11** "P0 publicados" |

### Publicação

| Passo | Resultado |
|---|---|
| `clasp push --force` | **Pushed 15 files** às 20:01 — nenhum `*.test.js` |
| `clasp version "P1 hardening: …"` | **Created version 12** |
| `update-deployment … -V 12` | `Redeployed <DEPLOYMENT_OFICIAL> @12` |
| `clasp deployments` (depois) | continuam **2** — nenhum criado; `<DEPLOYMENT_OFICIAL>` **@12**, `<DEPLOYMENT_HEAD>` `@HEAD` |

> O primeiro `clasp deployments` a seguir ao update ainda devolveu `@11`: **atraso de
> propagação da listagem**, não falha. A chamada seguinte devolveu `@12`. Vale a pena
> repetir a leitura antes de concluir seja o que for.

### Antes → depois (mesmo caminho da aplicação, ~4 min de intervalo)

| | pré-deploy (@11) | pós-deploy (@12) |
|---|---|---|
| pedidos | 1103, `parcial=false` | **1103**, `parcial=false` |
| despesas | 301, `parcial=false` | **301**, `parcial=false` |
| recebíveis | 1421, `parcial=false` | **1421**, `parcial=false` |
| `meta.geradoEm` | 04:06 / 05:05 / 06:05 (25/08) | **byte-idênticos** |
| `contato` em recebíveis | `id, nome, tipo` | `id, nome, tipo` |
| `com documento` | 0 | **0** |
| PII residual | NENHUMA | **NENHUMA** |
| `?recurso=xyz` | `RECURSO_DESCONHECIDO` | `RECURSO_DESCONHECIDO` |
| `ajustes-manuais` | documento | documento |

`geradoEm` idêntico é o ponto: **nenhum snapshot foi regenerado por causa do deploy.**

### O que ainda NÃO se vê em produção, e é esperado

`meta.paginasLidas`, `meta.listagemTruncada`, `meta.listagemMs` e `meta.orcamentoMs` vêm
`undefined` nos snapshots servidos — foram **gravados pela versão 11**. Os campos novos
aparecem no **primeiro rebuild** com a v12 (gatilhos às 01:00, 02:00 e 03:00
America/Sao_Paulo). A sonda de página +1 só corre nesse rebuild, pela mesma razão.

### Validação visual (localhost → proxy → deployment @12)

Resumo, Despesas, Performance Financeira, Alertas e Chat: sem `€`, sem `NaN`, sem
`undefined`, sem `[object Object]`, sem cartão "Resultado (Mês)" nu, **consola sem erros
nem avisos**. Cartões com o mês nomeado: receitas *agosto de 2026 · mês em curso*, contas
a pagar *vencimentos de agosto de 2026*, DRE *mês de referência: junho de 2026*.
