# Spec 04 — Coincidencias inteligentes

## Objetivo

Interpretar cada solicitud, calcular compatibilidad con posibles
colaboradores y presentar una lista corta de candidatos con una explicación
comprensible de cada recomendación.

## Historias de usuario

- Como estudiante que solicita ayuda, quiero ver una lista corta de
  compañeros compatibles con una explicación de por qué se recomienda cada
  uno.
- Como estudiante, quiero poder rechazar una recomendación sin ninguna
  penalización visible.
- Como institución, no quiero que la IA asigne calificaciones ni tome
  decisiones sancionatorias (ver `CONSTITUTION.md` §8).

## Criterios de aceptación

- **Given** una solicitud en estado `abierta`, **when** el motor de
  coincidencias se ejecuta, **then** produce entre 1 y N candidatos
  ordenados por puntaje de compatibilidad, cada uno con un texto de
  explicación (ej. "Miguel domina bases de datos y tiene disponibilidad
  compatible con tu horario").
- **Given** una lista de coincidencias, **when** el solicitante rechaza una,
  **then** esa coincidencia pasa a `rechazada`, no vuelve a mostrarse para
  esa solicitud, y no se registra ninguna penalización ni marca negativa
  visible sobre el solicitante.
- **Given** una lista de coincidencias, **when** el solicitante acepta una,
  **then** se crea una `Conexión` pendiente de aceptación del colaborador
  (ver `specs/05`).
- **Given** el cálculo de compatibilidad, **when** se generan candidatos,
  **then** el puntaje considera al menos: coincidencia de tema, horario
  compatible, experiencia previa (sesiones completadas), valoración
  recibida y balance de participación (evitar que siempre se recomiende a
  los mismos colaboradores) — no solo la calificación más alta (regla del
  informe, sección 3).
- **Given** cualquier explicación generada, **when** se muestra al usuario,
  **then** el texto es breve, en lenguaje simple, sin jerga técnica del
  algoritmo.

## Reglas de negocio

- El motor de compatibilidad es un servicio propio con reglas explícitas
  (no una caja negra): tema, horario, experiencia, valoración, balance de
  participación. El componente de interpretación de lenguaje natural
  (para leer la descripción libre de la solicitud) puede apoyarse en un
  proveedor de IA externo, pero el cálculo de puntaje final y la decisión
  de qué mostrar quedan en código propio y auditable.
- La IA nunca decide una sanción, no diagnostica condiciones personales del
  estudiante y no asigna una calificación académica; esas decisiones quedan
  fuera de este spec (ver `specs/08` para moderación).
- El sistema debe evitar recomendaciones basadas en género, condición
  económica u otras características sensibles (informe, sección 13): estos
  campos, si existen en el perfil, no deben usarse como variable de
  compatibilidad.
- Rechazar una coincidencia no afecta ninguna métrica visible del
  solicitante ni del candidato rechazado.

## Entidades y datos

- **Coincidencia**: id, solicitudId, usuarioCandidatoId, puntaje,
  explicación, estado (`sugerida`, `rechazada`, `aceptada`), fechaCálculo.

## Endpoints sugeridos

- `POST /api/solicitudes/{id}/calcular-coincidencias`
- `GET /api/solicitudes/{id}/coincidencias`
- `POST /api/coincidencias/{id}/rechazar`
- `POST /api/coincidencias/{id}/aceptar`

## Pantallas mobile-first

1. Lista de coincidencias como tarjetas apilables en móvil (foto/alias,
   tema en común, explicación corta, botones "Ver perfil", "Aceptar",
   "Rechazar").
2. Vista de detalle de un candidato antes de aceptar.
3. Estado vacío ("aún no hay coincidencias") con mensaje claro, sin usar
   diálogos nativos.

## Diagrama a generar

**Flowchart** o diagrama de **swimlane** del motor de coincidencias:
Solicitud → interpretación del texto → filtrado por tema/horario → cálculo
de puntaje (tema, horario, experiencia, valoración, balance) → generación de
explicación → lista ordenada de candidatos.
