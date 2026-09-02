"use client";

import * as React from "react";
import { LogIn, Mail, ArrowLeft } from "lucide-react";
import { getSupabaseClient, supabaseConfigurado } from "@/lib/supabase/client";
import { mensajeError } from "@/lib/utils";
import { APP_EMPRESA } from "@/lib/constants";
import { Input, Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

type Modo = "login" | "recuperar";

export default function LoginPage() {
  const [modo, setModo] = React.useState<Modo>("login");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [cargando, setCargando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [aviso, setAviso] = React.useState<string | null>(null);

  async function ingresar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAviso(null);
    if (!supabaseConfigurado) {
      setError("Faltan las credenciales de Supabase (.env.local).");
      return;
    }
    setCargando(true);
    try {
      const sb = getSupabaseClient();
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setError(/invalid login/i.test(error.message) ? "Correo o contraseña incorrectos." : error.message);
        return;
      }
      window.location.href = "/dashboard";
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }

  async function recuperar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAviso(null);
    if (!email.trim()) {
      setError("Ingresa tu correo.");
      return;
    }
    if (!supabaseConfigurado) {
      setError("Faltan las credenciales de Supabase (.env.local).");
      return;
    }
    setCargando(true);
    try {
      const sb = getSupabaseClient();
      const { error } = await sb.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/actualizar-password`,
      });
      if (error) {
        setError(error.message);
        return;
      }
      setAviso(
        "Si el correo está registrado, te enviamos un enlace para crear una nueva contraseña. Revisa tu bandeja (y la carpeta de spam)."
      );
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-insiso.png"
            alt="INSISO · Ingeniería, Sistemas & Software"
            className="mb-4 h-14 w-auto"
          />
          <h1 className="sr-only">Suite INSISO · {APP_EMPRESA}</h1>
          <p className="text-sm text-muted-foreground">Suite de gestión empresarial</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-xl">
          {modo === "login" ? (
            <>
              <h2 className="mb-1 text-lg font-semibold">Iniciar sesión</h2>
              <p className="mb-6 text-sm text-muted-foreground">
                Ingresa con la cuenta que te entregó el administrador.
              </p>
              <form onSubmit={ingresar} className="space-y-4">
                <Field label="Correo electrónico" required>
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder="nombre@insiso.cl"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Contraseña" required>
                  <Input
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </Field>
                {error && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {error}
                  </div>
                )}
                <Button type="submit" cargando={cargando} className="w-full" tamano="lg">
                  {!cargando && <LogIn className="h-4 w-4" />}
                  Ingresar
                </Button>
              </form>
              <button
                type="button"
                onClick={() => {
                  setModo("recuperar");
                  setError(null);
                  setAviso(null);
                }}
                className="mt-4 w-full text-center text-sm font-medium text-primary hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </>
          ) : (
            <>
              <h2 className="mb-1 text-lg font-semibold">Restablecer contraseña</h2>
              <p className="mb-6 text-sm text-muted-foreground">
                Te enviaremos un enlace a tu correo para crear una nueva contraseña.
              </p>
              <form onSubmit={recuperar} className="space-y-4">
                <Field label="Correo electrónico" required>
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder="nombre@insiso.cl"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </Field>
                {error && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {error}
                  </div>
                )}
                {aviso && (
                  <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    {aviso}
                  </div>
                )}
                <Button type="submit" cargando={cargando} className="w-full" tamano="lg">
                  {!cargando && <Mail className="h-4 w-4" />}
                  Enviar enlace
                </Button>
              </form>
              <button
                type="button"
                onClick={() => {
                  setModo("login");
                  setError(null);
                  setAviso(null);
                }}
                className="mt-4 flex w-full items-center justify-center gap-1 text-center text-sm font-medium text-muted-foreground hover:underline"
              >
                <ArrowLeft className="h-4 w-4" /> Volver a iniciar sesión
              </button>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          ¿Problemas para entrar? Contacta al administrador del sistema.
        </p>
      </div>
    </div>
  );
}
