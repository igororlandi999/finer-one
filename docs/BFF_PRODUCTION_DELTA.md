# BFF — o que Produção ainda não tem

> Escrito a **29/08/2026**, em sessão de telemóvel, **sem acesso à consola da Vercel**.
> Construído a partir do histórico Git local e das provas ao vivo registadas, não da
> consola.

---

## O aviso que tem de vir primeiro

**O deployment de Produção `kgcs3qugg` NÃO está mapeado com certeza a um SHA local.**

Não há, nesta sessão, forma de o provar: a integração Git foi removida (R-A) e com ela
desapareceu a associação automática entre deployment e commit. Ler o SHA de `kgcs3qugg`
exige a consola da Vercel — **bloqueado por eu estar no telemóvel**.

O que se segue é, portanto, de dois tipos, e estão marcados:

- **[CANDIDATO]** — está em `74a1e0b`. Provado por Git local e pelos 235 testes.
- **[PROD?]** — o que Produção tem. Inferido de provas funcionais, com o grau de
  confiança declarado. **Onde não há prova, diz-se que não há.**

**Primeira ação da próxima sessão de desktop:** ler o SHA de `kgcs3qugg` e substituir esta
secção por um facto. Até lá, tratar o delta como o **limite superior** do que falta.

---

## Os commits do candidato

| SHA | Data | Assunto |
|---|---|---|
| `6f2fd7f` | 27/08 | commit inicial do BFF |
| `c08522f` | 27/08 | docs: README a descrever o estado real |
| `5b2542d` | 27/08 | feat: `COVERAGE_WRITES_ENABLED` |
| `6d8c0b0` | 28/08 | feat: fonte financeira server-only por empresa |
| `fb99be3` | 28/08 | fix: endurecer fronteiras antes do transporte protegido |
| `9152ae4` | 28/08 | fix: recusar período de datas invertido |
| `69935df` | 28/08 | fix: limitar `companyId` antes da auditoria |
| `913d603` | 28/08 | chore: `npm run check:predeploy` |
| **`74a1e0b`** | **29/08** | **fix: tornar auditoria autenticada confiável** |

---

## Delta por categoria

### AUTH

| O quê | Onde | Estado |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` deixa de ser usada como interruptor de escrita. Antes, a sua ausência derrubava `loadMemberships` e a **autorização inteira** desaparecia — o owner era recusado na sua própria empresa. | `5b2542d` | **[CANDIDATO]** |
| `COVERAGE_WRITES_ENABLED` passa a ser a única decisão sobre escrita, e falha fechado: **só a string exata `"true"` liga**. `"TRUE"`, `"True"`, `"1"`, `"yes"`, `" true"` — nenhuma. | `5b2542d` | **[CANDIDATO]** |

### AUTHZ

| O quê | Onde | Estado |
|---|---|---|
| `envKey` só casa `^GAS_URL(_[A-Z0-9]+)*$`. Uma linha adulterada em `company_integration` **não consegue nomear** `SUPABASE_SERVICE_ROLE_KEY`. | `6d8c0b0` | **[CANDIDATO]** |
| `companies.integration` deixa de ser pedida no `select` — não é ignorada, **não é trazida**, para não haver valor no processo que alguém use por engano. | `6d8c0b0` | **[CANDIDATO]** |

### MULTIEMPRESA / INTEGRAÇÃO

| O quê | Onde | Estado |
|---|---|---|
| A integração resolve-se de `public.company_integration` (RLS ativa, **zero políticas, zero grants** a `anon`/`authenticated`) em vez de `companies.integration`, que `companies_select_member` deixava **qualquer membro, incluindo um `viewer`**, ler do browser. Com o Apps Script `ANYONE_ANONYMOUS`, essa coluna equivalia a publicar a fonte financeira a todos os membros. | `6d8c0b0` | **[CANDIDATO]** |
| A tabela guarda uma **referência declarativa** (`{"provider":"gas","envKey":"GAS_URL"}`), não o endereço. Um dump é uma lista de nomes de variáveis, não uma fuga. | `6d8c0b0` | **[CANDIDATO]** |
| Uma avaria da integração **não** derruba a leitura: viaja em `integrationErro`. Sem isto, falhar a ler a integração dava 503 também no `manual-coverage`, que nada tem a ver. | `6d8c0b0` | **[CANDIDATO]** |

### UPSTREAM

| O quê | Onde | Estado |
|---|---|---|
| **P1.** Os dois endpoints faziam `upstream.ok ? 200 : upstream.status`. Um `401` do Apps Script chegava como `401` **deste** BFF — e `401` aqui faz `authorizedApi` terminar a sessão. O utilizador era expulso com "sessão expirada" **com a sessão válida**. Passa a ser `502`, sempre. | `fb99be3` | **[CANDIDATO]** |
| `JSON.parse` completo em vez de olhar o primeiro caractere — que apanhava HTML mas deixava passar **JSON truncado** (o que um timeout produz: começa por `{`, parece o contrato, e o cliente lê metade dos títulos como se fossem todos). Custo medido: 1 MB → 2,3 ms; 5 MB → 10,6 ms, contra 15 000 ms de timeout. | `fb99be3` | **[CANDIDATO]** |
| `{"data":[]}` continua `200`. **Zero é um facto.** | `fb99be3` | **[CANDIDATO]** |

### CORS / LEGADO

| O quê | Onde | Estado |
|---|---|---|
| **P1.** `/api/pedidos/vendas` reencaminhava `recurso` e as duas datas **crus** — a superfície não era a dos quatro recursos, era a do **backend inteiro do Apps Script**. Passa a ter lista de permissão. | `fb99be3` | **[CANDIDATO]** |
| Recusa de parâmetros repetidos (`String(["a","b"])` daria um valor que ninguém enviou) e `no-store`. | `fb99be3` | **[CANDIDATO]** |
| O endpoint legado passou de **"aberto por omissão" a "fechado por omissão"**: sem `ALLOWED_ORIGINS`, não há cabeçalho de CORS. ⚠️ Isto é o que mais provavelmente parte o frontend se a variável não estiver em Production. | `fb99be3` | **[CANDIDATO]** — ver §Riscos |

### DATAS

| O quê | Onde | Estado |
|---|---|---|
| `periodoValido` recusa `dataInicial > dataFinal` nos dois endpoints. Antes, o intervalo vazio seguia para o Apps Script, o Bling devolvia `{"data":[]}` com `200`, e o cliente lia **um zero indistinguível de "esta empresa não teve movimento"** — a resposta a uma pergunta que não existe, com a cara de um facto. | `9152ae4` | **[CANDIDATO]** |
| Comparação **lexicográfica** (`AAAA-MM-DD` de largura fixa). Nenhum `new Date`, que introduziria um fuso numa pergunta que não tem nenhum. | `9152ae4` | **[CANDIDATO]** |
| Uma data malformada continua `DATA_INVALIDA`, não `PERIODO_INVALIDO` — senão o cliente corrige a coisa errada. | `9152ae4` | **[CANDIDATO]** |

### AUDIT

| O quê | Onde | Estado |
|---|---|---|
| `metadata.requestedCompanyId` truncado a **64** (o máximo de um id válido). Um titular de conta legítimo podia escrever, por pedido recusado, tanto texto quanto coubesse num URL — numa base com 500 MB e **sem política de retenção** (R-15). | `69935df` | **[CANDIDATO]** |
| **R-H.** `void registarAuditoria(...)` perdia a última escrita: numa função serverless a instância congela quando a resposta sai. **Medido, não deduzido:** no Preview `3bq20q72n`, quatro recusas autenticadas produziram **três** linhas — faltou a última antes do repouso. O registo funcionava melhor sob tráfego e falhava na **sondagem isolada**, que é o caso que existe para apanhar. | `74a1e0b` | **[CANDIDATO]** — **quase de certeza ausente em Produção** (ver abaixo) |
| A auditoria não decide a resposta: quem foi recusado com `403` recebe `403`, grave ou não. O erro é **deitado fora de propósito** — um `console.error` publicaria o endereço do pedido ao Supabase com a `service_role` no cabeçalho. | `74a1e0b` | **[CANDIDATO]** |

### COVERAGE

| O quê | Onde | Estado |
|---|---|---|
| Motivos de indisponibilidade distintos: `supabase_nao_configurado` vs `escrita_de_cobertura_desligada`. Nenhum chega ao corpo da resposta. | `5b2542d` | **[CANDIDATO]** |

### GUARDRAILS

| O quê | Onde | Estado |
|---|---|---|
| `npm run check:predeploy`: repositório correto, árvore limpa, sincronia, 26 ficheiros varridos por padrões de segredo, `.env` não versionado, 235 testes. **Não publica nada.** | `913d603` | **[CANDIDATO]** — ferramenta local, não vai para o servidor |

---

## O que se pode afirmar sobre Produção, e com que confiança

| Afirmação | Confiança | Prova |
|---|---|---|
| Produção **não** tem o `74a1e0b` (R-H). | **Alta** | `74a1e0b` é de 29/08 e nasceu de uma medição feita **no Preview `3bq20q72n`**. Produção `kgcs3qugg` é anterior a essa medição. Nenhuma promoção foi feita desde. |
| Produção **não** tem `913d603`. | **Certa e irrelevante** | É um script local; não existe no servidor em nenhum caso. |
| Produção tem ou não `fb99be3` / `9152ae4` / `69935df`. | **Desconhecida** | O registo de 28/08 dizia que o Preview continha "quatro alterações que a produção não tem" — `PERIODO_INVALIDO` nos dois endpoints e o corte do `requestedCompanyId`. Isso é **consistente** com Produção estar em `6d8c0b0` ou antes, mas **não o prova**: a frase descrevia o estado do *branch*, não o do deployment. |
| Produção tem `ALLOWED_ORIGINS` definida. | **Desconhecida — e é o risco operacional nº 1** | Ver abaixo. |

### O risco de promoção nº 1

Se `ALLOWED_ORIGINS` **não** existir em Production, promover o candidato deixa o frontend
**sem cabeçalho de CORS no endpoint legado** — que é, hoje, o único caminho de leitura em
produção (`VITE_PROTECTED_DATA_TRANSPORT` está vazio). O sintoma não é um erro claro: é a
aplicação inteira a mostrar "indisponível".

**Verificar a variável ANTES de promover, não depois.** É o passo 2 do
`BFF_PRODUCTION_PROMOTION.md`.

---

## Como fechar este documento

Na próxima sessão de desktop, com a consola aberta:

1. ler o SHA de `kgcs3qugg`;
2. `git log --oneline <SHA>..74a1e0b` no repositório do BFF — isso **é** o delta, e
   substitui todas as inferências acima;
3. confirmar `ALLOWED_ORIGINS` em Production;
4. reescrever a secção "o que se pode afirmar" com factos.
