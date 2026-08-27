// src/utils/dataSourceStates.js
// Os quatro estados da FONTE de dados, num módulo PURO — sem React, sem JSX.
//
// ─── PORQUE ISTO EXISTE (C7F.3D) ────────────────────────────────────────────────────
// Os estados nasceram dentro de FinerDataContext.jsx, que é um ficheiro React. Os
// view-models puros (alertsView, performanceView) não os podiam importar sem arrastar
// React para dentro de lógica que se quer testável sem montar nada — e por isso
// passaram a comparar strings à mão: `source === "api"`.
//
// Comparar `source === "api"` responde a UMA pergunta ("é real?") e as camadas de baixo
// deduziam a outra por exclusão: se não é "api", então é demonstração. Isso é falso.
// `unavailable` é uma AVARIA e `loading` é a AUSÊNCIA DE VEREDITO — nenhum dos dois é
// modo demonstração, e tratá-los como tal faz uma app avariada apresentar números
// fictícios como se fossem intencionais. Foi exatamente esse o defeito que a C7F.1
// corrigiu na camada de topo; aqui fecha-se a mesma porta nas camadas de baixo.
//
// O AppShell continua a ser a primeira barreira e não deixa `loading`/`unavailable`
// chegar às páginas. Este módulo não substitui esse portão: garante que, se algum dia
// alguém o remover ou contornar, as camadas de baixo não mentem por omissão.

/** Origem do dataset. Espelha (e agora é a origem de) DATA_SOURCE do contexto. */
export const DATA_SOURCE = {
  LOADING: "loading",
  API: "api",
  MOCK: "mock",
  UNAVAILABLE: "unavailable",
};

/** Fonte real ligada e a responder. */
export function sourceIsReal(source) {
  return source === DATA_SOURCE.API;
}

/**
 * Modo demonstração DELIBERADO: não há backend configurado, o que é uma decisão de
 * quem instalou (ver .env.example). É o ÚNICO estado que autoriza conteúdo fictício.
 */
export function sourceIsDemo(source) {
  return source === DATA_SOURCE.MOCK;
}

/**
 * Nem real nem demonstração: ainda não há veredito (`loading`) ou a fonte falhou
 * (`unavailable`). Também apanha qualquer valor desconhecido — um estado que ninguém
 * reconhece nunca deve abrir a porta a dados fictícios.
 */
export function sourceIsIndeterminate(source) {
  return !sourceIsReal(source) && !sourceIsDemo(source);
}
