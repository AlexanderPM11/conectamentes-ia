# Spec 08 — Seguridad y reportes

## Objetivo

Dar a los estudiantes mecanismos para bloquear, reportar y solicitar
intervención humana, y a un moderador las herramientas para revisar esos
casos, manteniendo las decisiones sensibles bajo responsabilidad humana.

## Historias de usuario

- Como estudiante, quiero bloquear a otro usuario para no volver a recibir
  coincidencias con él.
- Como estudiante, quiero reportar una conducta indebida asociada a una
  sesión o conexión.
- Como moderador, quiero revisar reportes abiertos y decidir una resolución.
- Como estudiante, quiero poder pedir revisión humana si creo que una
  recomendación o valoración fue injusta.

## Criterios de aceptación

- **Given** un usuario bloqueado por otro, **when** el motor de
  coincidencias (spec 04) calcula candidatos, **then** el usuario bloqueado
  nunca aparece como coincidencia para quien lo bloqueó, ni viceversa.
- **Given** un estudiante que reporta una conexión o sesión, **when** envía
  el reporte con un motivo, **then** el reporte queda en estado `abierto`
  visible solo para moderadores, con notificación de recepción para el
  autor (componente propio, no `alert()`).
- **Given** un reporte abierto, **when** un moderador lo revisa, **then**
  puede pasarlo a `en_revisión` y finalmente a `resuelto` con una nota de
  resolución; estas decisiones no las toma la IA (regla del informe,
  sección 8).
- **Given** una solicitud detectada como posible intento de que otra
  persona haga una tarea/examen completo (ver `specs/03`), **when** llega a
  este flujo, **then** un moderador puede confirmarla como indebida o
  descartarla, quedando registrada la decisión humana.
- **Given** el formulario de reporte en móvil, **when** el usuario lo
  completa, **then** los campos de texto no producen zoom y el envío se
  confirma con un componente propio, no con `alert()`.

## Reglas de negocio

- Bloquear a un usuario es una acción del propio estudiante, sin necesidad
  de aprobación, y tiene efecto inmediato sobre coincidencias futuras.
- Los reportes graves los revisa siempre una persona (moderador), nunca se
  resuelven automáticamente por IA (informe, sección 10).
- El sistema debe permitir solicitar revisión humana ante una recomendación
  o valoración que el usuario considere injusta (informe, sección 13).
- Los datos de reportes se conservan solo mientras sean necesarios para su
  resolución; después se pueden anonimizar (informe, sección 13).

## Entidades y datos

- **Bloqueo**: usuarioId, usuarioBloqueadoId, fecha.
- **Reporte**: id, autorId, usuarioReportadoId, referenciaId (sesión o
  conexión), motivo, estado (`abierto`, `en_revisión`, `resuelto`),
  notaResolución, moderadorId.

## Endpoints sugeridos

- `POST /api/usuarios/{id}/bloquear`
- `DELETE /api/usuarios/{id}/bloquear`
- `POST /api/reportes`
- `GET /api/moderacion/reportes` (rol moderador)
- `PUT /api/moderacion/reportes/{id}`

## Pantallas mobile-first

1. Botón/acción de "Bloquear" y "Reportar" accesible desde el perfil de otro
   usuario y desde el detalle de una sesión/conexión.
2. Formulario de reporte con motivo y descripción.
3. Bandeja de moderación (vista de moderador) con lista de reportes y
   detalle de resolución.

## Diagrama a generar

**Flowchart** del ciclo de vida de un Reporte: creado → abierto → en
revisión (moderador humano) → resuelto, incluyendo el punto de decisión
humana explícito y la relación con el bloqueo entre usuarios.
