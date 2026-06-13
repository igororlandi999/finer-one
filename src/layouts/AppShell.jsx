import { useState } from "react";
import { Menu } from "lucide-react";
import Sidebar from "./Sidebar";
import DemoBanner from "../components/ui/DemoBanner";
import { company } from "../data/mockData";

export default function AppShell({ children }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <main className="flex-1 min-w-0 overflow-x-hidden">
        {/* Top bar mobile/tablet (apenas <lg) */}
        <div className="lg:hidden sticky top-0 z-20 flex items-center gap-3 px-4 py-3 bg-sidebar text-white border-b border-sidebar-border">
          <button
            onClick={() => setDrawerOpen(true)}
            className="p-1.5 rounded-md hover:bg-sidebar-hover"
            aria-label="Abrir menu"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-500 text-white font-bold text-sm shrink-0">
              F
            </div>
            <div className="leading-tight min-w-0">
              <div className="text-sm font-bold tracking-tight truncate">FINER ONE</div>
              <div className="text-[10px] text-sidebar-muted truncate">{company.name}</div>
            </div>
          </div>
        </div>

        <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-7 max-w-[1400px] mx-auto">
          <DemoBanner />
          {children}
        </div>
      </main>
    </div>
  );
}
