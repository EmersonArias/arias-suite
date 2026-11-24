const SHORT_LABELS: Record<string, string> = {
  'nuevo': 'Nuevo',
  'crear': 'Nuevo',
  'añadir': 'Añadir',
  'agregar': 'Añadir',
  'modificar': 'Editar',
  'editar': 'Editar',
  'actualizar': 'Actualizar',
  'refrescar': 'Actualizar',
  'desactivar': 'Baja',
  'eliminar': 'Baja',
  'borrar': 'Baja',
  'activar': 'Activar',
  'mantenimientos': 'Mantto.',
  'mantenimiento': 'Mantto.',
  'mantto.': 'Mantto.',
  'pdf': 'PDF',
  'imprimir': 'PDF',
  'volver': 'Volver',
  'inicio': 'Inicio',
  'guardar': 'Guardar',
  'cancelar': 'Cancelar',
  'buscar': 'Buscar',
  'filtrar': 'Filtrar',
  'limpiar': 'Limpiar',
  'fotos': 'Fotos',
  'foto': 'Fotos',
  'imagen': 'Imagen',
  'descargar': 'Descarga',
  'exportar': 'Exportar',
  'importar': 'Importar',
  'cerrar': 'Cerrar',
  'configuración': 'Config.',
  'configurar': 'Config.',
  'planificación': 'Planif.',
  'planificar': 'Planif.',
  'asignar': 'Asignar',
  'ver': 'Ver',
  'abrir': 'Abrir',
  'historial': 'Historial',
  'registro': 'Registro',
  'reporte': 'Reporte',
  'seleccionar': 'Elegir',
  'siguiente': 'Siguiente',
  'anterior': 'Anterior',
  'confirmar': 'Confirmar',
  'reintentar': 'Reintentar',
  'adjuntar': 'Adjuntar',
  'incidencia': 'Incid.',
  'salir': 'Salir',
  'perfil': 'Perfil',
  'aceptar': 'Aceptar',
  'rechazar': 'Rechazar',
  'enviar': 'Enviar',
  'duplicar': 'Duplicar',
  'copiar': 'Copiar',
  'restaurar': 'Restaurar',
}

export function getActionCaption(label: string): string {
  const normalized = label.trim().replace(/\s+/g, ' ')
  const lower = normalized.toLocaleLowerCase('es')
  if (SHORT_LABELS[lower]) return SHORT_LABELS[lower]

  const first = normalized.split(/[\s(–—-]+/)[0] ?? normalized
  if (SHORT_LABELS[first.toLocaleLowerCase('es')]) {
    return SHORT_LABELS[first.toLocaleLowerCase('es')]
  }
  return first.length > 9 ? `${first.slice(0, 8)}…` : first
}
