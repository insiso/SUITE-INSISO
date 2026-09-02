"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import { formatCLP } from "@/lib/utils";

const PALETA = ["#1d4ed8", "#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#14b8a6", "#64748b"];

function abreviarCLP(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(0)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

const ejeStyle = { fontSize: 12, fill: "hsl(215 16% 47%)" };

function TooltipPersonalizado({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      {label && <p className="mb-1 font-semibold text-foreground">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || p.fill }} className="font-medium">
          {p.name}: {formatCLP(p.value)}
        </p>
      ))}
    </div>
  );
}

/** Gasto mensual (barras). */
export function GastoMensualChart({ data }: { data: { mes: string; gasto: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 32% 91%)" vertical={false} />
        <XAxis dataKey="mes" tick={ejeStyle} axisLine={false} tickLine={false} />
        <YAxis tick={ejeStyle} axisLine={false} tickLine={false} tickFormatter={abreviarCLP} width={50} />
        <Tooltip content={<TooltipPersonalizado />} cursor={{ fill: "hsl(210 40% 96%)" }} />
        <Bar dataKey="gasto" name="Gasto" fill="#1d4ed8" radius={[6, 6, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Consumo de materiales (barras horizontales, top N). */
export function ConsumoMaterialesChart({ data }: { data: { nombre: string; valor: number }[] }) {
  if (data.length === 0) {
    return <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">Sin consumo registrado.</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 32% 91%)" horizontal={false} />
        <XAxis type="number" tick={ejeStyle} axisLine={false} tickLine={false} tickFormatter={abreviarCLP} />
        <YAxis
          type="category"
          dataKey="nombre"
          tick={ejeStyle}
          axisLine={false}
          tickLine={false}
          width={130}
        />
        <Tooltip content={<TooltipPersonalizado />} cursor={{ fill: "hsl(210 40% 96%)" }} />
        <Bar dataKey="valor" name="Consumo" radius={[0, 6, 6, 0]} maxBarSize={28}>
          {data.map((_, i) => (
            <Cell key={i} fill={PALETA[i % PALETA.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Ejecución presupuestaria por proyecto (asignado vs gastado). */
export function EjecucionProyectosChart({
  data,
}: {
  data: { codigo: string; asignado: number; gastado: number }[];
}) {
  if (data.length === 0) {
    return <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">Sin proyectos.</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 32% 91%)" vertical={false} />
        <XAxis dataKey="codigo" tick={ejeStyle} axisLine={false} tickLine={false} />
        <YAxis tick={ejeStyle} axisLine={false} tickLine={false} tickFormatter={abreviarCLP} width={50} />
        <Tooltip content={<TooltipPersonalizado />} cursor={{ fill: "hsl(210 40% 96%)" }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="asignado" name="Presupuesto" fill="#94a3b8" radius={[6, 6, 0, 0]} maxBarSize={40} />
        <Bar dataKey="gastado" name="Gasto real" fill="#1d4ed8" radius={[6, 6, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Distribución de gasto por categoría (dona). */
export function DistribucionCategoriaChart({
  data,
}: {
  data: { categoria: string; monto: number }[];
}) {
  if (data.length === 0) {
    return <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">Sin datos.</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          dataKey="monto"
          nameKey="categoria"
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PALETA[i % PALETA.length]} />
          ))}
        </Pie>
        <Tooltip content={<TooltipPersonalizado />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
