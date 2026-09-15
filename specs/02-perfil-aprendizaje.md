# Spec 02 — Perfil de habilidades y necesidades

## Objetivo

Permitir que cada estudiante registre qué domina, qué necesita aprender, su
disponibilidad y su modalidad preferida, para que el motor de coincidencias
(spec 04) tenga con qué trabajar.

## Historias de usuario

- Como estudiante, quiero indicar los temas que domino y mi nivel de
  confianza, para que otros puedan encontrarme como colaborador.
- Como estudiante, quiero indicar los temas en los que necesito apoyo.
- Como estudiante, quiero definir mi disponibilidad y modalidad preferida
  (presencial/virtual).
- Como estudiante, quiero poder ocultar información personal que no sea
  necesaria para que me contacten (informe, regla de privacidad).

## Criterios de aceptación

- **Given** un usuario autenticado sin perfil completo, **when** entra por
  primera vez, **then** se le invita a completar su perfil de aprendizaje
  (no bloqueante: puede explorar la app, pero no puede publicar una
  solicitud ni aparecer como colaborador sin al menos un tema registrado).
- **Given** un estudiante editando su perfil, **when** agrega un tema que
  domina con su nivel de confianza, **then** el tema queda disponible para
  el motor de coincidencias.
- **Given** un campo de perfil marcado como no indispensable (ej. horario
  exacto, apellido completo), **when** el estudiante lo marca como oculto,
  **then** ese dato no se muestra a otros usuarios en las recomendaciones,
  aunque sí puede usarse internamente para calcular compatibilidad si aplica.
- **Given** el formulario de perfil en móvil, **when** el usuario interactúa
  con selects/inputs de temas y horarios, **then** no ocurre zoom automático
  y los controles son cómodos al tacto.

## Reglas de negocio

- Un mismo Usuario puede tener múltiples `PerfilHabilidad` de tipo
  `domina` y `necesita_apoyo` a la vez (rol doble, caso más frecuente según
  el informe).
- El nivel de confianza es autodeclarado (no verificado externamente en el
  MVP).
- La visibilidad de cada campo/registro es configurable por el propio
  usuario (`visible: bool`), y el frontend debe respetar esa bandera al
  renderizar el perfil a otros usuarios.
- No se recolectan datos que no sean necesarios para la conexión (ver
  `SPEC.md` §5 y `CONSTITUTION.md` §8): sin documentos de identidad,
  direcciones ni calificaciones oficiales.

## Entidades y datos

- **PerfilHabilidad**: usuarioId, tema, tipo (`domina` | `necesita_apoyo`),
  nivelConfianza, visible.
- **Disponibilidad**: usuarioId, franjasHorarias, modalidadPreferida.

## Endpoints sugeridos

- `GET /api/perfil`
- `PUT /api/perfil`
- `POST /api/perfil/habilidades`
- `PUT /api/perfil/habilidades/{id}`
- `DELETE /api/perfil/habilidades/{id}`
- `PUT /api/perfil/disponibilidad`

## Pantallas mobile-first

1. Vista de "Mi perfil" con resumen de temas que domina/necesita.
2. Formulario para agregar/editar un tema (tipo, nivel de confianza,
   visibilidad) — pensar como hoja/`sheet` inferior en móvil, modal en
   escritorio, ambos con el componente de diálogo personalizado.
3. Formulario de disponibilidad y modalidad preferida.

## Diagrama a generar

Diagrama **ER** parcial: Usuario 1—N PerfilHabilidad, Usuario 1—1
Disponibilidad.
