# Segurança do Web App — superfície de ataque

> Auditoria de 2026-08-23. **Nada foi alterado em produção.**
> `access` continua `ANYONE_ANONYMOUS`. As correções descritas são locais.

> **REVERIFICADO 23/08/2026 (tarde), contra produção ao vivo.** As conclusões abaixo
> mantêm-se, e a exposição **continua ativa**: `?recurso=recebiveis` devolve 1390 títulos,
> 1389 com `contato.numeroDocumento` — 481 CPF e 908 CNPJ, 278 contactos distintos.
> A correção existe localmente mas não foi publicada (`clasp push` bloqueado pela
> *Google Apps Script API* desligada na conta). Ver
> [`PUBLICACAO_P0_CHECKLIST.md`](./PUBLICACAO_P0_CHECKLIST.md).
>
> Varrimento aos **quatro** recursos públicos, não só recebíveis:
>
> | Recurso | Contacto | PII |
> |---|---|---|
> | pedidos | `id, nome` | nenhuma |
> | despesas | `id, nome` | nenhuma — os 20 `numeroDocumento` preenchidos têm 9 chars, nenhum com forma de CPF/CNPJ |
> | ajustes-manuais | — | nenhuma (só CMV) |
> | recebíveis | `id, nome, numeroDocumento, tipo` | **481 CPF + 908 CNPJ** |
>
> Telefone, email e morada **nunca são recolhidos**: `baseContaReceber_` é whitelist, e
> por isso não chegam sequer ao snapshot. A redação de `contato` passou entretanto a
> **allow-list**, para que um campo pessoal novo do Bling caia por omissão.
>
> **Deployment `@HEAD` não é superfície anónima:** devolve a página de login do Google,
> não JSON. O proxy aponta exclusivamente para o deployment versionado `@10` — verificado
> por hash byte-a-byte do payload.

---

## 1. A configuração, e o que ela significa

```jsonc
// apps-script/appsscript.json
"webapp": {
  "executeAs": "USER_DEPLOYING",
  "access": "ANYONE_ANONYMOUS"
}
```

Traduzido: **qualquer pessoa com o URL** invoca o `doGet`, sem autenticação, e o código
corre **com a identidade de quem implantou** — com o token do Bling dessa conta e acesso
ao Drive dessa conta.

### 1.1 O URL não é secreto

O backend é consumido através de um proxy, `https://finer-one-proxy.vercel.app/api`, cujo
valor vem de `VITE_API_BASE_URL`. O Vite **inlina** variáveis `VITE_*` no bundle. Medido
neste repositório:

```
$ npm run build && grep -rho "https://finer-one-proxy[a-zA-Z0-9./-]*" dist/
https://finer-one-proxy.vercel.app/api        ← em dist/assets/index-*.js
```

Assim que o `dist/` for publicado (`npm run deploy` → GitHub Pages), **o endereço do
backend está no código-fonte da página**, visível a qualquer visitante. O `.env` estar no
`.gitignore` protege o ficheiro, não o valor.

O proxy foi sondado e é **transparente** para o parâmetro `recurso` (§4). Não acrescenta
autenticação nenhuma: é um encaminhador.

**Conclusão: o dataset financeiro completo é, hoje, publicamente legível por quem abrir a
aplicação e ler o JavaScript.** Não há uma vulnerabilidade a explorar — não há controlo de
acesso nenhum para contornar.

---

## 2. Inventário de recursos

| Recurso | Natureza | Público hoje | Devia ser |
|---|---|---|---|
| *(sem parâmetro)* / `?recurso=pedidos` | leitura | sim | autenticado |
| `?recurso=despesas` | leitura | sim | autenticado |
| `?recurso=recebiveis` | leitura | sim | autenticado |
| `?recurso=ajustes-manuais` | leitura | sim | autenticado |
| `?code=…` (retorno OAuth) | interno | **sim** | interno |
| `runRebuild*Snapshot` | escrita | **não** — só gatilho/editor | como está |
| `installDaily*Trigger` | escrita | **não** | como está |
| `setCredentials_`, `exchangeAuthorizationCode_` | escrita de segredos | **não** — sufixo `_` | como está |

**Não existe `doPost`.** Confirmado por varrimento dos 15 ficheiros: a única entrada HTTP é
`doGet`. Não há via de escrita exposta.

**A convenção do sufixo `_` é a defesa estrutural**: o Apps Script não expõe funções
terminadas em `_` fora do projeto. Todas as funções que escrevem no Drive ou tocam nas
Script Properties a respeitam. As que não têm o sufixo (`runRebuild*`,
`installDaily*Trigger`) só são invocáveis pelo editor ou por um gatilho — nunca por HTTP.

---

## 3. Dado pessoal exposto — o achado principal

Medido no que o endpoint **realmente devolve**, não no que se supõe:

```
recebíveis: 1390 títulos · 279 contactos distintos
contato.numeroDocumento preenchido em 1389 títulos
   481 com 11 dígitos  ->  CPF de pessoa singular
   908 com 14 dígitos  ->  CNPJ de empresa
contato.tipo: 908 "J" (jurídica) · 482 "F" (singular)
```

**481 CPF de pessoas singulares, com nome associado, num endpoint anónimo.** É dado
pessoal na aceção da LGPD.

Campos de instrumento de pagamento — `linkQRCodePix`, `linkBoleto`, `idTransacao` — estão
presentes na **estrutura** mas vazios em todos os 1390 títulos. Não há links de pagamento
expostos hoje; há um lugar reservado para eles.

### 3.1 Nada disto era necessário

`normalizeReceivable` (`blingDataService.js`) transporta do contacto **apenas `id` e
`nome`**. `contato.numeroDocumento` nunca é lido pela aplicação. As fixtures de produção
(`producao.fixtures.js`) já o removem, com um comentário a dizer porquê. Era
sobre-exposição pura.

### 3.2 Correção aplicada (local, não publicada)

Redação **à saída**, no único ponto por onde os dados se tornam públicos:

```js
// RecebiveisBackend.js
var CAMPOS_NAO_PUBLICOS_RECEBIVEL = ['idTransacao', 'linkQRCodePix', 'linkBoleto'];
function redigirRecebivelPublico_(item) { /* … e contato.numeroDocumento … */ }
```

- O snapshot no Drive fica intacto — é privado da conta que implanta.
- O rebuild continua a recolher o campo; deixa apenas de o publicar.
- O bloco `debug` passa a ser calculado sobre os dados **já redigidos**, para os
  contadores nunca descreverem um conjunto diferente do entregue.
- Os links de pagamento saem também, apesar de vazios: são instrumentos de pagamento por
  construção, e uma mudança do lado do Bling não pode publicá-los sem ninguém reparar.

**Testes:** `apps-script/redacaoPublica.test.js` — 15 testes, incluindo a distinção entre
`numeroDocumento` do **título** (documento fiscal, usado pelo `documentNormalizer`) e
`contato.numeroDocumento` (CPF/CNPJ). Apagar o errado partia a normalização de documentos.

### 3.3 O que a redação NÃO resolve

Continuam públicos: **nomes de 279 clientes, valores, vencimentos, todo o histórico de
receita e despesa da empresa.** A redação tira o dado pessoal mais sensível da mesa. Não
substitui autenticação.

---

## 4. Recurso desconhecido — corrigido localmente

**Antes:** qualquer `recurso` não reconhecido caía no ramo por omissão e devolvia o
snapshot de **pedidos** com HTTP 200. Uma gralha era indistinguível de um pedido válido.

**Agora** (local): rejeição explícita, só para recurso **presente e desconhecido**.

```jsonc
{ "error": true, "code": "RECURSO_DESCONHECIDO", "message": "Recurso nao reconhecido.",
  "recursosSuportados": ["pedidos", "despesas", "recebiveis", "ajustes-manuais"] }
```

Divergência deliberada face à proposta em `APPS_SCRIPT_API_CONTRACT.md` §9: **o valor
recebido não é devolvido.** Publicar a lista de recursos suportados é mais útil ao cliente
e evita refletir entrada do utilizador na resposta.

### 4.1 O risco do proxy — resolvido empiricamente

O contrato registava como bloqueio: *"não foi possível auditar se o proxy injeta, reescreve
ou omite `recurso`"*. Foi sondado, só com GET:

| Pedido através do proxy | Resposta |
|---|---|
| *(sem recurso)* | 1071 pedidos |
| `?recurso=pedidos` | 1071 pedidos |
| `?recurso=despesas` | 301 títulos |
| `?recurso=xyz` | 1071 pedidos *(o fallback)* |
| `?recurso=despesass` | 1071 pedidos *(o fallback)* |
| `?recurso=` *(vazio)* | 1071 pedidos |
| `?recurso=despesas&extra=1` | 301 títulos |

**O proxy é transparente**: passa `recurso` sem tocar, não injeta valores e não filtra
parâmetros extra. `?recurso=pedidos` já funciona hoje, o que torna o alias explícito
retrocompatível por observação, não por dedução. E `?recurso=` vazio já cai em pedidos,
que é exatamente o que `recursoPresente_` preserva.

Risco residual: o proxy pode ter **outras rotas** não sondadas. A aplicação só chama
`pedidos/vendas`, pelo que nenhum caminho usado hoje é afetado. Continua na checklist.

**Testes:** `apps-script/recursoDesconhecido.test.js` — 16 testes, incluindo entradas
hostis (`../../etc/passwd`, `__proto__`, `toString`) e a garantia de que a guarda não
intercepta o retorno do OAuth.

---

## 5. Fuga de informação nas respostas de erro

| Verificação | Resultado |
|---|---|
| `doGet` devolve stack? | **Não.** `errorOut_` usa só `err.message`; `details` é `""` |
| Devolve tokens? | **Não.** `sanitize_` substitui cadeias de 24+ carateres por `***` |
| Devolve a query string? | **Não** |
| Permite invocar função arbitrária? | **Não.** Não há despacho dinâmico; a rota é uma lista fixa |
| Reflete entrada do utilizador? | **Sim, num sítio** — ver 5.1 |

### 5.1 O ramo `?code=…`

É o **primeiro** teste do `doGet`, antes de qualquer roteamento, e é publicamente
alcançável. Devolve o `code` recebido e uma mensagem que descreve o procedimento interno
(*"grave na Script Property BLING_AUTH_CODE e rode exchangeAuthorizationCode_()"*).

- **Não é fuga de credencial**: só devolve o que o chamador enviou.
- **Não é XSS**: a resposta é `application/json`, não HTML.
- **É divulgação de detalhe interno** a quem sondar o endpoint com `?code=1`.

Risco baixo. Correção possível (não aplicada, porque tocaria no fluxo de OAuth que hoje
funciona): responder com uma mensagem genérica e escrever o detalhe só no log.

### 5.2 Corpos de erro do Bling chegam ao público

`blingGet_` lança `'Bling GET ' + path + ' falhou (HTTP ' + code + '): ' + sanitize_(body)`.
No caminho do `doGet`, esse texto passa por `errorOut_` e chega à resposta pública.
`sanitize_` remove cadeias longas (tokens), mas **não** remove texto descritivo que o Bling
possa incluir. Risco baixo, mitigação registada: truncar o corpo a ~200 carateres antes de
o incluir na mensagem.

---

## 6. Riscos, por ordem

| # | Risco | Gravidade | Estado |
|---|---|---|---|
| 1 | **Sem autenticação: dataset financeiro completo publicamente legível** | **Alta** | Aberto — decisão de produto |
| 2 | **481 CPF + 908 CNPJ num endpoint anónimo** | **Alta** | **Corrigido localmente** — falta publicar |
| 3 | `executeAs: USER_DEPLOYING` — pedido anónimo corre com token do Bling do implantador | Média | Aberto — inerente ao modelo |
| 4 | Recurso desconhecido servia dados do tipo errado com HTTP 200 | Média | **Corrigido localmente** |
| 5 | Corpo de erro do Bling ecoado na resposta pública | Baixa | Registado |
| 6 | Ramo `?code` descreve o procedimento interno a quem sondar | Baixa | Registado |
| 7 | `.clasp.json` versionado com o `scriptId` | Nula | Aceite — identificador, não credencial |

### Mitigação do risco 1, por ordem de esforço

1. **Rotação de segredo partilhado.** O proxy exige um cabeçalho que o Apps Script valida;
   o front nunca o vê porque o proxy é que o acrescenta. Move o segredo do bundle para o
   servidor. **Não** protege contra quem chame o proxy diretamente.
2. **Autenticação no proxy** (sessão, Basic, OAuth). O proxy deixa de ser um
   encaminhador e passa a ser o ponto de controlo de acesso. É a correção verdadeira.
3. **`access: "ANYONE"`** (exige conta Google) ou `"DOMAIN"`. Fecha o Apps Script, mas
   **parte o proxy**, que chama sem identidade. Só depois do ponto 2.

Nenhuma destas pode ser feita sem tocar no proxy, que é um projeto separado e não está
neste repositório.

---

## 7. O que não muda nesta sessão

- `access` continua `ANYONE_ANONYMOUS`.
- Nenhuma implantação nova, nenhum `clasp push`, nenhum scope de OAuth novo.
- A redação de dados pessoais e a guarda de recurso desconhecido **só entram em vigor
  depois de publicadas**. Até lá, os 481 CPF continuam expostos em produção.
