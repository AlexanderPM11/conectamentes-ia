# SPEC 09 — Tutor IA Free/Premium

## Objetivo

Agregar una sección de tutoría personalizada que ayude a comprender temas,
practicar y organizar el estudio. El tutor no realiza tareas, exámenes ni
proyectos completos por el estudiante.

## Alcance inicial

- Conversaciones persistentes por materia.
- Respuestas paso a paso y modos rápidos de explicación/práctica.
- Plan Free: 15 mensajes por periodo de 30 días.
- Plan Premium: 2.000 mensajes por periodo de 30 días y acceso a planes de
  estudio, cuestionarios y contexto ampliado.
- Prueba Premium de 7 días por usuario.
- Historial y contador de uso.
- Respuesta segura cuando se detecte una solicitud académicamente indebida.
- Proveedor de IA intercambiable y fallback local para desarrollo.
- Router inteligente de modelos: JEV clasifica la petición y selecciona uno de
  los modelos configurados según complejidad, contexto, latencia y costo.

## Fuera de alcance de este spec

- Cobro real con tarjeta: se deja la frontera de suscripción y el trial listo;
  la integración del proveedor de pagos requiere credenciales y webhook.
- Subida de documentos y OCR.
- Voz o videollamada.

## Entidades

- `TutorConversation`: usuario, materia, título y fechas de actividad.
- `TutorMessage`: conversación, rol, contenido, modo, estado de seguridad y
  fecha.
- `TutorUsage`: mensajes consumidos por periodo.
- `Subscription`: plan, estado, proveedor y fechas de vigencia.

## Reglas de negocio

1. Solo un usuario autenticado puede consultar sus conversaciones.
2. El límite se valida en backend antes de llamar al proveedor de IA.
3. El mensaje del estudiante se almacena solo después de superar la validación.
4. Las respuestas deben promover comprensión y no entregar soluciones para
   copiar o presentar como propias.
5. La cancelación y el inicio de prueba deben mostrar feedback propio de la
   aplicación; nunca usar diálogos nativos.
6. El sistema no expone conversaciones privadas al panel institucional.

## Criterios de aceptación

- Given un estudiante autenticado, when abre Tutor IA, then ve su uso,
  historial y una acción para iniciar conversación.
- Given una conversación válida, when envía un mensaje, then recibe una
  respuesta del tutor y ambos mensajes quedan persistidos.
- Given que alcanza el límite Free, when intenta enviar otro mensaje, then
  recibe un mensaje claro y una opción de activar la prueba Premium.
- Given una solicitud de resolver un examen o tarea completa, when el tutor la
  detecta, then responde con una guía de aprendizaje segura.
- Given una prueba Premium activa, when el estudiante consulta su uso, then el
  backend aplica el límite Premium y muestra la fecha de vencimiento.
