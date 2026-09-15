# Spec 03 — Creación de solicitudes de apoyo

## Objetivo

Permitir que un estudiante publique, en palabras sencillas, el tema en el
que necesita ayuda, como disparador del motor de coincidencias.

## Historias de usuario

- Como estudiante, quiero describir con mis propias palabras el tema en el
  que necesito ayuda, sin tener que usar categorías rígidas.
- Como estudiante, quiero indicar el tipo de ayuda y mi horario disponible
  al publicar la solicitud.
- Como estudiante, quiero ver el estado de mis solicitudes (abierta, con
  coincidencias, conectada, cerrada).
- Como estudiante, quiero poder cancelar una solicitud que ya no necesito.

## Criterios de aceptación

- **Given** un estudiante con perfil mínimo completo, **when** publica una
  solicitud con tema, descripción, tipo de ayuda y horario, **then** la
  solicitud queda en estado `abierta` y disponible para el motor de
  coincidencias.
- **Given** una solicitud publicada, **when** el sistema detecta lenguaje
  que sugiere pedir que otra persona haga una tarea, examen o proyecto
  completo (regla del informe, sección 10), **then** la solicitud se marca
  para revisión y no se envía a coincidencias hasta que un moderador la
  valide, o se le pide al usuario reformularla, según se decida en
  `specs/08`.
- **Given** una solicitud sin coincidencias tras un tiempo, **when** el
  estudiante consulta su estado, **then** ve claramente que sigue abierta y
  puede editarla o cancelarla.
- **Given** el formulario de creación de solicitud en móvil, **when** el
  estudiante escribe la descripción libre, **then** el campo de texto no
  produce zoom automático y se expande cómodamente en pantallas pequeñas.

## Reglas de negocio

- Una solicitud pertenece a un único solicitante, pero puede generar
  múltiples Coincidencias (spec 04).
- Estados válidos: `abierta` → `con_coincidencias` → `conectada` → `cerrada`,
  o `cancelada` desde cualquier estado previo a `conectada`.
- No se permite solicitar ayuda para "realizar" una tarea, examen o proyecto
  completo en nombre del solicitante (ver `CONSTITUTION.md` §8); el
  formulario debe guiar hacia una descripción de aprendizaje ("quiero
  entender X"), no de entrega ("hazme X").

## Entidades y datos

- **Solicitud**: id, usuarioId, tema, descripción, tipoAyuda, horarioDeseado,
  estado, fechaCreación.

## Endpoints sugeridos

- `POST /api/solicitudes`
- `GET /api/solicitudes/mias`
- `GET /api/solicitudes/{id}`
- `PUT /api/solicitudes/{id}`
- `POST /api/solicitudes/{id}/cancelar`

## Pantallas mobile-first

1. Formulario de nueva solicitud (tema, descripción libre, tipo de ayuda,
   horario) en pasos cortos o una sola pantalla scrolleable en móvil.
2. Lista de "Mis solicitudes" con estado visible mediante etiquetas, tarjetas
   apiladas en móvil, grilla en escritorio.
3. Detalle de una solicitud con opción de editar/cancelar (confirmación con
   el `<ConfirmDialog>` personalizado, nunca `confirm()` nativo).

## Diagrama a generar

**Flowchart** del ciclo de vida de una Solicitud: abierta → con
coincidencias → conectada → cerrada, con la rama de cancelación y la rama de
revisión por contenido indebido.
