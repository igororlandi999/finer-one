# Modelo de ameaças — multiempresa

Data: 26/08/2026. Alvo: a fundação implementada nesta sessão + o pipeline existente.

Legenda de estado:
**MITIGADO** — a defesa está implementada e testada.
**MITIGADO POR DESENHO** — a defesa depende de código que já existe mas ainda não está ligado a um provider real.
**ACEITE** — o risco existe, é conhecido, e a mitigação está no plano.

---

### 1. Alterar o `companyId` no browser

**Ataque.** A app guarda a empresa preferida em `localStorage`. O atacante abre o inspetor, troca `overcel` por `empresa-b`, recarrega. O pedido sai com o id trocado.

**Risco.** Se o servidor acreditasse no id, seria acesso total aos dados financeiros de outra empresa com um clique.

**Mitigação.** Duas camadas.
- *Interface*: `resolveActiveCompany` filtra a preferência contra a lista de memberships. Uma preferência que não corresponda é descartada em silêncio.
- *Servidor*: o id do caminho só serve para procurar uma membership. Sem ela, 403.

**Estado: MITIGADO.** `sessionContract.test.js` ("a preferência não concede"), `cadeiaCompleta.test.js` ("trocar o companyId do pedido dá 403"), `authorizationCore.test.js` ("o browser não é confiável").

---

### 2. Alterar `localStorage` para ganhar privilégios

**Ataque.** Escrever `{"role":"owner"}` ou uma lista de memberships forjada no storage.

**Risco.** Se a autorização lesse o papel do storage, qualquer utilizador seria dono de qualquer empresa.

**Mitigação.** O que está no browser é **uma etiqueta**, não uma credencial:
- em produção, o `localStorage` guarda o token **assinado** do Supabase (adulterá-lo produz um token *inválido*, não um token com mais poderes) e o id da empresa preferida;
- em desenvolvimento, o `sessionStorage` guarda **um id de fixture** — testado: nem papel, nem empresa, nem token;
- a `role` da sessão vem sempre da membership, e a que decide é a relida no servidor.

**Estado: MITIGADO.** `devAuthAdapter.test.js` ("o sessionStorage não é uma fonte de autorização"), incluindo uma tentativa de injetar memberships pelo valor do storage.

---

### 3. Chamar o BFF sem token

**Mitigação.** `extractBearerToken` → 401 antes de qualquer outra coisa. A ordem importa: um pedido sem token e com `companyId` malformado responde **401 e não 400**, para não dizer a um anónimo se o formato do id estava certo.

**Estado: MITIGADO.** Testado com cabeçalho ausente, vazio, sem esquema, `Basic`, e `Bearer` sem valor.

---

### 4. Token expirado

**Mitigação.** Dupla. O Supabase responde 401 a um token expirado; e `authorizeCompanyRequest` volta a avaliar o `exp` contra um relógio injetado, apanhando um verificador que se esqueça dele ou o valide contra o relógio errado.

**Estado: MITIGADO.** Há um teste em que o verificador devolve `ok:true` com `exp` no passado e a decisão é 401 na mesma.

---

### 5. Token válido de utilizador sem membership

**Mitigação.** Autenticação ≠ autorização. Sessão válida → `loadMemberships` → lista vazia → 403. Na interface, `ProtectedRoute` mostra "acesso ainda não configurado" e **não monta** a aplicação — sem isso, as páginas cairiam em `sales?.x ?? mockData.x` e mostrariam os números da Overcel fictícia a um estranho.

**Estado: MITIGADO.** `ProtectedRoute.test.jsx` verifica que a sonda financeira **não monta** e que o DOM não contém números.

---

### 6. Token válido de A a pedir dados de B

**O ataque central de um SaaS multiempresa.** Credenciais legítimas, pedido dirigido a outra empresa.

**Mitigação.** A autorização não olha para o id pedido: procura uma membership entre o utilizador **do token** e esse id. Sem ela, 403. E a fonte de dados usada na resposta vem de `loadCompanyConfig(decisao.companyId)` — o id **autorizado**, nunca o do caminho.

**Estado: MITIGADO.** `cadeiaCompleta.test.js` percorre a matriz: A→A = 200, A→B = 403, multi→ambas = 200, multi→terceira = 403.

**Nota adicional:** empresa inexistente e empresa alheia devolvem **exatamente a mesma resposta**. Distinguir permitiria enumerar os clientes da Finer One por tentativa e erro — informação comercial, antes ainda de qualquer número.

---

### 7. Chamar o URL do Apps Script diretamente

**Ataque.** Descobrir o URL do Web App (histórico de rede, extensão, colega) e chamá-lo sem passar pelo BFF.

**Risco.** `ANYONE_ANONYMOUS`: quem tiver o URL tem os snapshots completos. **O BFF não fecha esta porta** — protege o caminho, não o destino.

**Estado: ACEITE.** É o risco residual mais relevante da arquitetura atual e a resposta completa está em §17 do relatório / `docs/APPS_SCRIPT_SEGURANCA.md`. Resumo da migração:

1. **Segredo partilhado** (baixo esforço): o GAS exige um cabeçalho/parâmetro que só o BFF conhece. Fecha o acesso casual; não é criptografia.
2. **`ANYONE_WITH_GOOGLE` + conta de serviço** (médio): o BFF autentica-se com uma identidade Google. Fecha o acesso anónimo de verdade.
3. **Retirar o GAS do caminho de leitura** (alto, é o destino): o GAS escreve snapshots para um armazenamento privado; o BFF lê de lá com credenciais próprias. O Web App deixa de ser um endpoint público.

Agrava-se com multiempresa: `companies.integration.gasUrl` fica visível a todos os membros da empresa por causa da política `companies_select_member`. Aceitável entre membros da mesma empresa; deixa de o ser quando `integration` contiver segredos. Mitigação planeada: uma VIEW sem `integration` para o cliente, e a tabela só para a `service_role`.

---

### 8. Conhecer o URL do proxy

**Estado: MITIGADO (para os endpoints novos).** O URL do proxy **vai no bundle** — é público por construção e não pode ser de outra forma. O que muda é que conhecê-lo deixa de bastar: `/api/companies/:id/*` exige token.

`/api/pedidos/vendas` continua anónimo e é o que a instalação atual usa. Fecha-se no passo D do plano de migração, quando o frontend passar para os caminhos escopados.

---

### 9. CORS como falsa segurança

**O risco é acreditar que o CORS protege.** Não protege: é uma regra que o **browser** aplica a pedidos feitos por **páginas**. `curl`, Python ou Postman ignoram-no — nem olham para o cabeçalho.

**O que muda.** `ALLOWED_ORIGIN: *` passa a uma lista explícita (`ALLOWED_ORIGINS`). Sem configuração, **não se emite cabeçalho nenhum** em vez de abrir a toda a gente: o browser recusa, o `curl` continua a funcionar, e o deploy fica obviamente por configurar em vez de silenciosamente aberto.

**Estado: MITIGADO como higiene, e documentado como não sendo segurança.** O que protege é o token.

---

### 10. Segredo dentro de `VITE_*`

**Ataque.** Alguém põe a `service_role` key numa variável `VITE_*` para "ser mais fácil".

**Risco.** Máximo. A `service_role` **ignora a RLS**: no browser, é acesso total à base de dados de todas as empresas.

**Mitigação.** Tudo o que começa por `VITE_` é substituído literalmente no bundle e é público. A `anon` key está lá de propósito (é ela que a RLS espera ver, e não concede nada por si). A `service_role` vive só em `process.env` do servidor.

**Estado: MITIGADO.** `bundleSemAuthSimulada.test.js` procura no `dist/` construído: `service_role`, `SUPABASE_SERVICE`, chaves privadas PEM, e `VITE_*SECRET|PRIVATE`. E verifica que o `.env` do projeto não define nenhuma `VITE_*` com nome suspeito — reportando o **nome** da variável e nunca o valor, para que um teste a falhar não publique um segredo no CI.

---

### 11. XSS

**Ataque.** Injetar script na página; ler o token do `localStorage`; agir como o utilizador.

**Risco.** Com XSS não há defesa de autorização que valha: o atacante age *como* o utilizador, com credenciais válidas.

**Mitigações presentes.**
- React escapa por omissão; o projeto **não usa `dangerouslySetInnerHTML`** em lado nenhum.
- A `note` da confirmação de cobertura é limitada a 280 caracteres e **nunca** entra no registo de auditoria (só o comprimento).
- O `viewer` não escreve, o que limita o estrago de uma sessão comprometida de baixo privilégio.

**Estado: ACEITE, parcialmente mitigado.** Em falta e no plano: **Content-Security-Policy**. No GitHub Pages faz-se por `<meta http-equiv>`; num domínio próprio, por cabeçalho. É o próximo passo de endurecimento e não bloqueia a fundação.

Nota sobre `httpOnly`: mover o token para um cookie `httpOnly` protegeria contra a *leitura* do token, mas não contra o XSS *usar* a sessão — e traria CSRF de volta. Não é claramente melhor e não se faz agora.

---

### 12. Replay de uma escrita

**Ataque.** Capturar `POST /manual-coverage` e repeti-lo.

**Risco.** **Baixo, por desenho.** A escrita é **idempotente por `(company_id, source)`**: um upsert. Repetir a confirmação de julho grava julho outra vez — mesmo estado. Não há incremento, não há saldo, não há contador.

O que fica é ruído no registo de auditoria: N entradas para uma ação. Detetável (mesmo ator, mesmo mês, timestamps próximos) e sem efeito financeiro.

**Estado: MITIGADO POR DESENHO.** Se algum dia houver uma escrita **não idempotente** (um lançamento, um pagamento), aí é preciso chave de idempotência. Está registado como pré-requisito dessa funcionalidade, e não desta.

---

## Resumo

| # | Ameaça | Estado |
|---|---|---|
| 1 | `companyId` adulterado | MITIGADO |
| 2 | `localStorage` adulterado | MITIGADO |
| 3 | Sem token | MITIGADO |
| 4 | Token expirado | MITIGADO |
| 5 | Sem membership | MITIGADO |
| 6 | Token de A → empresa B | MITIGADO |
| 7 | Apps Script direto | **ACEITE** — plano em 3 passos |
| 8 | URL do proxy conhecido | MITIGADO (endpoints novos) |
| 9 | CORS | MITIGADO como higiene |
| 10 | Segredo em `VITE_*` | MITIGADO |
| 11 | XSS | **ACEITE** — CSP em falta |
| 12 | Replay | MITIGADO POR DESENHO |
