# Spec 07 — Panel institucional básico

## Objetivo

Dar visibilidad agregada a la institución/coordinación sobre temas con alta
demanda de apoyo, sin exponer conversaciones ni datos personales.

## Historias de usuario

- Como coordinador, quiero ver qué temas concentran más solicitudes de
  ayuda.
- Como coordinador, quiero identificar demanda no atendida (solicitudes sin
  coincidencias aceptadas).
- Como coordinador, quiero ver participación general (cuántos estudiantes
  actúan como aprendices y como colaboradores), sin ver quién solicitó qué.

## Criterios de aceptación

- **Given** un usuario con rol `coordinador`, **when** entra al panel,
  **then** ve estadísticas agregadas por tema/periodo, nunca solicitudes o
  valoraciones individuales identificables.
- **Given** los datos agregados, **when** un tema tiene muy pocas
  solicitudes (por debajo de un umbral mínimo, ej. 5), **then** ese tema no
  se desagrega solo para evitar poder inferir de quién se trata
  (protección de privacidad por agregación mínima).
- **Given** el panel institucional, **when** se consulta demanda no
  atendida, **then** se muestra como conteo por tema, no como lista de
  estudiantes.
- **Given** el panel en móvil, **when** se visualizan gráficos/tablas,
  **then** el layout se adapta (scroll horizontal controlado o tarjetas
  apiladas), manteniendo mobile-first.

## Reglas de negocio

- El panel institucional nunca muestra conversaciones privadas ni datos que
  permitan identificar a un estudiante específico (informe, secciones 4.2 y
  13).
- Toda métrica se calcula sobre datos agregados con un umbral mínimo de
  muestra por categoría.
- El acceso a este panel está restringido al rol `coordinador`/`moderador`
  institucional (control de autorización explícito).

## Entidades y datos

- **TendenciaInstitucional** (vista agregada, no tabla con datos
  personales): tema, cantidad de solicitudes, porcentaje con coincidencia
  exitosa, participación general (aprendices vs. colaboradores), periodo.

## Endpoints sugeridos

- `GET /api/panel/temas-mas-solicitados`
- `GET /api/panel/demanda-no-atendida`
- `GET /api/panel/participacion-general`

Todos estos endpoints requieren rol `coordinador` o `moderador` y devuelven
únicamente datos agregados.

## Pantallas mobile-first

1. Resumen con tarjetas de métricas clave (temas top, % de demanda
   atendida).
2. Vista de detalle por tema con conteos, sin nombres de estudiantes.
3. Filtro por periodo académico.

## Diagrama a generar

Diagrama de **flujo de datos**: Solicitudes/Sesiones/Valoraciones →
proceso de agregación con umbral mínimo → `TendenciaInstitucional` → Panel.
El diagrama debe marcar explícitamente qué datos **no** cruzan hacia el
panel (conversaciones, identidad del solicitante).
