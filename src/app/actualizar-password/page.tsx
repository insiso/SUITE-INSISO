"use client";

import * as React from "react";
import { HardHat, KeyRound } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { mensajeError } from "@/lib/utils";
import { APP_EMPRESA } from "@/lib/constants";
import { Input, Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

export default function ActualizarPasswordPage() {
  const [forzado, setForzado] = React.useState(false);
  const [p1, setP1] = React.useState("");
  const [p2, setP2] = React.useState("");
  const [cargando, setCargando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sinSesion, setSinSesion] = React.useState(false);

  React.useEffect(() => {
    setForzado(new URLSearchParams(window.location.search).get("forzado") === "1");
    getSupabaseClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!data.session) setSinSesion(true);
      })
      .catch(() => setSinSesion(true));
  }, []);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (p1.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (p1 !== p2) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setCargando(true);
    try {
      const sb = getSupabaseClient();
      const { error } = await sb.auth.updateUser({ password: p1 });
      if (error) {
        setError(error.message);
        return;
      }
      // Limpia el flag "debe cambiar contraseña" (si corresponde).
      try {
        await fetch("/api/usuarios/password-cambiada", { method: "POST" });
      } catch {
        /* no bloquea el flujo */
      }
      window.location.href = "/dashboard";
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-background to-slate-200 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <HardHat className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Suite INSISO</h1>
          <p className="text-sm text-muted-foreground">{APP_EMPRESA}</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-xl">
          <h2 className="mb-1 text-lg font-semibold">
            {forzado ? "Crea tu contraseña" : "Nueva contraseña"}
          </h2>
          <p className="mb-6 text-sm text-muted-foreground">
            {forzado
              ? "Por seguridad, define una contraseña personal para continuar."
              : "Ingresa tu nueva contraseña."}
          </p>

          {sinSesion ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              El enlace expiró o no es válido. Vuelve al{" "}
              <a href="/login" className="font-medium underline">
                inicio de sesión
              </a>{" "}
              y solicita uno nuevo.
            </div>
          ) : (
            <form onSubmit={guardar} className="space-y-4">
              <Field label="Nueva contraseña" required>
                <Input
                  type="password"
                  autoComplete="new-password"
                  placeholder="Mínimo 8 caracteres"
                  value={p1}
                  onChange={(e) => setP1(e.target.value)}
                  required
                />
              </Field>
              <Field label="Repite la contraseña" required>
                <Input
                  type="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={p2}
                  onChange={(e) => setP2(e.target.value)}
                  required
                />
              </Field>
              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
              <Button type="submit" cargando={cargando} className="w-full" tamano="lg">
                {!cargando && <KeyRound className="h-4 w-4" />}
                Guardar contraseña
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
