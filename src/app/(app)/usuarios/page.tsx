"use client";

import * as React from "react";
import { Users, Plus, Trash2, ShieldCheck, ShieldAlert, Search, Download } from "lucide-react";
import { exportarExcel } from "@/lib/excel";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useConsulta } from "@/lib/hooks";
import { mensajeError, formatFecha } from "@/lib/utils";
import type { Usuario, RolUsuario } from "@/lib/types";
import { ROLES_USUARIO } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Field, Select } from "@/components/ui/field";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm";
import { TableContainer, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

const COLOR_ROL: Record<RolUsuario, string> = {
  Administrador: "bg-primary/10 text-primary ring-primary/20",
  "Jefe de Proyecto": "bg-emerald-100 text-emerald-700 ring-emerald-200",
  Bodeguero: "bg-blue-100 text-blue-700 ring-blue-200",
  Adquisiciones: "bg-violet-100 text-violet-700 ring-violet-200",
  Visualizador: "bg-slate-100 text-slate-600 ring-slate-200",
};

export default function UsuariosPage() {
  const toast = useToast();

  async function exportar() {
    try {
      await exportarExcel("usuarios_insiso", filtrados.map((u) => ({
        nombre: u.nombre,
        email: u.email,
        rol: u.rol,
        bodega: u.bodega_id ? (mapBodega.get(u.bodega_id)?.nombre ?? "Bodega") : "Todas",
        activo: u.activo ? "Sí" : "No",
        creado: formatFecha(u.created_at),
      })), "Usuarios");
      toast.exito(`Exportados ${filtrados.length} usuario(s) a Excel.`);
    } catch (err) {
      toast.error(mensajeError(err));
    }
  }
  const [modalAbierto, setModalAbierto] = React.useState(false);
  const [guardando, setGuardando] = React.useState(false);
  const [aEliminar, setAEliminar] = React.useState<Usuario | null>(null);
  const [eliminando, setEliminando] = React.useState(false);
  const [busqueda, setBusqueda] = React.useState("");
  const [orden, setOrden] = React.useState<"az" | "za">("az");
  const [form, setForm] = React.useState({
    nombre: "",
    email: "",
    password: "",
    rol: "Visualizador" as RolUsuario,
    bodega_id: "",
  });

  const { datos, cargando, error, refrescar } = useConsulta(async () => {
    const sb = getSupabaseClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    const [usuarios, perfil, bodegas] = await Promise.all([
      sb.from("usuarios").select("*").order("created_at", { ascending: false }),
      user
        ? sb.from("usuarios").select("rol").eq("auth_user_id", user.id).single()
        : Promise.resolve({ data: null, error: null }),
      sb.from("bodegas").select("id, codigo, nombre, activo").order("nombre"),
    ]);
    if (usuarios.error) throw usuarios.error;
    return {
      usuarios: usuarios.data as Usuario[],
      authUserId: user?.id ?? null,
      esAdmin: (perfil.data as { rol?: RolUsuario } | null)?.rol === "Administrador",
      bodegas: (bodegas.data ?? []) as { id: string; codigo: string; nombre: string; activo: boolean }[],
    };
  });

  const usuarios = datos?.usuarios ?? [];
  const esAdmin = datos?.esAdmin ?? false;
  const miAuthId = datos?.authUserId ?? null;
  const bodegas = React.useMemo(() => (datos?.bodegas ?? []).filter((b) => b.activo), [datos]);
  const mapBodega = React.useMemo(() => new Map(bodegas.map((b) => [b.id, b])), [bodegas]);
  const filtrados = usuarios
    .filter((u) => {
      const q = busqueda.toLowerCase().trim();
      if (!q) return true;
      return (
        u.nombre.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.rol.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const cmp = a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
      return orden === "za" ? -cmp : cmp;
    });

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim() || !form.email.trim() || form.password.length < 6) {
      toast.error("Completa nombre, correo y una contraseña de al menos 6 caracteres.");
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo crear el usuario.");
      toast.exito(`Usuario "${form.nombre}" creado. Ya puede iniciar sesión.`);
      setModalAbierto(false);
      setForm({ nombre: "", email: "", password: "", rol: "Visualizador", bodega_id: "" });
      refrescar();
    } catch (err) {
      toast.error(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar() {
    if (!aEliminar) return;
    setEliminando(true);
    try {
      const params = new URLSearchParams({ usuarioId: aEliminar.id });
      if (aEliminar.auth_user_id) params.set("authUserId", aEliminar.auth_user_id);
      const res = await fetch(`/api/usuarios?${params.toString()}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo eliminar.");
      toast.exito("Usuario eliminado y acceso revocado.");
      setAEliminar(null);
      refrescar();
    } catch (err) {
      toast.error(mensajeError(err));
    } finally {
      setEliminando(false);
    }
  }

  return (
    <div>
      <PageHeader
        titulo="Gestión de Usuarios"
        descripcion="Crea cuentas y controla quién tiene acceso al sistema."
        icono={Users}
        acciones={
          esAdmin && (
            <div className="flex gap-2">
              <Button variante="outline" onClick={exportar} disabled={filtrados.length === 0}>
                <Download className="h-4 w-4" /> Exportar
              </Button>
              <Button onClick={() => setModalAbierto(true)}>
                <Plus className="h-4 w-4" /> Nuevo Usuario
              </Button>
            </div>
          )
        }
      />

      {!cargando && !error && esAdmin && usuarios.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar por nombre, correo o rol…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="pl-9" />
          </div>
        <Select value={orden} onChange={(e) => setOrden(e.target.value as "az" | "za")} className="h-10 w-auto">
          <option value="az">A → Z</option>
          <option value="za">Z → A</option>
        </Select>
        </div>
      )}

      {cargando ? (
        <LoadingState mensaje="Cargando usuarios…" />
      ) : error ? (
        <ErrorState mensaje={error} onReintentar={refrescar} />
      ) : !esAdmin ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-amber-200 bg-amber-50 py-12 px-6 text-center">
          <ShieldAlert className="h-8 w-8 text-amber-600" />
          <div>
            <p className="font-medium text-amber-800">Acceso restringido</p>
            <p className="mt-1 max-w-md text-sm text-amber-700">
              Solo los usuarios con rol <strong>Administrador</strong> pueden gestionar cuentas.
            </p>
          </div>
        </div>
      ) : usuarios.length === 0 ? (
        <EmptyState
          titulo="Aún no hay usuarios"
          descripcion="Crea la primera cuenta para dar acceso al sistema."
          accion={
            <Button onClick={() => setModalAbierto(true)}>
              <Plus className="h-4 w-4" /> Nuevo Usuario
            </Button>
          }
        />
      ) : (
        <TableContainer>
          <THead>
            <TR>
              <TH>Nombre</TH>
              <TH>Correo</TH>
              <TH>Rol</TH>
              <TH>Bodega</TH>
              <TH className="text-center">Estado</TH>
              <TH>Creado</TH>
              <TH className="text-right">Acciones</TH>
            </TR>
          </THead>
          <TBody>
            {filtrados.map((u) => {
              const soyYo = !!miAuthId && u.auth_user_id === miAuthId;
              return (
                <TR key={u.id}>
                  <TD className="font-medium">
                    {u.nombre}
                    {soyYo && <span className="ml-2 text-xs text-muted-foreground">(tú)</span>}
                  </TD>
                  <TD className="text-muted-foreground">{u.email}</TD>
                  <TD>
                    <Badge color={COLOR_ROL[u.rol]}>
                      {u.rol === "Administrador" && <ShieldCheck className="mr-1 h-3 w-3" />}
                      {u.rol}
                    </Badge>
                  </TD>
                  <TD>
                    {u.bodega_id ? (
                      <Badge color="bg-amber-100 text-amber-700 ring-amber-200">
                        {mapBodega.get(u.bodega_id)?.nombre ?? "Bodega"}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Todas</span>
                    )}
                  </TD>
                  <TD className="text-center">
                    {u.activo ? (
                      <Badge color="bg-emerald-100 text-emerald-700 ring-emerald-200">Activo</Badge>
                    ) : (
                      <Badge color="bg-slate-100 text-slate-600 ring-slate-200">Inactivo</Badge>
                    )}
                  </TD>
                  <TD className="text-xs text-muted-foreground">{formatFecha(u.created_at)}</TD>
                  <TD>
                    <div className="flex justify-end">
                      <Button
                        variante="ghost"
                        tamano="icon"
                        onClick={() => setAEliminar(u)}
                        aria-label="Eliminar"
                        disabled={soyYo}
                        title={soyYo ? "No puedes eliminar tu propia cuenta" : "Eliminar usuario"}
                        className="text-destructive hover:bg-destructive/10 disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </TableContainer>
      )}

      {/* Modal crear usuario */}
      <Modal
        abierto={modalAbierto}
        onCerrar={() => setModalAbierto(false)}
        titulo="Nuevo Usuario"
        descripcion="La persona podrá iniciar sesión de inmediato con estos datos."
        ancho="max-w-md"
      >
        <form onSubmit={crear} className="space-y-4">
          <Field label="Nombre completo" required>
            <Input
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="María González"
            />
          </Field>
          <Field label="Correo electrónico" required>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="maria@insiso.cl"
            />
          </Field>
          <Field label="Contraseña inicial" required hint="Mínimo 6 caracteres. La persona puede cambiarla luego.">
            <Input
              type="text"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Contraseña temporal"
            />
          </Field>
          <Field label="Rol" required>
            <Select
              value={form.rol}
              onChange={(e) => setForm({ ...form, rol: e.target.value as RolUsuario })}
            >
              {ROLES_USUARIO.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Bodega asignada"
            hint="Déjalo en “Todas” para acceso normal. Si eliges una bodega, la persona sólo verá y operará esa bodega."
          >
            <Select
              value={form.bodega_id}
              onChange={(e) => setForm({ ...form, bodega_id: e.target.value })}
            >
              <option value="">Todas (sin restricción)</option>
              {bodegas.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nombre} ({b.codigo})
                </option>
              ))}
            </Select>
          </Field>
          <ModalFooter>
            <Button type="button" variante="outline" onClick={() => setModalAbierto(false)}>
              Cancelar
            </Button>
            <Button type="submit" cargando={guardando}>
              Crear usuario
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      <ConfirmDialog
        abierto={!!aEliminar}
        titulo="Eliminar usuario"
        mensaje={`¿Eliminar a "${aEliminar?.nombre}"? Se revocará su acceso al sistema de forma permanente.`}
        cargando={eliminando}
        onConfirmar={eliminar}
        onCancelar={() => setAEliminar(null)}
      />
    </div>
  );
}
