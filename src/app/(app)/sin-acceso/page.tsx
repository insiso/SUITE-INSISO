import { Lock } from "lucide-react";

export default function SinAccesoPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
        <Lock className="h-8 w-8" />
      </div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sin módulos asignados</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Tu cuenta no tiene acceso a ningún módulo del sistema por ahora. Si crees que es un
          error, comunícate con el administrador para que ajuste tus permisos.
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        Puedes cerrar sesión desde el menú de tu cuenta, arriba a la derecha.
      </p>
    </div>
  );
}
