import { createContext, useContext, useMemo, useState } from "react";
import {
  PLANS, PLAN_LIST, SCREEN_CATALOG, SCREENS, DEFAULT_PLAN,
} from "../config/planConfig";

const PlanContext = createContext(null);

export function PlanProvider({ children }) {
  const [activePlanId, setActivePlanId] = useState(DEFAULT_PLAN);
  const [activeScreen, setActiveScreen] = useState(SCREENS.RESUMO);

  const value = useMemo(() => {
    const plan = PLANS[activePlanId];
    const allowedSet = new Set(plan.screens);
    const visibleScreens = plan.screens.map((id) => SCREEN_CATALOG[id]);

    const hasAccess = (screenId) => allowedSet.has(screenId);

    const navigateTo = (screenId) => {
      if (hasAccess(screenId)) setActiveScreen(screenId);
    };

    const changePlan = (planId) => {
      if (!PLANS[planId]) return;
      setActivePlanId(planId);
      const next = PLANS[planId];
      if (!next.screens.includes(activeScreen)) {
        setActiveScreen(SCREENS.RESUMO);
      }
    };

    return {
      plan,
      activePlanId,
      activeScreen,
      visibleScreens,
      hasAccess,
      navigateTo,
      changePlan,
      planList: PLAN_LIST,
      capabilities: plan.capabilities,
    };
  }, [activePlanId, activeScreen]);

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error("usePlan deve ser usado dentro de <PlanProvider>");
  return ctx;
}
