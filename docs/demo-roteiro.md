# Roteiro de Demonstração — Finer One

Guião curto para apresentar o protótipo da Finer One a sócios, parceiros e potenciais clientes. Duração estimada: **15 a 20 minutos**, incluindo perguntas.

---

## 1. Abertura (2 min) — O problema

> *"As PME portuguesas têm dados financeiros. Não têm inteligência financeira."*

Pontos-chave para introduzir:

- As PME representam mais de 99% do tecido empresarial português.
- A maioria opera com contabilidade tradicional, Excel e processos manuais.
- O contabilista responde a obrigações fiscais — **não** a perguntas de gestão.
- Resultado: o empresário trabalha muito, mas não sabe se está realmente a ganhar dinheiro, onde perde margem ou se terá liquidez daqui a 30 dias.

Frase-âncora: *"O empresário vive sempre em modo reação. Nós queremos pô-lo em modo previsão."*

---

## 2. O que é a Finer One (2 min)

A Finer One é um **CFO digital inteligente** para PME portuguesas.

Liga-se a:
- programas de faturação,
- contabilidade,
- bancos (Open Banking),
- ERPs,
- ficheiros Excel/CSV.

E transforma esses dados em:
- **decisões** (não em lançamentos),
- **previsões** (não em relatórios mensais),
- **alertas** (antes do problema, não depois),
- **recomendações** (não dashboards passivos).

---

## 3. O que a Finer One não é (1 min)

Importante deixar claro logo no início para evitar confusões:

| Não somos | Somos |
|---|---|
| Software de contabilidade | Camada de **inteligência** sobre a contabilidade |
| Programa de faturação | Não emitimos faturas |
| ERP pesado | Plataforma leve, focada em decisão |
| Consultora financeira | Substituímos a parte rotineira do controller |

---

## 4. Demonstração ao vivo (10-12 min)

Mostrar com o plano **Team** ou **Enterprise** ativo (rodapé da sidebar) para ver todas as funcionalidades. Empresa em demonstração: **Overcel**.

### 4.1 — Resumo *(1 min)*
> *"Esta é a primeira tela que o empresário vê todos os dias."*

- 4 KPIs imediatos: saldo, receitas, despesas, resultado.
- Cashflow previsto a 30 dias.
- Alertas importantes em destaque.
- Faturas em atraso já em primeiro plano.
- CTA grande para o Diagnóstico.

Mensagem: *"Em 5 segundos o empresário sabe se há fogo a apagar hoje."*

### 4.2 — Diagnóstico Financeiro *(1 min)*
- Score 0-100 com leitura clara (Saudável / Atenção / Crítico).
- Impacto financeiro identificado em €.
- Prioridade máxima sugerida.

Mensagem: *"Como um check-up médico — uma página, uma conclusão."*

### 4.3 — Receitas *(1 min)*
- De onde vem o dinheiro?
- Por categoria, por cliente, por período.
- Evolução visual.

Mensagem: *"Volume de negócios não é dinheiro no banco. Aqui veem-se as duas coisas separadamente."*

### 4.4 — Despesas *(1 min)*
- Onde está a empresa a gastar?
- Categorias que pressionam a margem.
- Pagamentos pendentes e em atraso.

### 4.5 — Planeamento e Cashflow *(2 min) — DIFERENCIAL FORTE*
> *"Esta é a tela que vai impressionar bancos."*

- Saldo previsto a 30 e 90 dias.
- Risco de liquidez classificado.
- Dias de folga financeira.
- Recomendações automáticas.

Mensagem: *"Permite ao empresário negociar crédito antes de precisar dele — não no dia em que falta dinheiro."*

### 4.6 — Finer Score *(1 min) — Team/Enterprise*
- Nota única de 0 a 100.
- Histórico de 6 meses.
- Fatores que impactam (liquidez, rentabilidade, endividamento, etc.).
- Sugestões com impacto estimado em pontos.

Mensagem: *"Um Standard & Poor's para PME. Útil para bancos, fornecedores e investidores."*

### 4.7 — IA Financeira *(2 min) — DIFERENCIAL CHAVE*
> *"Aqui é onde a Finer One deixa de ser dashboard e começa a ser CFO."*

- O que a IA identificou hoje (insights proativos).
- Análise detalhada com impacto em €.
- Recomendações com valor estimado de retorno.
- Conversa histórica.

Mensagem: *"Não pedimos ao empresário para interpretar gráficos. A IA já interpretou por ele."*

### 4.8 — Chat Financeiro *(1 min)*
- Perguntas em linguagem natural.
- Respostas com números reais e tabelas.
- Sugestões para começar.

Mensagem: *"O empresário não fala SQL. Mas sabe perguntar 'Quais os meus 5 maiores clientes?'."*

### 4.9 — Benchmarking do Setor *(1 min) — Enterprise*
- A Overcel comparada com média do setor e melhores 25%.
- Posição percentil clara.
- Insights sobre o que melhorar.

Mensagem: *"Não basta ter bons indicadores. É preciso saber se são bons para o setor."*

---

## 5. Como explicar os 4 planos (2 min)

| Plano | Para quem | Telas | Foco |
|---|---|---|---|
| **Plus** | Microempresas em arranque | 9 | Visão financeira essencial |
| **Pro** | PME com alguma estrutura | 13 | Adiciona Movimentos, Planeamento, Indicadores e Relatório |
| **Team** | PME em crescimento | 15 | Adiciona Finer Score, IA Financeira e Alertas Preditivos |
| **Enterprise** | PME maiores e grupos | 16 | Adiciona Benchmarking do Setor |

Demonstrar troca de plano ao vivo no seletor do rodapé da sidebar — a sidebar reorganiza-se sozinha. Útil para mostrar visualmente o que cada plano desbloqueia.

---

## 6. Pontos fortes do protótipo atual

- **17 telas oficiais** implementadas e navegáveis.
- Arquitetura **multi-plano** real: uma única aplicação, com módulos ativados por configuração.
- **Português europeu** consistente, linguagem para empresários.
- Dados mockados **coerentes** da empresa fictícia Overcel.
- Identidade visual **limpa e moderna** (não parece software anos 2000).
- Pronto para **mockar conversas** com bancos, contabilistas e potenciais clientes.

---

## 7. Limitações assumidas

Deixar claro logo de início — protege a credibilidade:

- Este é um **protótipo front-end**: sem backend, sem base de dados, sem autenticação real.
- A "IA" e os "alertas preditivos" mostram **dados pré-preparados**, não cálculo real.
- Não há integrações reais com bancos (Open Banking), faturação ou contabilidade.
- Não há sistema de pagamentos, faturação a clientes da Finer One ou gestão de subscrições.
- O propósito atual é **validar a proposta de valor** e a experiência, não a tecnologia de backend.

---

## 8. Próximos passos recomendados

Apresentar como roadmap em 3 ondas:

**Onda 1 — Validação (próximas 4-6 semanas)**
- Mostrar o protótipo a 8-12 PME-alvo.
- Recolher feedback estruturado.
- Refinar telas críticas (Resumo, Diagnóstico, IA Financeira).

**Onda 2 — MVP funcional (3-4 meses)**
- Backend Node/Python com base de dados.
- Integração com 1-2 softwares de faturação portugueses (Moloni, InvoiceXpress).
- Open Banking via SIBS API Market.
- Primeira IA real (modelos prontos sobre dados normalizados).

**Onda 3 — Comercial (6-9 meses)**
- Onboarding self-service.
- Faturação automática.
- Planos pagos (Plus / Pro / Team / Enterprise).
- Suporte e onboarding assistido.

---

## Dicas para a apresentação

- **Comece sempre pela dor**, não pelo produto.
- **Não defenda a tecnologia.** Defenda o resultado para o empresário.
- **Use o cliente fictício** (Overcel) como personagem — torna a demo concreta.
- **Mostre o seletor de planos cedo** — explica monetização em 10 segundos.
- **Quando alguém perguntar "isto já funciona?"** → "Esta é a experiência. O backend está no roadmap. O foco agora é validar que o empresário paga por isto."
