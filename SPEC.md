# SPEC.md — Especificación maestra: ConectaMentes IA

## 1. Resumen del producto

ConectaMentes IA conecta estudiantes universitarios que necesitan apoyo en
un tema con compañeros que dominan ese tema, usando IA para interpretar la
solicitud, calcular compatibilidad y explicar por qué se recomienda cada
coincidencia. El sistema coordina una sesión breve de ayuda y registra una
valoración que retroalimenta futuras recomendaciones. La IA no sustituye al
docente, no resuelve tareas y no toma decisiones sancionatorias.

## 2. Alcance delimitado del MVP (fuente: informe, sección 11)

### 2.1 Incluido en esta versión (lo que el agente debe construir)

| # | Función | Spec relacionado |
|---|---|---|
| 1 | Registro e inicio de sesión | `specs/01-autenticacion.md` |
| 2 | Perfil de habilidades y necesidades | `specs/02-perfil-aprendizaje.md` |
| 3 | Creación de solicitudes de apoyo | `specs/03-solicitudes-apoyo.md` |
| 4 | Recomendación de compañeros (coincidencias) | `specs/04-coincidencias-inteligentes.md` |
| 5 | Aceptación de conexión y agenda básica | `specs/05-agenda-sesiones.md` |
| 6 | Valoración de la sesión y reconocimiento | `specs/06-valoraciones-reconocimiento.md` |
| 7 | Panel administrativo/institucional básico | `specs/07-panel-institucional.md` |
| 8 | Seguridad, bloqueo y reportes | `specs/08-seguridad-moderacion.md` |

### 2.2 Explícitamente fuera de alcance (no construir en esta versión)

- Integración automática con el sistema universitario.
- Videollamadas embebidas dentro de la plataforma. La sesión ocurre fuera
  de la app; para encuentros virtuales se puede crear un evento externo de
  Google Calendar con enlace único de Google Meet y compartirlo en el chat.
- Reconocimiento académico oficial o créditos.
- Conexiones entre varias universidades.
- Aplicación móvil nativa (el requisito mobile-first se cumple con la PWA).
- Modelo predictivo avanzado de recomendación con grandes volúmenes de
  datos; el MVP usa reglas de compatibilidad + análisis de texto simple.
- Mercado de tutorías pagadas.

Si el agente detecta que una tarea propuesta cae en esta lista, debe
detenerse y confirmar antes de implementarla.

## 3. Roles de usuario (fuente: informe, sección 5)

- **Estudiante**: puede solicitar ayuda y ofrecer ayuda (rol doble es el
  caso más frecuente y debe ser el modelo de datos por defecto, no dos
  tipos de cuenta distintos).
- **Moderador académico**: atiende reportes y gestiona situaciones que
  requieren intervención humana.
- **Coordinador/Institución**: consulta tendencias agregadas (panel
  institucional), sin acceso a conversaciones privadas.

## 4. Glosario

- **Perfil de aprendizaje**: conjunto de temas que un estudiante domina,
  temas en los que necesita apoyo, disponibilidad, modalidad preferida y
  nivel de confianza declarado.
- **Solicitud**: petición de ayuda publicada por un estudiante sobre un tema
  específico.
- **Coincidencia**: candidato recomendado por el motor de compatibilidad
  para una solicitud, junto con la explicación de por qué se recomienda.
- **Conexión**: vínculo aceptado por ambas partes a partir de una
  coincidencia.
- **Sesión**: encuentro breve (presencial o virtual) acordado dentro de una
  conexión, con objetivo, duración y guía sugerida.
- **Valoración**: evaluación registrada por ambos participantes al terminar
  una sesión (utilidad, respeto, cumplimiento, claridad).
- **Reporte**: señalización de una conducta indebida, revisada por un
  moderador.

## 5. Modelo de datos (entidades principales)

Este modelo es la referencia para todos los specs; cada spec detalla solo
los campos que introduce o modifica.

- **Usuario**: id, nombre/alias, carrera, periodo académico, preferencias de
  privacidad, preferencias de comunicación, rol(es).
- **PerfilHabilidad**: usuarioId, tema, tipo (`domina` | `necesita_apoyo`),
  nivel de confianza declarado, visible (bool, para permitir ocultar
  información no indispensable).
- **Disponibilidad**: usuarioId, franjas horarias, modalidad preferida
  (presencial/virtual/ambas).
- **Solicitud**: id, usuarioId (solicitante), tema, descripción libre, tipo
  de ayuda, horario deseado, estado (`abierta`, `con_coincidencias`,
  `conectada`, `cerrada`, `cancelada`).
- **Coincidencia**: id, solicitudId, usuarioCandidatoId, puntaje de
  compatibilidad, explicación generada, estado (`sugerida`, `rechazada`,
  `aceptada`).
- **Conexion**: id, solicitudId, coincidenciaId, estudianteSolicitanteId,
  estudianteColaboradorId, estado.
- **Sesion**: id, conexionId, fecha, duración, modalidad, objetivo, guía
  (pasos sugeridos, comprobación final), estado (`agendada`, `completada`,
  `cancelada`).
- **Valoracion**: id, sesionId, autorId, utilidad, respeto, cumplimiento,
  claridad, comentario libre (moderado: no debe referirse a características
  personales, ver `specs/06`).
- **Reconocimiento**: usuarioId, tipo (insignia/constancia), origen
  (sesión/valoraciones asociadas).
- **Reporte**: id, autorId, usuarioReportadoId, referenciaId (sesión o
  conexión), motivo, estado (`abierto`, `en_revisión`, `resuelto`).
- **TendenciaInstitucional** (vista agregada, sin datos personales): tema,
  cantidad de solicitudes, demanda no atendida, participación general.

## 6. Requisitos no funcionales clave

- Mobile-first y PWA instalable (ver `CONSTITUTION.md` secciones 1 y 3).
- Sin diálogos nativos del navegador; sin zoom automático en formularios
  (ver `CONSTITUTION.md` secciones 4 y 5).
- Privacidad por diseño: mínima recolección de datos, consentimiento antes
  de exponer un perfil, estadísticas institucionales solo agregadas (ver
  informe, sección 13, y `specs/07`, `specs/08`).
- Explicabilidad: toda coincidencia debe venir con una razón legible para
  el usuario (ver `specs/04`).
