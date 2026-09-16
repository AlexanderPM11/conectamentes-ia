# Spec 06 — Valoración de la sesión y reconocimiento

## Objetivo

Cerrar el ciclo de una sesión registrando si fue útil, para mejorar
recomendaciones futuras y reconocer la contribución del colaborador sin
convertir el apoyo en competencia.

## Historias de usuario

- Como participante de una sesión, quiero indicar si el objetivo se logró y
  qué necesita seguimiento.
- Como colaborador, quiero recibir reconocimiento por mi aporte académico.
- Como colaborador, quiero consultar mi reputación general y las valoraciones
  recibidas en cada tema que he impartido.
- Como estudiante que busca apoyo, quiero consultar un ranking orientativo
  por tema antes de elegir con quién conectar.
- Como estudiante, quiero que mi valoración se enfoque en la experiencia
  académica, no en juzgar a la persona.

## Criterios de aceptación

- **Given** una Sesión marcada como `completada`, **when** cada participante
  entra a valorarla, **then** puede calificar utilidad, respeto,
  cumplimiento y claridad, más un comentario libre opcional.
- **Given** un comentario libre de valoración, **when** contiene lenguaje
  sobre características personales en vez de la experiencia académica
  (regla del informe, sección 10), **then** el formulario advierte al
  usuario antes de enviarlo (validación de guía, no censura automática
  estricta en el MVP) usando el componente de mensaje personalizado.
- **Given** suficientes valoraciones positivas de un colaborador, **when**
  se cumplen los criterios definidos (ej. cantidad de sesiones completadas y
  promedio de valoración), **then** se le otorga un `Reconocimiento`
  (insignia o constancia) visible en su perfil.
- **Given** una valoración registrada, **when** el motor de coincidencias
  vuelve a ejecutarse (spec 04), **then** esa valoración influye en el
  puntaje de compatibilidad futuro del colaborador evaluado.
- **Given** una sesión completada, **when** quien solicitó el apoyo intenta
  valorarla, **then** puede hacerlo una sola vez y la valoración se asigna
  al colaborador que impartió la orientación.
- **Given** varias valoraciones recibidas, **when** se consulta la reputación
  de un colaborador, **then** se muestra el promedio general, las cuatro
  dimensiones, el desglose por tema y los comentarios académicos recientes.
- **Given** el ranking de colaboradores, **when** se ordenan los resultados,
  **then** se ajusta el promedio por el número de valoraciones para evitar
  que una única puntuación alta produzca una posición engañosa.
- **Given** el formulario de valoración en móvil, **when** el usuario
  califica con estrellas/escalas, **then** los controles son táctiles
  (sin depender de precisión de mouse) y no accionan zoom.

## Reglas de negocio

- La reputación de un colaborador no depende solo de una calificación
  promedio ("estrellas"); debe combinar cumplimiento, claridad y
  constancia (informe, sección 10).
- Las valoraciones deben referirse a la experiencia académica, no a
  características personales del compañero.
- El ranking es orientativo y académico: sirve para elegir apoyo, no muestra
  notas negativas, no aplica sanciones y nunca reemplaza la compatibilidad
  de tema, horario o modalidad.
- Solo el estudiante solicitante que recibió la orientación puede calificar
  al colaborador, una vez por sesión completada.

## Entidades y datos

- **Valoracion**: id, sesionId, autorId, utilidad, respeto, cumplimiento,
  claridad, comentario, fecha.
- **Reconocimiento**: id, usuarioId, tipo, criterioOrigen, fechaOtorgado.

## Endpoints sugeridos

- `POST /api/sesiones/{id}/valoraciones`
- `GET /api/usuarios/{id}/reconocimientos`
- `GET /api/usuarios/{id}/reputacion` (resumen agregado, no solo promedio)
- `GET /api/ranking?tema={texto}` (clasificación ajustada por tema)

## Pantallas mobile-first

1. Formulario de valoración post-sesión (escalas simples, comentario
   opcional).
2. Vista de perfil con reconocimientos/insignias obtenidas.
3. Mensaje de agradecimiento/confirmación tras enviar la valoración
   (componente propio, no `alert()`).
4. Ranking filtrable por tema y bloque de reputación dentro del perfil.

## Diagrama a generar

Diagrama de **estados** (state machine) de una Sesión y su efecto en
Valoración/Reconocimiento: `agendada` → `completada` → `valorada` →
(condicional) `reconocimiento otorgado`; rama `cancelada` sin valoración.
