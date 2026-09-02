"use client";

import * as React from "react";
import { mensajeError } from "@/lib/utils";

interface EstadoConsulta<T> {
  datos: T | null;
  cargando: boolean;
  error: string | null;
  refrescar: () => void;
}

/**
 * Hook genérico para consultas asíncronas con estados de carga y error.
 * @param consulta  función que retorna una promesa con los datos
 * @param deps      dependencias que re-disparan la consulta
 */
export function useConsulta<T>(
  consulta: () => Promise<T>,
  deps: React.DependencyList = []
): EstadoConsulta<T> {
  const [datos, setDatos] = React.useState<T | null>(null);
  const [cargando, setCargando] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);

  // Guardamos la consulta en un ref para no re-ejecutar por su identidad.
  const consultaRef = React.useRef(consulta);
  consultaRef.current = consulta;

  React.useEffect(() => {
    let activo = true;
    setCargando(true);
    setError(null);

    consultaRef
      .current()
      .then((res) => {
        if (activo) setDatos(res);
      })
      .catch((e) => {
        if (activo) setError(mensajeError(e));
      })
      .finally(() => {
        if (activo) setCargando(false);
      });

    return () => {
      activo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  const refrescar = React.useCallback(() => setTick((t) => t + 1), []);

  return { datos, cargando, error, refrescar };
}
