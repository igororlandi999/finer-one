// ─── planConfig.js ───────────────────────────────────────────
// Fonte única de verdade: planos, telas e capacidades.
// Sidebar e guards de acesso gerados a partir daqui.
// ─────────────────────────────────────────────────────────────

import {
  LayoutDashboard, Stethoscope, ArrowLeftRight,
  TrendingUp, TrendingDown, Users, FileText,
  BarChart3, CalendarRange, Activity, Award,
  Globe, ClipboardList, Bell, Radar,
  BrainCircuit, MessageSquare,
} from "lucide-react";

// IDs canónicos das 17 telas
export const SCREENS = {
  RESUMO:                "resumo",
  DIAGNOSTICO:           "diagnostico",
  MOVIMENTOS:            "movimentos",
  RECEITAS:              "receitas",
  DESPESAS:              "despesas",
  CLIENTES_FORNECEDORES: "clientes-fornecedores",
  DOCUMENTOS:            "documentos",
  PERFORMANCE:           "performance",
  PLANEAMENTO:           "planeamento",
  INDICADORES:           "indicadores",
  FINER_SCORE:           "finer-score",
  BENCHMARKING:          "benchmarking",
  RELATORIO:             "relatorio",
  ALERTAS:               "alertas",
  ALERTAS_PREDITIVOS:    "alertas-preditivos",
  IA_FINANCEIRA:         "ia-financeira",
  CHAT_FINANCEIRO:       "chat-financeiro",
};

// Catálogo completo: label + icon por tela
export const SCREEN_CATALOG = {
  [SCREENS.RESUMO]:                { id: SCREENS.RESUMO,                label: "Resumo",                  icon: LayoutDashboard },
  [SCREENS.DIAGNOSTICO]:           { id: SCREENS.DIAGNOSTICO,           label: "Diagnóstico Financeiro",  icon: Stethoscope     },
  [SCREENS.MOVIMENTOS]:            { id: SCREENS.MOVIMENTOS,            label: "Movimentos",              icon: ArrowLeftRight  },
  [SCREENS.RECEITAS]:              { id: SCREENS.RECEITAS,              label: "Receitas",                icon: TrendingUp      },
  [SCREENS.DESPESAS]:              { id: SCREENS.DESPESAS,              label: "Despesas",                icon: TrendingDown    },
  [SCREENS.CLIENTES_FORNECEDORES]: { id: SCREENS.CLIENTES_FORNECEDORES, label: "Clientes e Fornecedores", icon: Users           },
  [SCREENS.DOCUMENTOS]:            { id: SCREENS.DOCUMENTOS,            label: "Documentos",              icon: FileText        },
  [SCREENS.PERFORMANCE]:           { id: SCREENS.PERFORMANCE,           label: "Performance Financeira",  icon: BarChart3       },
  [SCREENS.PLANEAMENTO]:           { id: SCREENS.PLANEAMENTO,           label: "Planeamento e Cashflow",  icon: CalendarRange   },
  [SCREENS.INDICADORES]:           { id: SCREENS.INDICADORES,           label: "Indicadores",             icon: Activity        },
  [SCREENS.FINER_SCORE]:           { id: SCREENS.FINER_SCORE,           label: "Finer Score",             icon: Award           },
  [SCREENS.BENCHMARKING]:          { id: SCREENS.BENCHMARKING,          label: "Benchmarking do Setor",   icon: Globe           },
  [SCREENS.RELATORIO]:             { id: SCREENS.RELATORIO,             label: "Relatório",               icon: ClipboardList   },
  [SCREENS.ALERTAS]:               { id: SCREENS.ALERTAS,               label: "Alertas",                 icon: Bell            },
  [SCREENS.ALERTAS_PREDITIVOS]:    { id: SCREENS.ALERTAS_PREDITIVOS,    label: "Alertas Preditivos",      icon: Radar           },
  [SCREENS.IA_FINANCEIRA]:         { id: SCREENS.IA_FINANCEIRA,         label: "IA Financeira",           icon: BrainCircuit    },
  [SCREENS.CHAT_FINANCEIRO]:       { id: SCREENS.CHAT_FINANCEIRO,       label: "Chat Financeiro",         icon: MessageSquare   },
};

// Definição dos 4 planos — a ordem de `screens` é a ordem exata na sidebar
export const PLANS = {
  plus: {
    id: "plus",
    label: "Plus",
    screens: [
      SCREENS.RESUMO,
      SCREENS.DIAGNOSTICO,
      SCREENS.RECEITAS,
      SCREENS.DESPESAS,
      SCREENS.CLIENTES_FORNECEDORES,
      SCREENS.DOCUMENTOS,
      SCREENS.PERFORMANCE,
      SCREENS.ALERTAS,
      SCREENS.CHAT_FINANCEIRO,
    ],
    capabilities: {
      chatLimited: true,
      alertsLimited: true,
      predictiveAlerts: false,
      proactiveAI: false,
      benchmarking: false,
      finerScore: false,
    },
  },

  pro: {
    id: "pro",
    label: "Pro",
    screens: [
      SCREENS.RESUMO,
      SCREENS.DIAGNOSTICO,
      SCREENS.MOVIMENTOS,
      SCREENS.RECEITAS,
      SCREENS.DESPESAS,
      SCREENS.CLIENTES_FORNECEDORES,
      SCREENS.DOCUMENTOS,
      SCREENS.PERFORMANCE,
      SCREENS.PLANEAMENTO,
      SCREENS.INDICADORES,
      SCREENS.RELATORIO,
      SCREENS.ALERTAS,
      SCREENS.CHAT_FINANCEIRO,
    ],
    capabilities: {
      chatLimited: false,
      alertsLimited: false,
      predictiveAlerts: false,
      proactiveAI: false,
      benchmarking: false,
      finerScore: false,
    },
  },

  team: {
    id: "team",
    label: "Team",
    screens: [
      SCREENS.RESUMO,
      SCREENS.DIAGNOSTICO,
      SCREENS.MOVIMENTOS,
      SCREENS.RECEITAS,
      SCREENS.DESPESAS,
      SCREENS.CLIENTES_FORNECEDORES,
      SCREENS.DOCUMENTOS,
      SCREENS.PERFORMANCE,
      SCREENS.PLANEAMENTO,
      SCREENS.INDICADORES,
      SCREENS.FINER_SCORE,
      SCREENS.RELATORIO,
      SCREENS.ALERTAS_PREDITIVOS,
      SCREENS.IA_FINANCEIRA,
      SCREENS.CHAT_FINANCEIRO,
    ],
    capabilities: {
      chatLimited: false,
      alertsLimited: false,
      predictiveAlerts: true,
      proactiveAI: true,
      benchmarking: false,
      finerScore: true,
    },
  },

  enterprise: {
    id: "enterprise",
    label: "Enterprise",
    screens: [
      SCREENS.RESUMO,
      SCREENS.DIAGNOSTICO,
      SCREENS.MOVIMENTOS,
      SCREENS.RECEITAS,
      SCREENS.DESPESAS,
      SCREENS.CLIENTES_FORNECEDORES,
      SCREENS.DOCUMENTOS,
      SCREENS.PERFORMANCE,
      SCREENS.PLANEAMENTO,
      SCREENS.INDICADORES,
      SCREENS.FINER_SCORE,
      SCREENS.BENCHMARKING,
      SCREENS.RELATORIO,
      SCREENS.ALERTAS_PREDITIVOS,
      SCREENS.IA_FINANCEIRA,
      SCREENS.CHAT_FINANCEIRO,
    ],
    capabilities: {
      chatLimited: false,
      alertsLimited: false,
      predictiveAlerts: true,
      proactiveAI: true,
      benchmarking: true,
      finerScore: true,
    },
  },
};

export const PLAN_LIST    = Object.values(PLANS);
export const DEFAULT_PLAN = "team";
