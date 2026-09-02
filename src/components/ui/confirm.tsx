"use client";

import { Modal, ModalFooter } from "./modal";
import { Button } from "./button";

export function ConfirmDialog({
  abierto,
  titulo,
  mensaje,
  textoConfirmar = "Eliminar",
  cargando,
  onConfirmar,
  onCancelar,
}: {
  abierto: boolean;
  titulo: string;
  mensaje: string;
  textoConfirmar?: string;
  cargando?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  return (
    <Modal abierto={abierto} onCerrar={onCancelar} titulo={titulo} ancho="max-w-md">
      <p className="text-sm text-muted-foreground">{mensaje}</p>
      <ModalFooter>
        <Button variante="outline" onClick={onCancelar} disabled={cargando}>
          Cancelar
        </Button>
        <Button variante="destructive" onClick={onConfirmar} cargando={cargando}>
          {textoConfirmar}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
