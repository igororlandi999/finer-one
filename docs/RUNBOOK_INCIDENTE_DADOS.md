# Runbook — incidente de dados

> Cinco cenários. Cada um começa pela pergunta que separa "está partido" de "está a
> dizer a verdade sobre estar partido" — porque metade dos alarmes deste produto são o
> sistema a funcionar.

**Regra zero:** não reiniciar, não limpar caches e não republicar antes de saber o que se
está a ver. Um estado apagado é uma prova apagada.

---

## 1. Aparecem números da empresa ERRADA

**O mais grave. Tratar como P0.**

### Primeiras ações
1. **Screenshot** do ecrã, com a barra lateral (o nome da empresa) visível.
2. Não trocar de empresa nem recarregar — isso destrói o estado que prova o defeito.
3. Na consola: `window.__FINER_DEBUG` não existe; em vez disso confirmar no ecrã se o
   bloco "empresa sem dados ligados" **devia** ter aparecido.

### Como distinguir
| Sintoma | Significa |
|---|---|
| Ecrã de **"empresa sem dados ligados"** | o guarda **funcionou**. Não é incidente. |
| Números visíveis com o nome de outra empresa | `sales.companyId` bateu certo com a empresa ativa e não devia — **incidente** |
| Números a mudar sozinhos segundos depois | corrida de leituras: a guarda de geração falhou |

### Onde olhar
- `src/auth/companyDataScope.js` — o guarda de apresentação;
- `src/services/blingDataService.js`, campo `companyId` do dataset — desde 28/08/2026 vem
  da **leitura**, não da configuração;
- `src/context/FinerDataContext.jsx` — `geracao`, `sessaoId`.

### Contenção
Desligar `VITE_PROTECTED_DATA_TRANSPORT` (voltar ao legado, que serve uma empresa só) é a
contenção mais rápida **se** a bandeira estiver ligada. Se estiver desligada, o vetor não
é o transporte e a contenção é remover o seletor de empresas da UI.

---

## 2. O ecrã aparece VAZIO ou a zeros

### A pergunta que separa tudo
> **É zero real, ou é ausência apresentada como zero?**

Esta é a distinção que o produto inteiro defende. Antes de tratar como avaria:

| O que se vê | Significa |
|---|---|
| `DataUnavailable` ("não foi possível ler") | avaria **declarada**. Correto. |
| "Modo demonstração" | não há backend configurado. Verificar `VITE_API_BASE_URL`. |
| Cartões com `—` | fonte ausente, corretamente marcada |
| Cartões com **0,00** | zero **real** — a empresa não teve movimento. Pode estar certo. |
| Cartões com 0,00 **e** um 502 nos registos | **incidente**: uma avaria virou zero |

A última linha é a única que é incidente. Se aparecer, é uma regressão do contrato
"ausência nunca vira zero" — ver `src/services/avariaNuncaViraDemo.test.js`, que existe
para a impedir.

### Onde olhar
Registos da função no Vercel: `financial-data | empresa=... | upstream=<estado> | <n>b`.
- `upstream=200` com poucos bytes → o Apps Script devolveu vazio. Ver o snapshot.
- `upstream=401/403` → o deployment do Apps Script perdeu autorização.
- `upstream 200 mas o corpo nao e JSON do contrato` → HTML (página de login do Google).

---

## 3. `502` do upstream

**Não é um incidente de segurança e não deve deslogar ninguém.** Se alguém foi deslogado
por causa de um 502, isso **sim** é o incidente — ver cenário 4.

### Diagnóstico, por ordem de probabilidade
1. **Deployment do Apps Script perdeu autorização.** Sintoma: `upstream=200` mais
   `corpo nao e JSON do contrato`. O Google devolve a página de login com estado 200.
2. **Timeout.** Sintoma: `financial-data erro | ... | timeout`. O limite é 15 000 ms.
   Recebíveis são ~1,19 MB; um snapshot em reconstrução demora.
3. **Quota do Bling.** O Apps Script devolve `{error:true}` com estado 200, e o frontend
   rejeita-o em `linhasOuFalha`.

### Contenção
Nenhuma do nosso lado. O 502 é honesto: diz que a fonte falhou. A aplicação mostra
indisponível, que é a verdade. **Não** inventar dados nem repor o cache.

---

## 4. Ciclo de logout / "sessão expirada" repetida

### A causa que este projeto já teve
O BFF devolvia `upstream.status` cru. Um `401` do Apps Script chegava ao frontend como
`401` do BFF, `authorizedApi` chamava `onUnauthorized`, e a sessão — perfeitamente
válida — era terminada.

Corrigido: falha do upstream é **sempre** `502`. Se voltar, é regressão.

### Diagnóstico
1. Nos registos do Vercel, procurar `upstream=401` **junto** de uma resposta `401` nossa.
   Se existir, a fronteira partiu-se.
2. Se o `401` for genuinamente do `protect` (`UNAUTHENTICATED`), então a sessão morreu
   mesmo — verificar a expiração e a rotação de chaves no Supabase.
3. Verificar se a cache de tokens do BFF (15 s, `lib/verifyToken.js`) está a servir um
   resultado antigo. Só o **sucesso** é guardado, por isso não pode causar 401 falsos.

### Contenção
Desligar `VITE_PROTECTED_DATA_TRANSPORT`: o transporte legado é anónimo e não deslogar
ninguém. Custo: uma empresa só. É a troca certa durante um ciclo de logout.

---

## 5. Suspeita de fuga de segredo

**Não confirmar a suspeita imprimindo o segredo.** Não colar valores em nenhum sítio, não
os pôr num ticket, não os enviar por mensagem.

### Primeiras ações, por esta ordem
1. **Rodar primeiro, investigar depois.** Um segredo que se suspeita exposto já não é
   segredo. A ordem inversa deixa a janela aberta durante a investigação.
   - `SUPABASE_SERVICE_ROLE_KEY` — rodar no painel do Supabase;
   - `GAS_URL` — republicar o Web App do Apps Script com um deployment **novo**;
   - `SUPABASE_ANON_KEY` — pública por desenho, não é uma fuga.
2. **Onde é que se pensa que apareceu?**
   - No bundle: `npm run build` e depois a varredura de `dist/`. Verificado a 28/08/2026:
     limpo, e sem source maps.
   - Nos registos: os endpoints registam `empresa=`, `recurso=`, `upstream=`, `bytes`.
     Nunca o endereço, nunca o token, nunca a query. Há testes que o afirmam
     (`test/companyIntegration.test.mjs`).
   - No repositório: `npm run check:predeploy` no BFF.
   - **Num repositório público**: o `finer-one-proxy` antigo é público. Verificar o que lá
     está antes de assumir que a fuga é nova.
3. **Só depois** escrever o que se sabe, sem valores.

### O que NÃO conta como fuga
- `VITE_SUPABASE_ANON_KEY` e `VITE_API_BASE_URL` no bundle — são públicas por desenho.
- `"overcel"` no bundle — é a configuração da empresa, e o texto de demonstração
  identifica-se como fictício.
- Uma fixture com forma de segredo que se declara falsa (`NAO-REAL`, `de_teste`,
  `exemplo.invalid`). O scanner reconhece a marca.

---

## O que registar, em qualquer cenário

| Campo | Onde obter |
|---|---|
| hora | com fuso |
| empresa ativa | barra lateral |
| `source` | `api` / `unavailable` / `mock` / `loading` |
| transporte | `legado` / `protegido` / `nenhum` + `motivoTransporte` |
| estado das bandeiras | `VITE_PROTECTED_DATA_TRANSPORT`, `COVERAGE_WRITES_ENABLED` |
| deployment | o SHA, **não** o URL do Preview (pode conter o bypass) |

**Nunca** registar: tokens, cabeçalhos, `GAS_URL`, nomes de clientes ou fornecedores,
valores financeiros de uma empresa real.
