# Spec 05 — Aceptación de conexión y agenda de sesiones

## Objetivo

Una vez que ambas partes aceptan una coincidencia, coordinar una sesión
breve con fecha, modalidad, duración y una guía sencilla para mantenerla
enfocada.

## Historias de usuario

- Como colaborador, quiero aceptar o rechazar una solicitud de conexión que
  me llega.
- Como par conectado, quiero acordar fecha, modalidad y duración de la
  sesión.
- Como par conectado, quiero recibir una guía breve (objetivo, pasos,
  comprobación final) para la sesión.
- Como estudiante, quiero recordatorios de mis sesiones agendadas.
- Como participante de una sesión virtual, quiero crear un Google Meet y
  compartirlo automáticamente con mi compañero.

## Criterios de aceptación

- **Given** una Coincidencia aceptada por el solicitante, **when** se
  notifica al candidato, **then** este puede aceptar o rechazar la
  conexión; solo si **ambos** aceptan se crea la `Conexión` activa (regla
  del informe, sección 10: toda conexión requiere aceptación de ambas
  personas).
- **Given** una Conexión activa, **when** cualquiera de los dos propone
  fecha/modalidad/duración, **then** el otro debe confirmarlas antes de que
  la `Sesión` quede en estado `agendada`.
- **Given** una Sesión agendada, **when** se acerca la fecha, **then** el
  sistema genera una guía sugerida (objetivo, ejercicio inicial,
  comprobación final) visible para ambos participantes.
- **Given** una Sesión agendada, **when** uno de los participantes necesita
  cancelar, **then** debe confirmarlo con el diálogo personalizado
  (`<ConfirmDialog>`) y el otro participante es notificado.
- **Given** el formulario de agenda en móvil (selector de fecha/hora),
  **when** el usuario interactúa con él, **then** no se produce zoom
  automático y el selector es utilizable con el pulgar.
- **Given** una Sesión virtual futura, **when** un participante autoriza
  Google Calendar y solicita una reunión, **then** se crea un evento único
  con ambos participantes y el enlace de Meet se comparte en el chat.

## Reglas de negocio

- Una Sesión no puede crearse sin una Conexión con ambas aceptaciones.
- Estados de Sesión: `agendada` → `completada` | `cancelada`.
- La guía de sesión es una sugerencia editable, no un guion obligatorio.
- La coordinación queda dentro de la app. Google Meet requiere autorización
  incremental del participante y se genera como servicio externo; la
  videollamada embebida continúa fuera de alcance (ver `SPEC.md` §2.2).
- Los mensajes permiten una imagen o documento por envío, con un máximo de
  10 MB, formatos permitidos explícitos y acceso restringido a los dos
  participantes de la conexión.

## Entidades y datos

- **Conexion**: id, solicitudId, coincidenciaId, estudianteSolicitanteId,
  estudianteColaboradorId, estado (`pendiente_colaborador`, `activa`,
  `rechazada`).
- **Sesion**: id, conexionId, fecha, duración, modalidad, objetivo, guía,
  meetUrl, googleCalendarEventId, estado.
- **AdjuntoChat**: id, mensajeId, conexionId, autorId, nombre, tipo MIME,
  tamaño, ubicación privada, fecha.

## Endpoints sugeridos

- `POST /api/conexiones/{id}/responder` (aceptar/rechazar por el
  colaborador)
- `POST /api/conexiones/{id}/sesiones`
- `PUT /api/sesiones/{id}`
- `POST /api/sesiones/{id}/cancelar`
- `POST /api/sesiones/{id}/completar`
- `POST /api/sesiones/{id}/google-meet`
- `POST /api/conexiones/{id}/adjuntos`
- `GET /api/adjuntos/{id}`

## Pantallas mobile-first

1. Bandeja de "Conexiones pendientes" para el colaborador (aceptar/rechazar).
2. Formulario de propuesta/confirmación de fecha, modalidad y duración.
3. Vista de "Mis sesiones" (próximas/pasadas) con la guía visible.
4. Confirmación de cancelación con el diálogo personalizado.
5. Adjuntos dentro del chat y acción de Google Meet en sesiones virtuales.

## Diagrama a generar

Diagrama de **secuencia**: Solicitante, Colaborador y Sistema, desde la
aceptación de la coincidencia hasta la Sesión agendada, incluyendo el camino
de rechazo del colaborador.
