import { Construction } from "lucide-react";
import PageHeader from "../layouts/PageHeader";

// Placeholder para telas ainda não implementadas (Etapa 2+)
export default function Placeholder({ title }) {
  return (
    <>
      <PageHeader title={title} subtitle="Esta tela será implementada nas próximas etapas." />
      <div className="card p-12 flex flex-col items-center justify-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-slate-400 mb-4">
          <Construction size={26} />
        </div>
        <h3 className="text-base font-semibold text-slate-700">Em construção</h3>
        <p className="text-sm text-slate-500 mt-1 max-w-sm">
          Tela incluída no plano activo e disponível assim que implementada.
        </p>
      </div>
    </>
  );
}
