# Readiness SaaS — reavaliação após a fundação de autenticação

> ## ⚠️ ESTADO REAL — 27/08/2026
>
> Este documento foi escrito **antes** de existir um projeto Supabase. Já existe, e
> grande parte do que ele pede está feito. O que continua verdadeiro é a arquitetura;
> o que mudou são os passos.
>
> | | |
> |---|---|
> | Projeto Supabase | ✅ criado — `finer-one`, ref `bysqekhcyrvtiejcupoa`, região **us-west-2** |
> | Esquema | ✅ 5 tabelas, RLS, 7 políticas, trigger — `001` + `002_grants` |
> | Autenticação | ✅ Email/password; signup público **desligado**; confirm email desligado |
> | Utilizador, profile, Overcel, membership owner | ✅ criados e verificados |
> | Segunda empresa (`finer-teste`, viewer) | ✅ criada — multiempresa validada |
> | SDK `@supabase/supabase-js` | ✅ **já instalado** |
> | Login real local | ✅ validado ponta a ponta, com logout e zero resíduo |
> | Formato das chaves | ⚠️ o projeto usa as **novas** `sb_publishable_` / `sb_secret_`, não as JWT legadas |
> | `SUPABASE_SERVICE_ROLE_KEY` no Vercel | ❌ **por configurar** — é o que falta |
> | BFF publicado | ❌ **não** |
>
> Ver `docs/BFF_PRE_DEPLOY_REPORT.md` para o estado do proxy.

> ### O que isto muda na §5 ("QUANDO O IGOR VOLTAR PARA CASA")
>
> Os passos **1 a 10 estão feitos**, com duas ressalvas registadas: a região não é São
> Paulo (§ região, em `BFF_PRE_DEPLOY_REPORT.md`) e as chaves são do formato novo.
> O passo 3 — a `service_role` no Vercel — **continua por fazer** e é o único que
> bloqueia o BFF.
>
> A avaliação **Piloto Overcel · QUASE ⚠️** mantém-se: o que faltava era autenticação
> real, que passou a existir, mas o BFF protegido continua por publicar e é ele que
> protege os dados financeiros. A RLS não os alcança — eles não vivem no Supabase.


> Medido em **26/08/2026**, contra o código real deste repositório: **2069 testes em 80
> ficheiros** no frontend, **63 testes no BFF** (`finer-one-proxy`, `node --test`), build
> verde, `check:data` saudável, e a fundação exercitada no Chrome.
>
> **Não reutiliza a estimativa de 33–56 h.** Aquela foi feita antes de existir uma linha
> de autenticação; esta é medida contra o que está agora escrito e contra o que se
> descobriu ao escrevê-lo.

---

## 0. QUATRO NÍVEIS QUE NÃO SE PODEM CONFUNDIR

A pergunta "a Finer One tem autenticação?" tem quatro respostas diferentes conforme o
que se está a perguntar, e misturá-las é a forma mais fácil de acreditar que o produto
está mais perto do que está.

| Nível | Estado | O que significa exatamente |
|---|---|---|
| **1. FUNDAÇÃO LOCAL** | ✅ **COMPLETO** | O desenho todo: núcleo de autorização, contrato de sessão, papéis, capacidades, gate de rotas, seletor de empresas, transporte protegido, portos de persistência e de integração. Exercitado por 2069 + 63 testes e validado no Chrome. |
| **2. AUTENTICAÇÃO REAL** | ❌ **BLOQUEADO EXTERNAMENTE** | Não existe projeto Supabase. O que corre hoje é **fixture de desenvolvimento** (`VITE_AUTH_MODE=dev`), com contas compiladas e palavra-passe ignorada. |
| **3. ISOLAMENTO REAL** | ❌ **NÃO VERIFICADO** | Nenhum pedido foi alguma vez recusado por um servidor a sério. A matriz A→A / A→B está testada contra **duplos**, não contra uma base de dados. |
| **4. PRODUÇÃO** | ❌ **NÃO** | O BFF protegido não está publicado, o Apps Script continua `ANYONE_ANONYMOUS`, e não há CSP. |

### A frase que este documento NÃO autoriza

> ~~"A Finer One já tem autenticação."~~

A frase correta é: **a Finer One tem a arquitetura de autenticação completa e testada, a
correr sobre uma fixture de desenvolvimento.** A fixture não é autenticação: não verifica
palavras-passe (ignora-as por desenho), não emite tokens verificáveis, e o seu próprio
ecrã de login diz por extenso que as contas não existem em produção.

Chamar ao nível 1 "autenticação real" seria o mesmo erro que este projeto já corrigiu
duas vezes noutro eixo: apresentar `unavailable` como zero, e apresentar uma avaria como
"modo demonstração". Uma fundação local é uma fundação local.

---

## 0.1. Auditoria de 28/08/2026 — dois P0 fechados

`docs/AUDITORIA_2026-08-28.md` tem o detalhe. O que muda para a prontidão:

- **`VITE_PROTECTED_DATA_TRANSPORT` não podia ser ligado como estava.** Com o
  interruptor ligado e a empresa ativa ainda por resolver, o transporte caía para o
  endpoint **anónimo** — que serve os dados reais da Overcel sem token nem membership.
  Corrigido: passa a devolver "sem dados". Antes desta correção, ligar o interruptor era
  abrir um acesso, não fechá-lo.
- **Trocar de empresa com uma leitura em voo mostrava os números da empresa anterior.**
  Corrigido com contador de geração, e provado com o provider montado.

Nenhum dos dois estava ativo em produção. Os dois estavam no caminho dos passos
seguintes.

## 1. O que mudou desde `READINESS_PLUS.md`

Aquele documento dizia que **uma coisa só** impedia a venda: não havia autenticação, e
o dataset financeiro completo era publicamente legível.

Hoje, dessa coisa:

| | Antes | Agora |
|---|---|---|
| Sessão de utilizador | não existia | ✅ implementada, testada, validada no browser |
| Autorização por empresa | não existia | ✅ núcleo completo, 88 testes, matriz A→A / A→B |
| Isolamento verificado | — | ✅ 18 testes de cadeia completa (contra duplos — ver §0, nível 3) |
| BFF protegido | não existia | ⚠️ **escrito, por publicar** — agora com **63 testes locais** |
| Base de dados | não existia | ⚠️ **schema escrito, por executar** |
| Apps Script anónimo | risco aberto | ⚠️ **inalterado** (por decisão) |

Acrescentado na sessão de 26/08/2026 (trabalho local, sem publicação):

| | Antes | Agora |
|---|---|---|
| Moeda/locale seguem a empresa ativa | ❌ 114 chamadas assumiam a Overcel compilada | ✅ registo com um só escritor + `companyForFormatting` deixa de emprestar moeda |
| UI consciente de papéis | ❌ o `viewer` via o CTA de escrita | ✅ `uiPermissions` + estado read-only explicado |
| Transporte de dados | ❌ endpoint anónimo cozido no motor financeiro | ✅ `legacy` / `protected` atrás de um port, por interruptor |
| Testes do BFF | ❌ nenhum (repositório sem runner) | ✅ 63, em `node --test`, sem dependências |
| Persistência da cobertura | ⚠️ funções por ligar dentro do handler | ✅ port com implementação de Supabase escrita; recusa honesta (503) enquanto não existir |
| Empresa → integração | ⚠️ leitura embutida | ✅ port `resolveCompanyIntegration` com 3 implementações |
| Onde vive a config da integração | ❌ `companies.integration`, legível por qualquer membro | ✅ `company_integration`, RLS sem políticas, só `service_role` — e guarda uma referência, não o URL |
| Resíduo de gráficos após logout | ❌ valor financeiro real legível no DOM | ✅ corrigido e verificado no Chrome |

A frase certa hoje: **a arquitetura de acesso está resolvida; falta ligá-la a um
provider real.** É uma diferença grande — o que falta é configuração e um passo de
publicação, não desenho.

---

## 2. Prontidão por cenário

### Demo · **PRONTO** ✅

Com `VITE_AUTH_MODE=dev` demonstra-se a história completa: login, dashboard com dados
reais da Overcel, troca de empresa, papéis diferentes, logout, e o ecrã de acesso não
configurado. Nada disto depende de serviços externos.

Uma nota de honestidade para a demo: é autenticação **simulada**, e o ecrã di-lo por
extenso. Isso é uma vantagem — mostra que o produto distingue os dois modos.

### Piloto Overcel · **QUASE** ⚠️

Falta: passos **B** (Supabase) e **C** (BFF publicado) do plano de migração.
Tudo o resto já corre. Com o Supabase criado, um dia de trabalho põe o Igor a entrar com
credenciais reais.

O **passo D** (leituras protegidas) não bloqueia o piloto interno: enquanto o cliente for
um só e conhecido, ler pelo endpoint anónimo é o risco que já se corre hoje.

### Piloto externo · **NÃO** ❌

Bloqueadores reais, por ordem:
1. **Passo D** — sem leituras protegidas não há isolamento a sério entre dois clientes.
2. **Passo I** — enquanto o Apps Script for `ANYONE_ANONYMOUS`, quem descobrir o URL
   contorna tudo. Aceitável com um cliente que é o dono; inaceitável com dois.
3. **Passo E** — um cliente externo não vai executar funções no editor do Apps Script
   para confirmar uma cobertura.

### Produto comercial · **NÃO** ❌

Além dos anteriores: signup e onboarding, gestão de membros na UI, faturação,
recuperação de palavra-passe, CSP, e um plano de backup/restauro. Nenhum deles é
difícil; são todos trabalho.

---

## 3. Horas restantes

Medidas contra o código real. **Claude Code** = trabalho que este assistente faz.
**Humano** = criar contas, colar credenciais, publicar, decidir, validar com olhos.

| # | Trabalho | Claude Code | Humano | Notas |
|---|---|:--:|:--:|---|
| 1 | **Autenticação mínima** | **0 h** | **0 h** | ✅ feito |
| 2 | Autenticação real configurada (passo B) | 2–3 h | **1,5–2 h** | O humano cria o projeto, cola credenciais, cria a conta. O Claude liga o adaptador e valida. |
| 3 | Isolamento de empresas (passo C) | 3–4 h | 1 h | Publicar o BFF + validar a matriz com `curl`. |
| 4 | Leituras protegidas (passo D) | 5–7 h | 1–1,5 h | O passo mais delicado: toca no caminho dos dados reais. Inclui injetar o cliente em `blingDataService` e validar com `check:data --json`. |
| 5 | Escritas protegidas (passo E) | 3–4 h | 0,5 h | `lerCoberturaAtual`/`gravarCobertura` + ligar a UI. O handler já está escrito. |
| 6 | Cobertura persistente ponta a ponta | 2–3 h | 1 h | Auditoria, estados de erro na UI, esconder o botão a `viewer`, validação no browser. |
| 7 | CMV persistente (passo F) | 6–8 h | 2 h | Entra na DRE. Migração de valores + validação contabilística **por uma pessoa**. |
| 8 | Segunda empresa (passo J) | 4–6 h | **2–4 h** | O trabalho de código é pequeno; o humano tem de configurar a integração Bling do outro cliente. |
| 9 | Piloto externo pronto | 10–14 h | 4–6 h | Passo I (Apps Script) + CSP + gestão de membros mínima + convites. |

### Totais

| Marco | Claude Code | Humano | **Total** |
|---|:--:|:--:|:--:|
| **Piloto Overcel autenticado** (2+3) | 5–7 h | 2,5–3 h | **~8–10 h** |
| **Isolamento a sério** (+4+5+6) | 15–21 h | 5–6 h | **~20–27 h** |
| **Segunda empresa** (+8) | 19–27 h | 7–10 h | **~26–37 h** |
| **Piloto externo** (+9) | 29–41 h | 11–16 h | **~40–57 h** |
| **CMV na BD** (+7, quando fizer sentido) | +6–8 h | +2 h | +8–10 h |

### Porque a estimativa não desceu, tendo-se feito tanto

A antiga (33–56 h) media "autenticação até ao piloto externo" como um bloco. Feito o
trabalho, o bloco separou-se em duas metades muito diferentes:

- **A metade de desenho está feita** e custou mais do que a estimativa lhe atribuía. O
  núcleo de autorização, o modelo de sessão, as barreiras contra o modo dev e a matriz
  de testes são o que torna as horas seguintes previsíveis.
- **A metade que falta é integração** — e integração com serviços externos tem um piso
  de horas humanas que nenhum trabalho de código reduz.

E apareceu trabalho que a estimativa antiga **não podia conhecer**, porque só se
descobre a construir:

- o `companyId` teve de entrar no dataset e ganhar um gate próprio (`companyDataScope`),
  senão trocar de empresa mostrava os números da Overcel sob outro nome;
- a escolha da empresa por omissão tinha de ser por senioridade, não por alfabeto;
- **um build com `NODE_ENV=test` incluía o adaptador de autenticação simulada no
  bundle** — três das horas gastas foram só a encontrar e fechar isto.

O intervalo para o piloto externo (**~40–57 h**) é mais largo e mais alto do que o
antigo, e é honesto: o antigo não contava o passo I (Apps Script), que é o único que
exige publicar em produção.

---

## 4. O caminho crítico

```
🔒 B (humano, 1,5–2 h)  ──►  C (4–5 h)  ──►  D (6–8 h)  ──►  E (3,5 h)  ──►  J
   projeto Supabase          BFF publicado    leituras       escrita       2.ª empresa
```

**O único bloqueador duro é o passo B**, e é do Igor. Tudo o resto está desenhado,
escrito, ou é trabalho previsível.

`docs/ACOES_DO_UTILIZADOR_SUPABASE.md` tem os nove passos, com o que é segredo e o que
não é.

---

## 5. QUANDO O IGOR VOLTAR PARA CASA

> Passos exatos, por ordem. **Nenhum segredo neste ficheiro** — os valores reais só
> existem no painel do Supabase e no painel do Vercel.
>
> Tempo realista: **60–90 minutos** até `check:supabase all` passar inteiro.

### Antes de começar

```bash
cd "C:\Users\User\Documents\VS Code\finer-one"
npm test && npm run build && npm run check:data
cd "..\finer-one-proxy" && npm test
```
Tudo verde é o ponto de partida. Se algo falhar, é anterior a este trabalho.

---

### 1. Criar o projeto Supabase
`supabase.com` → **New project**. Região **Europe (Frankfurt)** ou **South America (São
Paulo)** — a mais perto de quem usa. Guardar a palavra-passe da base de dados no gestor
de palavras-passe; **não** é nenhuma das chaves abaixo e não vai para lado nenhum do código.

### 2. Obter o URL público e a chave `anon`
**Project Settings → API**:
- `Project URL` → é o `VITE_SUPABASE_URL`
- `anon` / `public` → é o `VITE_SUPABASE_ANON_KEY`

As duas são **públicas por desenho**. Vão no bundle e não concedem nada por si — quem as
trava é a RLS.

### 3. Obter a `service_role` e guardá-la SÓ no Vercel
Na mesma página, `service_role`. **Esta ignora a RLS por completo.**

- ✅ **Vercel** → projeto `finer-one-proxy` → Settings → Environment Variables →
  `SUPABASE_SERVICE_ROLE_KEY`
- ❌ **nunca** no `.env` do frontend
- ❌ **nunca** com prefixo `VITE_`
- ❌ **nunca** num commit

> Se esta chave for para uma variável `VITE_*`, vai literalmente para o bundle público do
> GitHub Pages e **deixa de haver RLS**: qualquer visitante lê e escreve qualquer tabela
> de qualquer empresa. `npm run check:supabase env` falha explicitamente se isso acontecer.

### 4. Executar o SQL
**SQL Editor** → colar `docs/sql/001_saas_foundation.sql` → **Run**.

Cria: `profiles`, `companies`, `memberships`, `company_coverage`, `audit_log`, a função
`is_member_of`, o trigger `on_auth_user_created`, e todas as políticas de RLS.

Depois, `docs/sql/003_company_integration.sql` → **Run**. Cria `company_integration`, a
tabela **server-only** de onde o BFF descobre a fonte de dados de cada empresa. Sem ela,
as leituras protegidas respondem 503 — que é a verdade, e não um ecrã vazio.

> `002_grants.sql` é história: os mesmos GRANTs já vivem dentro do 001. Um ambiente novo
> precisa do 001 e do 003.

### 5. Criar o primeiro utilizador
**Authentication → Users → Add user**. Email real, palavra-passe forte, **confirmar o
email** (ou marcar como confirmado). Copiar o **UUID** — é preciso no passo 7.

O trigger do passo 4 cria o `profile` automaticamente.

### 6. Criar a empresa Overcel e ligar a sua integração
**SQL Editor** — é a seed comentada no fim do ficheiro do passo 4:

```sql
insert into public.companies (id, name, currency, locale, timezone, plan)
values ('overcel', 'Overcel', 'BRL', 'pt-BR', 'America/Sao_Paulo', 'plus');

insert into public.company_integration (company_id, config)
values ('overcel', '{"provider":"gas","envKey":"GAS_URL"}'::jsonb);
```

> ⚠️ **O `gasUrl` NÃO vai para `companies.integration`.** Essa coluna é legível por
> qualquer membro (política `companies_select_member`), e o Web App do Apps Script é
> `ANYONE_ANONYMOUS`: quem tiver o URL tem os dados, sem token. Pô-lo ali seria publicar
> a fonte financeira a todos os membros da empresa, um `viewer` incluído. O 003 tem um
> `check` que agora **recusa** essa escrita.

O que vai para a base de dados é a **referência**: "esta empresa lê por Apps Script, e o
endereço está na variável `GAS_URL`". O URL real continua a viver só no Vercel, como
Secret — um sítio só, uma rotação só.

Uma empresa **sem** linha em `company_integration` responde 200 com `data: []` e
`debug.fonte = "integracao-nao-configurada"` — ausência declarada, nunca um zero
financeiro. É o estado correto para a empresa de teste do passo 11.

### 7. Criar a membership
```sql
insert into public.memberships (user_id, company_id, role)
values ('O-UUID-DO-PASSO-5', 'overcel', 'owner');
```

### 8. Preencher o ambiente do frontend
No `.env` (que **não** é versionado):
```
VITE_SUPABASE_URL=...        (passo 2)
VITE_SUPABASE_ANON_KEY=...   (passo 2)
VITE_AUTH_MODE=supabase
```

E no Vercel, para o proxy: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_ORIGINS=https://igororlandi999.github.io`.

### 9. Instalar o SDK
```bash
npm i @supabase/supabase-js
```
`src/auth/supabaseAuthAdapter.js` **passa a funcionar sem uma linha de alteração** — o
import é dinâmico e com o nome do pacote em variável, exatamente para isto.

### 10. Correr os smoke tests
```bash
# na shell, sem versionar nada:
export SUPABASE_URL=...  SUPABASE_ANON_KEY=...  SUPABASE_SERVICE_ROLE_KEY=...
export SMOKE_EMAIL=...   SMOKE_PASSWORD=...
export SMOKE_COMPANY_ID=overcel
export API_BASE_URL=https://finer-one-proxy.vercel.app/api

npm run check:supabase all
```

Tem de passar: `env`, `health`, `schema`, `rls`, `session`. O passo `membership` só passa
depois de o BFF protegido estar publicado.

**Se `rls` disser que um anónimo leu alguma coisa — parar tudo.** É um incidente, não um
teste falhado.

### 11. Verificar o isolamento a sério (o que fecha o nível 3)
Criar uma **segunda empresa sem membership** e:
```bash
export SMOKE_FOREIGN_COMPANY_ID=empresa-de-teste
npm run check:supabase membership
```
Esperado: `A → A` = 200, `A → B` = **403**, empresa inexistente = **403**.

E o isolamento da **configuração**, que é uma pergunta diferente:
```bash
npm run check:supabase integration
```
Esperado: `anon` recusado, **utilizador autenticado real recusado** (é o que distingue
esta tabela de todas as outras — nem o `owner` a lê), `service_role` lê, e nenhuma linha
com um segredo lá dentro.

Só quando os dois passarem é que o nível 3 da tabela do §0 deixa de estar por verificar.

### 12. Ligar o transporte protegido (opcional, depois de 11 passar)
```
VITE_PROTECTED_DATA_TRANSPORT=true
```
Faz as leituras financeiras passarem a `GET /api/companies/:companyId/financial-data` com
token. **Não ligar antes do passo 11 passar** — sem BFF publicado, todas as leituras
devolvem 404 e o ecrã fica indistinguível de "empresa sem dados".

---

### O que continua a NÃO estar feito depois destes 12 passos

- **Apps Script continua `ANYONE_ANONYMOUS`** (passo I do plano) — quem descobrir o URL
  contorna tudo. Aceitável com um cliente que é o dono; inaceitável com dois.
- **CSP** — ver `docs/CSP_PLAN.md`.
- **Persistência da cobertura** — a tabela existe a partir do passo 4, mas confirmar
  cobertura só grava depois de o BFF ser publicado. Até lá responde **503**, que é a
  verdade.
- **Gestão de membros na UI** — hoje convida-se por SQL.

---

## 6. INTEGRAÇÃO GIT DA VERCEL — plano exato (28/08/2026)

**Nada disto foi executado.** Fica escrito para ser executado **depois** de o novo
Preview do BFF estar validado, e não antes: mexer na ligação enquanto se depende dela
para publicar Previews é trocar de cavalo a meio do rio.

### O problema, em uma frase

O projeto Vercel do BFF está ligado por Git ao repositório **público e antigo**
(`igororlandi999/finer-one-proxy`). O código vive hoje no repositório **privado**
(`igororlandi999/finer-one-bff`). Um push para o repositório antigo constrói código de
junho — sem autorização, sem CORS fechado, sem nada desta auditoria — e vai a
**produção**, porque a ligação Git tem a rama principal apontada a Production.

Não é uma hipótese remota: é o comportamento por omissão de uma integração Git da Vercel.

### Preferência registada do Igor

> Manter deploy **manual** do BFF até terminarmos esta migração, em vez de ligar `main`
> do repositório privado diretamente a Production.

É a escolha certa e o plano abaixo assume-a. Uma ligação Git a Production é conveniente
quando o pipeline está estabilizado; a meio de uma migração de autorização, é uma forma
de publicar por acidente.

### Os quatro passos, por ordem

**1. Remover a ligação ao repositório público antigo**

    Vercel -> projeto do BFF -> Settings -> Git -> Connected Git Repository -> Disconnect

Isto **não** apaga deployments existentes nem variáveis de ambiente. Só corta a
capacidade de um push construir seja o que for. Confirmar, antes de carregar, que a
secção mostra `finer-one-proxy` — se já mostrar `finer-one-bff`, o problema é outro e
este plano precisa de ser revisto.

**2. Decidir: privado ou manual — e a decisão é MANUAL, por agora**

Não reconectar. O BFF continua a ser publicado por `vercel deploy` a partir da máquina,
com o repositório privado como fonte de verdade do código.

Quando a migração terminar e se quiser reconectar, o passo seguro é ligar o privado
**com Production desligada de `main`**: Settings -> Git -> Production Branch apontada a
uma rama que não existe (`producao`), de modo a que todo o push a `main` produza um
Preview e nunca uma Production. A promoção continua a ser um ato manual e explícito.

**3. Impedir a produção automática por acidente**

Duas defesas, e ambas valem a pena porque falham de maneiras diferentes:

- **Settings -> Git -> Ignored Build Step**: `exit 0` faz a Vercel construir sempre;
  `exit 1` faz nunca construir. Enquanto durar a migração, `exit 1` é uma trava explícita
  que sobrevive a uma reconexão distraída.
- **Settings -> Deployment Protection**: manter a proteção de Preview ligada. É o que
  impede um Preview de ser um endpoint aberto ao mundo.

**4. Provar que o repositório antigo já não controla nada**

O passo que transforma o plano numa garantia. Não basta desconectar: é preciso ver que
um push não faz nada.

    git clone https://github.com/igororlandi999/finer-one-proxy /tmp/verificar-antigo
    cd /tmp/verificar-antigo
    echo "verificação de $(date -u +%FT%TZ)" >> LEIAME-VERIFICACAO.md
    git commit -am "chore: verificar que este repositório já não controla a Vercel"
    git push

Depois, em `vercel ls` (ou no painel), confirmar que:

- **não apareceu nenhum deployment novo** nos minutos seguintes;
- o deployment de Production continua a ser exatamente o mesmo SHA de antes.

Se aparecer um deployment, a desconexão não pegou — e nesse caso a produção esteve todo
este tempo a ser controlada pelo repositório errado, que é precisamente o achado.

Reverter a alteração de verificação depois (`git revert`), ou deixá-la: o repositório
antigo passa a ser um arquivo, e um ficheiro que diz porquê é melhor do que nenhum.

### O que NÃO fazer

- **Não apagar o repositório público antigo** antes do passo 4. Sem ele não há como
  provar que a desconexão funcionou, e um repositório arquivado não faz mal a ninguém.
- **Não ligar `main` do privado a Production** enquanto o transporte protegido não
  estiver ativo e validado em produção.
