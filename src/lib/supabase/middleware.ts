import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { RolUsuario } from "@/lib/types";
import { puedeAcceder, rutaInicial } from "@/lib/permisos";

type CookieParaFijar = { name: string; value: string; options?: CookieOptions };

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * Refresca la sesion y protege las rutas.
 * - Sin sesion → redirige a /login (excepto APIs, /login y rutas de recuperacion de contrasena).
 * - Con sesion en /login → redirige a su seccion inicial segun rol.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!supabaseUrl || !supabaseAnonKey) return response;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieParaFijar[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const esLogin = path === "/login";
  const esApi = path.startsWith("/api");
  const esSinAcceso = path.startsWith("/sin-acceso");
  const esAuth = path.startsWith("/auth"); // callback de recuperacion / invitacion
  const esActualizarPass = path.startsWith("/actualizar-password"); // definir/cambiar contrasena

  // Sin sesion → al login (salvo login, APIs y las rutas de recuperacion de contrasena)
  if (!user) {
    if (!esLogin && !esApi && !esAuth && !esActualizarPass) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    return response;
  }

  // Con sesion: APIs y rutas de contrasena se resuelven por si mismas
  if (esApi || esAuth || esActualizarPass) return response;

  // Rol del usuario para permisos por seccion
  const { data: perfil } = await supabase
    .from("usuarios")
    .select("rol, bodega_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  const rol = (perfil?.rol ?? null) as RolUsuario | null;
  const tieneBodega = !!(perfil as { bodega_id?: string | null } | null)?.bodega_id;

  // Ya autenticado en /login → a su seccion inicial
  if (esLogin) {
    const url = request.nextUrl.clone();
    url.pathname = rutaInicial(rol, tieneBodega);
    return NextResponse.redirect(url);
  }

  if (esSinAcceso) return response;

  // Bloqueo por rol
  if (!puedeAcceder(rol, path, tieneBodega)) {
    const url = request.nextUrl.clone();
    url.pathname = rutaInicial(rol, tieneBodega);
    return NextResponse.redirect(url);
  }

  return response;
}
