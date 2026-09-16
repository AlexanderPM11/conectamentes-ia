# Progreso de implementación — ConectaMentes IA

| Spec | Área | Estado | Última verificación |
|---|---|---|---|
| 00 | Base técnica y PWA | completado | Backend/frontend/diagrama verificados |
| 01 | Autenticación | completado | 3 pruebas + build frontend + diagrama |
| 02 | Perfil de aprendizaje | implementado | Backend + PWA + diagrama |
| 03 | Solicitudes de apoyo | implementado | Backend + PWA + diagrama |
| 04 | Coincidencias inteligentes | implementado | Reglas explicables + endpoint + diagrama |
| 05 | Agenda y sesiones | implementado | Aceptación doble + guía + diagrama |
| 06 | Valoraciones y reconocimiento | implementado | Reputación agregada + insignia + diagrama |
| 07 | Panel institucional | implementado | Umbral mínimo + endpoints protegidos + diagrama |
| 08 | Seguridad y moderación | implementado | Bloqueos + reportes humanos + diagrama |

## Registro

- 2026-09-15: Se completó la base técnica y el flujo de autenticación.
- 2026-09-15: Se implementaron los specs 02–08 sobre el dominio compartido, se conectó la PWA y se generaron los diagramas restantes.
- 2026-09-15: Se reemplazó SQLite por MySQL 8.4 y se validó el stack completo con Docker Compose, incluyendo health check de MySQL y respuestas HTTP de la API/PWA.
- 2026-09-15: Se reconstruyó el sistema visual completo para móvil y escritorio: portada centrada, autenticación adaptativa, navegación móvil/desktop, pantallas funcionales enriquecidas e integración de recursos isométricos.
- 2026-09-15: Se recorrió la experiencia autenticada con un usuario QA; se corrigió la recarga de datos, se añadieron métricas reales, conexiones y sesiones consultables, una Agenda sin identificadores técnicos y reportes vinculados a compañeros visibles.
- 2026-09-15: Se corrigió el caché PWA para no almacenar respuestas privadas de la API y se restringió el panel institucional a roles de coordinación o moderación.
- 2026-09-15: Se añadió detección automática de nuevas versiones PWA con aviso visible y botón “Actualizar ahora”, conservando la activación bajo control del usuario.
# Actualización 15/09/2026 — conexiones y tiempo real

- [x] Notificaciones persistentes para solicitudes, aceptaciones, sesiones, mensajes y valoraciones.
- [x] Canal en tiempo real autenticado para entregar avisos y mensajes sin recargar.
- [x] Chat privado vinculado a conexiones activas, con historial en MySQL.
- [x] Centro de notificaciones adaptable a móvil y escritorio.
- [x] Navegación móvil con acceso directo a Mensajes.
- [x] Avisos opcionales del dispositivo y estado de conexión visible.
- [x] Validación integral en contenedores y creación de conexiones de demostración.

Prueba funcional: se crearon conexiones activas con Ana Torres, Lucas Rojas y Sofía Mendoza; se confirmó la llegada de mensajes y el incremento de notificaciones sin recargar la PWA.

- 2026-09-15: Se normalizaron fechas y horas al formato dominicano (`es-DO`, zona `America/Santo_Domingo`): día/mes/año, reloj de 12 horas y marcadores a. m./p. m. en agenda, chat y notificaciones.
- 2026-09-15: Se estabilizó la navegación móvil: botones, iconos y tipografía conservan dimensiones fijas; un selector independiente se desliza entre secciones sin provocar saltos visuales.
- 2026-09-15: Se agregó Descubrimiento de comunidad en Conexiones, con búsqueda por tema/persona y filtros entre quienes pueden ayudar y quienes necesitan apoyo.
- 2026-09-15: Se compactaron los encabezados de las pantallas en móvil: títulos, descripciones e iconos ocupan menos altura sin cambiar la jerarquía visual en escritorio.
- 2026-09-15: Se simplificó el flujo de Nueva solicitud con lenguaje guiado, campos más claros, una ayuda contextual y un CTA orientado a encontrar apoyo.
- 2026-09-15: Se ampliaron los tipos de apoyo en tres grupos: comprender y aprender, practicar y prepararme, y revisar mi avance; se conservaron los valores anteriores para compatibilidad.
- 2026-09-15: Se rediseñó Mensajes como una agenda de contactos: búsqueda por persona o tema, estado de conexión, avatar isométrico, conversación activa y mejor jerarquía para móvil.
- 2026-09-15: Se evolucionó la bandeja de Mensajes hacia una experiencia social moderna: carrusel de contactos recientes, anillos de estado, avatar personalizado, búsqueda y conversaciones con acentos cálidos.
- 2026-09-15: Se simplificó Mensajes a un carrusel superior de conexiones; se retiraron el listado y el buscador, y cada círculo abre directamente su conversación.
- 2026-09-15: Se redujo el carrusel de Mensajes a círculos limpios sin etiquetas; el contacto activo se identifica únicamente con un borde naranja.
- 2026-09-15: Se mejoró el interior del chat con burbujas diferenciadas, remitente y hora, fondo sutil, compositor redondeado y microanimación de entrada, manteniendo el tiempo real.
- 2026-09-15: Se fijó una altura máxima para el área de mensajes y se habilitó desplazamiento vertical independiente, especialmente ajustado al viewport móvil.
- 2026-09-15: Se rediseñó la Agenda con tarjetas de encuentros, fecha/hora destacadas, conexión asociada y acciones contextuales para editar o eliminar próximos encuentros.
- 2026-09-15: Se añadió `PUT /api/sesiones/{id}` protegido por participación y `DELETE /api/sesiones/{id}` para eliminar únicamente sesiones agendadas del usuario autorizado.
- 2026-09-15: Se reemplazó la confirmación nativa de eliminación por `ConfirmDialog`, un diálogo propio, accesible y mobile-first con Escape, cancelar y acción destructiva explícita.
- 2026-09-15: Se añadió `AGENTS.md` con reglas permanentes para prohibir diálogos nativos y exigir componentes personalizados reutilizables en todas las futuras implementaciones.
- 2026-09-15: Revisión integral: se protegió la lectura de coincidencias y los cambios de estado de sesiones, se validaron datos de agenda, se mostraron errores útiles y “Próximos encuentros” ahora excluye sesiones pasadas o cerradas.
- 2026-09-15: Se añadieron imágenes y documentos privados al chat, con validación de formato, límite de 10 MB, almacenamiento persistente en Docker y visualización adaptable a móvil.
- 2026-09-15: Se integró la creación bajo demanda de eventos de Google Calendar con enlace único de Google Meet; el usuario concede permiso incremental y el enlace se comparte automáticamente en la conversación.
- 2026-09-16: Se completó la reputación académica por tema: valoración exclusiva del receptor, prevención de duplicados, ranking ajustado por experiencia, historial de sesiones calificables y desglose visible de comentarios y dimensiones en perfil y Ranking.
2026-09-16: Revisión general completada: se corrigió la emisión de roles del JWT, se invalidan enlaces Meet al cambiar una sesión, se añadieron iconos PWA de marca en 180/192/512 px, manifiesto instalable, soporte Apple y pantalla offline; Docker conserva las claves de protección de ASP.NET.
2026-09-16: Administración superadmin implementada: root configurable por Docker/.env, estados activo/suspendido/bloqueado con motivo, login informativo para cuentas restringidas, endpoints protegidos y panel responsive de usuarios, métricas, búsqueda y filtros.
2026-09-16: Ciclo de pruebas general ejecutado: se detectó y corrigió el estado fantasma de sesión al expirar el JWT; ahora la interfaz limpia el token y vuelve al login. Backend, frontend, Docker, rutas PWA y aislamiento del panel administrativo verificados.
