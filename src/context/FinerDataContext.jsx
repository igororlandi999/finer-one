// src/context/FinerDataContext.jsx
// Fornece o dataset de vendas às telas, mantendo a regra de negócio fora do JSX.
// As telas leem `sales` (ou null) e decidem o fallback ao mockData com `?? mock`.

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { loadFinerData } from "../services/blingDataService.js";

const FinerDataContext = createContext(null);

export function FinerDataProvider({ children }) {
  const [sales, setSales] = useState(null);     // null => telas usam mockData
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState("mock"); // 'api' | 'mock'

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { sales, source } = await loadFinerData();
      setSales(sales);
      setSource(source);
    } catch {
      setSales(null);
      setSource("mock");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <FinerDataContext.Provider value={{ sales, loading, source, reload: load }}>
      {children}
    </FinerDataContext.Provider>
  );
}

export function useFinerData() {
  const ctx = useContext(FinerDataContext);
  if (ctx === null) {
    throw new Error("useFinerData deve ser usado dentro de <FinerDataProvider>.");
  }
  return ctx;
}
