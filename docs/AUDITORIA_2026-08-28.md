# AUDITORIA DE SEGURANÇA E CORREÇÃO — 28/08/2026

Sessão longa de auditoria, feita depois de a migração 003 estar aplicada e do Preview
`6d8c0b0` validado. Nada foi commitado, nada foi publicado, nada foi alterado no Supabase
nem na Vercel.

O documento existe por uma razão prática: dois dos achados abaixo são **defeitos reais
que estavam a um passo de ser ativados**, e o passo seguinte do projeto era exatamente
esse. Ficam aqui com a prova, não com a alegação.

---

## 1. Achados, por gravidade

### P0 — o transporte protegido caía para o legado ANÓNIMO

**Onde:** `src/services/dataTransport.js`, `resolveDataTransport`.

**O que era.** Com `VITE_PROTECTED_DATA_TRANSPORT` ligado e autenticação em vigor, dois
ramos devolviam o transporte **legado**:

```
!isValidCompanyId(companyId)      -> LEGADO   (motivo: sem_empresa_valida)
typeof getAccessToken !== "function" -> LEGADO   (motivo: sem_token)
```

O legado é `GET /api/pedidos/vendas`: **anónimo**, sem token e sem membership, e serve
hoje os dados financeiros reais da Overcel.

**Porque é que isto é P0 e não teoria.** No `FinerDataProvider`, `companyId` vem de
`company?.id ?? null`. `null` não é um caso de laboratório — é o valor durante todo o
carregamento das memberships, e é o valor **permanente** de um utilizador sem membership
nenhuma. Com o interruptor ligado, esse utilizador receberia os números reais da Overcel.

**Estado:** não estava ativo — o interruptor está desligado. Era uma mina exatamente
debaixo do passo seguinte do plano.

**Correção.** A partir do momento em que o interruptor está ligado E a autenticação está
em vigor, a falta de empresa ou de token devolve o transporte **NENHUM**. Sem dados,
visivelmente. Nunca o anónimo. Com o interruptor desligado, tudo continua a cair para o
legado — que é o comportamento de hoje e não muda.

**Testes.** `src/services/transporteDeDados.test.js` — os dois testes que **descreviam**
o comportamento antigo ("-> LEGADO") foram substituídos por testes que exigem NENHUM,
mais um que verifica que o transporte nulo não lê nada e um contrapeso que garante que a
instalação atual (interruptor desligado) continua a usar o legado.

---

### P0 — corrida entre empresas: a resposta da anterior sobrepunha-se à atual

**Onde:** `src/context/FinerDataContext.jsx`, `load`.

**O que era.** `load` não se protegia de si próprio. A sequência:

```
1. empresa = Overcel      -> leitura começa. Recebíveis: 1,2 MB. Demora.
2. o utilizador troca     -> empresa = Finer Teste. Nova leitura, novo LOADING.
3. Finer Teste responde   -> rápida (não tem integração). Ecrã vazio, correto.
4. a Overcel chega        -> setSales(dados da Overcel).
```

Resultado: os números da Overcel no ecrã, com "Finer Teste" na barra. Ninguém vê dados a
que não tenha acesso — vê o dinheiro de uma empresa com o nome de outra, que num produto
multiempresa é a pior forma de estar errado, porque parece certa.

O mesmo se aplicava ao `catch` (uma leitura obsoleta a falhar declarava a aplicação
indisponível) e ao `finally` (uma leitura obsoleta apagava o indicador de carregamento da
leitura em curso).

**Correção.** Contador de geração. Cada leitura recebe o número da sua vez e só escreve
no estado se ainda for a vez dela. Não se usa `AbortController` porque o que é preciso
não é parar o pedido — é impedir que o resultado **aterre**.

**Testes.** `src/context/FinerDataContext.corrida.test.jsx` — quatro testes que montam o
provider a sério e controlam quando cada leitura resolve. **Verificado que falham sem a
correção**: removida a guarda, 2 dos 4 falham; reposta, 4/4 passam.

---

### P1 — o estado do upstream era devolvido como se fosse nosso

**Onde:** `api/companies/[companyId]/financial-data.js` e `api/pedidos/vendas.js`.

**O que era.** `res.status(upstream.ok ? 200 : upstream.status)`. O estado do Apps Script
ia cru para o cliente.

**Porque importa.** 401 e 403 têm significado **próprio** neste BFF: "o teu token não
serve" e "esta empresa não é tua". E `src/services/authorizedApi.js` chama
`onUnauthorized` num 401 — o que **termina a sessão**. Um deployment do Apps Script mal
publicado, ou uma página de login do Google, punha o utilizador fora com "sessão
expirada", de sessão perfeitamente válida e sem nada que o explicasse.

**Correção.** Falha do upstream é **502**, sempre. O estado real fica no registo, que é
onde serve para diagnosticar.

**E 200 não chega.** O Apps Script responde HTML, com 200, quando o deployment perde
autorização. Reencaminhar isso com `Content-Type: application/json` seria afirmar que
aquilo é o documento financeiro — e um cliente tolerante leria a falha de análise como
uma lista vazia. Passa a exigir-se que o corpo comece por `{` ou `[`; caso contrário,
502 `UPSTREAM_INVALIDO`. A verificação é do primeiro caractere e não um `JSON.parse`:
o maior corpo real ronda 1,2 MB e analisá-lo por inteiro custaria em todos os pedidos,
incluindo os que correm bem.

**A fronteira que isto não atravessa:** `{"data":[]}` vindo do upstream continua a ser
200. Zero é um facto; o que se recusa é o que não é o contrato.

---

### P1 — o endpoint anónimo reencaminhava tudo o que lhe dessem

**Onde:** `api/pedidos/vendas.js`.

**O que era.** `recurso` e as duas datas iam para o Apps Script com um `String()` pelo
meio e mais nada. O endpoint protegido nunca o fez — tem lista de permissão e verifica a
forma das datas. A diferença entre os dois não era uma decisão: era a ordem por que
foram escritos.

Consequências: a superfície deste endpoint — **o anónimo** — não era a dos quatro
recursos, era a do backend inteiro do Apps Script; e uma data malformada era
reencaminhada tal e qual.

**Correção.** Lista de permissão para `recurso` (400 se desconhecido), forma verificada
para as datas (400 se malformada), recusa de parâmetros repetidos (`String(["a","b"])`
daria `"a,b"` — um valor que ninguém enviou), e `Cache-Control: private, no-store`.

**Nenhum cliente nosso é afetado:** o frontend não envia datas a este endpoint e os
únicos `recurso` que envia são três dos quatro da lista.

---

### P1 — silêncio sobre uma data inválida no endpoint PROTEGIDO

O protegido **deixava cair** uma data malformada e respondia com o período por omissão.
Parecia conservador e não era: quem pede março e recebe o mês corrente recebe números
verdadeiros como resposta a uma pergunta que não fez, e não há nada na resposta que o
denuncie. É o raciocínio de "zero real != indisponível" aplicado ao **período**.

Passa a ser 400 `DATA_INVALIDA`, igual ao legado.

---

### P2 — sem teto declarado para o corpo de um POST

O único POST deste BFF envia menos de 400 bytes. Não havia limite escrito, portanto o
limite era o que a plataforma decidisse — e isso muda sem nos perguntar.

Acrescentado `CORPO_MAX_BYTES = 32 KB`, verificado **antes** do token (recusar um corpo
absurdo não exige saber quem o enviou). Honestamente: isto **não** impede o runtime de
já ter recebido e analisado o corpo. O que faz é declarar um limite nosso, com um estado
próprio (413), e torná-lo testável.

---

### P2 — leitura por cadeia de protótipos em `resolveIntegrationDeclaration`

`config.provider` percorreria a cadeia de protótipos. Num processo onde algo tivesse
poluído `Object.prototype`, uma linha **sem** `provider` passaria a ter um. Passou a ler
propriedade própria, no `config` e no `env`. Custo: duas linhas.

---

### RESOLVIDO — `revenue - payables` como resultado, quando não há DRE

**Onde:** `src/utils/diagnosticsEngine.js` ~139-157.

```js
const despesas  = totalPayables(payablesInMonth(payables, key));
const resultado = round2(receitas - despesas);
const margem    = receitas > 0 ? round2((resultado / receitas) * 100) : null;
...
const resultadoAfirmavel = fm ? (rentabilidadeAvaliavel ? dreResultado : null) : resultado;
const margemAfirmavel    = fm ? (rentabilidadeAvaliavel ? dreMargem   : null) : margem;
```

Com DRE presente, nada vem daqui — está guardado e comentado. **Mas o ramo `fm == null`
é alcançável**: `blingDataService.js` passa `financialMetrics: financeiro.metrics`, e
`metrics` é `comparacao ? comparacao.current : null` (linha ~914). Sem comparação
disponível, `fm` é `null` e o diagnóstico afirma `receitas - contas a pagar` como
resultado e a pseudo-margem como margem — as duas fórmulas que os invariantes proíbem.

**Decidido em 28/08/2026: o diagnóstico cala-se.** Sem demonstração de resultados,
`resultadoAfirmavel` e `margemAfirmavel` ficam `null`, a rentabilidade entra em
`naoAvaliados` com o motivo, e o resumo executivo diz que o resultado e a margem não
puderam ser apurados. Nada os substitui.

As contas a pagar continuam onde são o que dizem ser — vencidos, impacto quantificado,
concentração por categoria e fornecedor, linha "Contas a pagar" do que mudou, e o total
do mês no resumo, com esse nome. A faturação é um facto dos pedidos e continua afirmada.

**A fronteira que isto não atravessa:** um `netResult` de ZERO vindo da DRE é um facto e
continua a comportar-se como um número — avaliável, a penalizar a margem, escrito no
resumo. O que torna a dimensão indisponível é a AUSÊNCIA, nunca um zero real.

**Testes.** `src/utils/diagnosticoSemDre.test.js`, 21 testes. Verificado que 9 falham sem
a correção e que os 12 restantes — os controlos positivos com DRE presente e com zero
real — passam antes e depois. Três testes que **descreviam** o comportamento antigo
("o fallback antigo continua a funcionar") foram reescritos.

---

## 2. O que foi auditado e está limpo

| Área | Resultado |
|---|---|
| CORS — origens parecidas | Comparação exata. 16 impostores recusados, incluindo `github.io.atacante.com`, ponto final, caixa, porta e barra final. Nunca emite `Allow-Credentials`. |
| SSRF | O endereço vem inteiro de `process.env`. `URLSearchParams` codifica os valores; nenhum input do cliente altera host, protocolo ou caminho. Provado nos dois endpoints. |
| `envKey` -> variável de ambiente | Padrão `^GAS_URL(_[A-Z0-9]+)*$`. Bateria de ~40 entradas adversariais: nenhuma alcança `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `VERCEL_OIDC_TOKEN`, `PATH`, `HOME`, `NODE_OPTIONS`, `__proto__` nem `constructor`. |
| `companyId` | Bateria de ~36 entradas: travessia de caminho, `%2e%2e`, unicode homógrafo, nulo embutido, `eq.`, caixa, comprimento. Nenhuma autoriza; a válida continua a passar. |
| Cache de tokens | Chave é o token, valor guarda só sucessos, TTL 15 s, teto 500. Uma falha de rede nunca é um token válido. Sem colisão possível entre utilizadores. |
| Bundle de produção | Sem `service_role`, sem JWT, sem `GAS_URL`, sem URL do Apps Script, sem source maps. A `publishable` está lá — é pública por desenho. |
| Invariantes financeiros | Nenhuma fórmula proibida fora do caso documentado acima. `source: "mock"` só ocorre sem `VITE_API_BASE_URL`, e vem rotulado como demonstração. |
| Dependências do BFF | **Zero**. Sem `dependencies` nem `devDependencies`. |

---

## 3. Roadmap de segurança

### P0 — antes de ativar o transporte protegido
1. As duas correções P0 desta sessão têm de estar em produção (BFF e frontend).
   **BFF: corrigido e publicado (`fb99be3`), por promover.** **Frontend: corrigido e
   commitado localmente, por publicar** — é uma etapa separada e deliberada.
2. ~~Decidir o ramo `fm == null` do `diagnosticsEngine`.~~ **Decidido em 28/08/2026:
   o diagnóstico cala-se. Ver §1.**

### P1 — antes de publicar a auth no frontend
3. **Integração Git da Vercel aponta para o repositório errado** (`finer-one-proxy`,
   público e antigo). Um push para lá constrói código de junho e vai a **produção**.
4. Remover o *Protection Bypass* que o `vercel curl` gerou automaticamente nesta sessão.

### P2 — antes dos primeiros clientes externos
5. `audit_log` sem limitação de taxa — ver §4.
6. Apps Script `ANYONE_ANONYMOUS` — o BFF protege o caminho, não a fonte.
7. CSP (`docs/CSP_PLAN.md`).

### P3 — antes de escalar
8. Segredo por empresa cifrado em `company_integration`, em vez de uma variável de
   ambiente por empresa.
9. JWKS local em vez de `/auth/v1/user` por pedido — só quando a latência incomodar, e
   sem perder revogação.

---

## 4. `audit_log` — três desenhos, e uma recomendação

**Quem escreve.** `lib/protect.js` regista **todas** as recusas, incluindo as de pedidos
sem token nenhum; `manual-coverage` regista as suas operações.

**O vetor.** Um pedido anónimo a um endpoint protegido escreve uma linha. Não é preciso
credencial nenhuma: só o URL, que vai no bundle. Cada linha custa uma escrita no Supabase
e uma invocação de função na Vercel, e o plano Free tem 500 MB.

| | Desenho | Custo | Eficácia |
|---|---|---|---|
| **A** | Limitação de taxa no BFF, em memória | Baixo, sem DDL | **Parcial e honesta**: o estado é por instância, e a Vercel cria instâncias sob carga. Reduz o abuso de uma origem contra uma instância quente; não trava uma carga distribuída. |
| **B** | Deduplicação por janela: colapsar recusas idênticas e contar as suprimidas | Baixo, sem DDL | Mesma limitação de A, mas preserva o sinal forense ("alguém anda a sondar") em vez de o cortar. |
| **C** | Retenção/limpeza + não auditar recusas **sem token** | Exige DDL (política de retenção) e uma decisão de política | **A que resolve.** Uma recusa sem token não tem identidade e quase não tem valor forense; as recusas **autenticadas** — as que dizem alguma coisa — exigem uma conta válida para serem criadas. |

**Decidido: C.** O passo 1 está feito em `lib/protect.js`; o passo 2 fica para quando
houver volume.

**Passo 1 — implementado.** A linha divisória é `decisao.userId`, e não o código HTTP:
`authorizationCore` só o preenche DEPOIS de o token estar verificado. Uma recusa sem
token, com um token que não verifica, com um token sem sujeito ou com um token expirado
tem `userId` nulo e deixa de escrever. Todas as recusas com identidade — 403 sem
membership, 403 papel insuficiente, 400 companyId malformado — continuam auditadas.

Isto inverte a economia do ataque: para criar uma linha passa a ser preciso uma conta
válida. O que se perde é a contagem bruta de sondagens anónimas, que existe nos registos
da plataforma, com data e origem, sem custar uma escrita nossa.

**Testes.** As duas metades, porque metade sem a outra é indistinguível de ter desligado
a auditoria: seis formas de recusa sem identidade que não escrevem nada, quatro formas
com identidade que continuam a escrever com o `userId` certo, e cinquenta sondagens
anónimas em série que não produzem uma linha. `test/deploy-safety.test.mjs` exigia o
CONTRÁRIO e foi reescrito — o aviso que ele carregava sobre o vetor de esgotamento
estava certo, e é o que fecha.

**Passo 2 — retenção — NÃO feito.** Exige DDL, e o combinado desta ronda é não tocar no
Supabase. Fica para quando houver volume que o justifique.

**A e B continuam descartadas.** Acrescentam estado à camada de autorização em troca de
uma garantia parcial — o estado é por instância, e a Vercel cria instâncias sob carga.

---

## 5. Limitação de taxa, em geral

Nenhum dos três endpoints tem limitação de taxa. Numa conta Hobby não há Vercel Firewall
com regras de taxa, e introduzir Redis/KV para isto seria trocar um risco por uma
dependência paga e um ponto de falha novo.

O que existe hoje e ajuda: o CORS restrito impede a página de um terceiro de **ler** as
respostas a partir do browser da vítima; os endpoints protegidos exigem token, o que
torna o abuso rastreável a uma conta. O que não existe: qualquer travão ao volume.

**Recomendação:** tratar quando houver o primeiro cliente externo, e tratar no bordo
(regra de taxa na plataforma), não no código da função. Um contador em memória numa
função serverless dá uma sensação de proteção que não corresponde à garantia.

---

## 6. Nota sobre o Preview validado

O Preview `6d8c0b0` foi validado **antes** destas correções.

**Decidido em 28/08/2026: `6d8c0b0` NÃO é promovido.** Depois dele apareceram dois P0
reais — o transporte protegido a cair para o legado anónimo e a corrida entre empresas —
e o candidato a promover passa a ser um novo, com as correções desta auditoria.

O BFF está em `fb99be3`, publicado no repositório privado. O frontend está commitado
**localmente** e não publicado, de propósito: o repositório é público, e versionar não é
publicar. A ativação da auth e do transporte protegido é uma etapa separada.

---

## 7. Reavaliações desta sessão — o que mudou depois de medir

Três decisões da auditoria foram reabertas por não estarem suficientemente fundamentadas.

### 7.1 Validação de JSON do upstream — MEDIDA, e mudada

A guarda "o primeiro caractere é `{` ou `[`" foi justificada com um argumento de custo
que ninguém tinha medido. Medido (Node 24, corpos com a forma real do payload):

| corpo | `JSON.parse` mediana | p95 | primeiro caractere |
|---|---|---|---|
| 1 MB | 2,3 ms | 4,5 ms | ~0,000 ms |
| 2 MB | 4,4 ms | 9,3 ms | ~0,000 ms |
| 5 MB | 10,6 ms | 14,0 ms | ~0,000 ms |

O maior corpo real ronda 1,2 MB; o timeout do upstream é de 15 000 ms; a ida ao Apps
Script leva centenas de milissegundos. 2,3 ms é ruído.

E o argumento de eficácia era mais forte do que o de custo: o primeiro caractere apanha
HTML e **deixa passar JSON truncado a meio** — exatamente o que uma resposta cortada por
timeout ou por limite de tamanho produz. Começa por `{`, parece o contrato, e um cliente
tolerante lê metade dos títulos como se fossem todos. Um documento financeiro truncado é
pior do que um erro.

Passa a haver `JSON.parse`, com a verificação do primeiro caractere à frente para recusar
HTML sem alocar nada. O resultado é deitado fora e o corpo segue byte a byte: a análise
prova, não transforma. Vive em `lib/contratoUpstream.js`, com a medição no comentário.

**Formato dos quatro recursos, confirmado.** As quatro rotas do Apps Script
(`pedidos`, `despesas`, `recebiveis`, `ajustes-manuais`) devolvem através de `jsonOut_`,
que é `ContentService.createTextOutput(JSON.stringify(obj))` — objeto de topo, sempre.
Incluindo o `{error:true, code:"RECURSO_DESCONHECIDO"}` que o Apps Script devolve com
200, que continua a atravessar como antes.

### 7.2 Teto do corpo — mantido, mas deixou de ser vendido como defesa

`CORPO_MAX_BYTES = 32 KB` **não** é proteção contra DoS, e o código já não o sugere:
quando o handler corre, a plataforma já recebeu e já analisou o corpo. Fica como
**validação de contrato**, que é o que é, por três razões concretas: um corpo fora do
contrato tem estado próprio (413) em vez de rebentar mais à frente com um 400 opaco; o
limite é nosso e está escrito, em vez de ser o que a plataforma decidir este trimestre;
e é verificável sem deploy.

A implementação foi corrigida: media só o `content-length`, que é do cliente. Passa a
usar o **maior** de dois sinais — o declarado e o medido no corpo real (string, `Buffer`
ou objeto já analisado). Um cabeçalho falso não abre nem fecha nada por si: se for
pequeno, o corpo medido apanha-o; se for grande, recusa-se o que o cliente declarou
enviar. A decisão é a mesma nos dois sentidos, e é isso que evita inconsistência. O que
não se consegue medir não recusa nada.

### 7.3 Datas — a forma não chegava

`^\d{4}-\d{2}-\d{2}$` aceita `2026-02-30`, `2026-13-01` e `2025-02-29`. Nenhum é uma
data, e o que o Apps Script faz com um deles não está especificado em lado nenhum. Passa
a validar-se o calendário, no mesmo módulo partilhado pelos dois endpoints.

### 7.4 Matriz de métodos — confirmada nos três endpoints

`test/metodos.test.mjs` exerce GET, POST, HEAD, PUT, PATCH, DELETE, OPTIONS, TRACE,
CONNECT, PROPFIND, minúsculas e string vazia contra os três endpoints, espiando `fetch`.
OPTIONS é 204 sem rede; tudo o que não é o método declarado é 405 sem rede. **HEAD tem
teste próprio**: é 405, não é tratado como GET, e não alcança o upstream — a preocupação
certa, porque é o método com que se sonda um URL e porque essa mudança entraria por um
upgrade de runtime, não por uma linha nossa.

---

## 8. O que fica por fazer, e é conhecido

1. **Retenção do `audit_log`** — passo 2 do desenho C. Exige DDL.
2. **`transport || createLegacyDataTransport()`** em `blingDataService` e
   `manualInputsService`. Não é um escape do interruptor — `FinerDataProvider` passa
   sempre um transporte, e o transporte NENHUM também é um objeto — mas é a única linha
   onde o legado ainda aparece por omissão. Está provado e documentado em
   `transporteProtegido.semLegado.test.js`.
3. **`pr-despesas`** chama "Despesas" a uma variação de contas a pagar. É a mesma
   confusão que o resto do produto trata com cuidado, e sobrevive nos dois ramos.
   Fora do âmbito desta decisão, que era o ramo `fm == null`.
4. **Integração Git da Vercel** aponta para o repositório público e antigo — ver o plano
   em `docs/READINESS_SAAS.md`.
5. **Protection Bypass** gerado pelo `vercel curl`, por remover depois dos smoke tests.
