# PLAN.md — Plan técnico y fases de construcción

## 1. Arquitectura propuesta

### Backend/ (ASP.NET Core 8)

```
Backend/
├── ConectaMentes.Api/            # Controllers, Program.cs, Swagger, middlewares
├── ConectaMentes.Application/    # Casos de uso, DTOs, validaciones, interfaces
├── ConectaMentes.Domain/         # Entidades, reglas de negocio, enums de estado
├── ConectaMentes.Infrastructure/ # EF Core, repositorios, motor de compatibilidad,
│                                  # integración con proveedor de IA para texto
└── ConectaMentes.Tests/          # xUnit
```

- Persistencia: EF Core con SQL Server o PostgreSQL (indistinto para el
  alcance académico; usar PostgreSQL si se busca despliegue gratuito más
  simple).
- Autenticación: JWT emitido por el propio backend (registro/login de
  `specs/01`); no depende de sistema universitario (fuera de alcance).
- El "motor de coincidencias" (spec 04) vive en `Application`/
  `Infrastructure` como un servicio propio, con reglas explícitas de
  puntaje + una llamada a un servicio de análisis de texto para interpretar
  la solicitud en lenguaje natural. Debe ser reemplazable/mejorable sin
  tocar los controllers.

### Frontend/ (React + TypeScript, PWA)

```
Frontend/
├── public/                # manifest.json, iconos, service worker
├── src/
│   ├── app/                # rutas, layout, providers
│   ├── shared/
│   │   ├── ui/             # componentes base (Dialog, Toast, Form fields)
│   │   └── hooks/
│   ├── features/
│   │   ├── auth/
│   │   ├── perfil/
│   │   ├── solicitudes/
│   │   ├── coincidencias/
│   │   ├── agenda/
│   │   ├── valoraciones/
│   │   ├── panel-institucional/
│   │   └── seguridad/
│   └── styles/              # tokens, breakpoints mobile-first
```

- CSS mobile-first con breakpoints `min-width` (móvil por defecto, luego
  tablet/escritorio).
- Componentes de formulario y diálogo construidos una vez en `shared/ui` (a
  partir de la skill de shadcn/ui) y reutilizados por todos los features,
  cumpliendo las reglas de `CONSTITUTION.md` secciones 4 y 5.

## 2. Fases y orden de implementación

Basado en el plan general del informe (sección 17) y la distribución sugerida
para tres integrantes (sección 18), pero expresado como secuencia de specs
para el agente:

| Fase | Specs | Depende de |
|---|---|---|
| 0. Base | Configurar `Backend/`, `Frontend/`, PWA shell, sistema de diseño (shadcn/ui), CI mínimo | — |
| 1. Identidad | `01-autenticacion` | Fase 0 |
| 2. Perfil | `02-perfil-aprendizaje` | 01 |
| 3. Solicitudes | `03-solicitudes-apoyo` | 02 |
| 4. Motor de coincidencias | `04-coincidencias-inteligentes` | 03 |
| 5. Conexión y agenda | `05-agenda-sesiones` | 04 |
| 6. Cierre del ciclo | `06-valoraciones-reconocimiento` | 05 |
| 7. Vista institucional | `07-panel-institucional` | 03, 06 (necesita datos agregados) |
| 8. Confianza y seguridad | `08-seguridad-moderacion` | 05 (puede iniciar en paralelo desde la fase 2 para el modelo de reportes) |
| 9. Tutor IA freemium | `09-tutor-ia` | 01 (usa autenticación; puede enriquecerse con perfil desde 02) |

Nota: 07 y 08 pueden desarrollarse en paralelo por integrantes distintos una
vez existan datos de solicitudes/sesiones, siguiendo la distribución del
informe (Integrante 1: experiencia de usuario/perfiles/solicitudes;
Integrante 2: usuarios/agenda/seguridad; Integrante 3: motor de
coincidencias/IA/panel).

## 3. Correspondencia con las etapas del informe (sección 17)

| Etapa del informe | Equivalente en este plan |
|---|---|
| 1 Inicio | `SPEC.md` (alcance) + `CONSTITUTION.md` (reglas) ya definidos |
| 2 Análisis | Historias de usuario y reglas dentro de cada `specs/0X-*.md` |
| 3 Diseño | Diagramas generados con la skill `diagram-design` antes de cada fase (ver regla en `CONSTITUTION.md` §6) + pantallas mobile-first |
| 4 Construcción | Fases 1–8 de la tabla anterior |
| 5 Pruebas | Pruebas mínimas descritas en `CONSTITUTION.md` §9, por spec |
| 6 Presentación | Documentación en `docs/diagrams/` + manual breve (entregable, fuera de este paquete de código) |

## 4. Diagramas a generar por fase (con la skill diagram-design)

- Fase 0: diagrama de **arquitectura** (Frontend PWA ↔ API ASP.NET Core ↔
  Base de datos ↔ servicio de análisis de texto).
- Fase 1: diagrama de **secuencia** de registro/login.
- Fase 2: diagrama **ER** parcial (Usuario, PerfilHabilidad, Disponibilidad).
- Fase 3: **flowchart** del ciclo de vida de una Solicitud.
- Fase 4: **flowchart** o diagrama de **swimlane** del motor de
  coincidencias (entrada: solicitud → interpretación → puntaje → explicación
  → lista de candidatos).
- Fase 5: diagrama de **secuencia** de aceptación de conexión y agenda.
- Fase 6: **state machine** de una Sesión (agendada → completada/cancelada)
  y su efecto en Valoración/Reconocimiento.
- Fase 7: diagrama de **flujo de datos** hacia el panel institucional
  (marcando qué se agrega y qué nunca se expone, para dejar visible la
  regla de privacidad).
- Fase 8: **flowchart** del ciclo de vida de un Reporte.
- Fase 9: **flowchart** del Tutor IA (mensaje → plan/límite → respuesta segura → persistencia).

Cada diagrama se guarda en `docs/diagrams/` con el nombre de la fase, por
ejemplo `docs/diagrams/04-motor-coincidencias.html`.

## 5. Definición de "hecho" por spec

Un spec de `specs/` se considera terminado cuando:

1. El diagrama correspondiente existe en `docs/diagrams/`.
2. Backend: endpoints implementados, documentados en Swagger, con pruebas
   unitarias de las reglas de negocio del spec.
3. Frontend: pantallas mobile-first implementadas y verificadas también en
   ancho de escritorio, formularios sin zoom automático, cualquier
   confirmación/alerta usando los componentes personalizados de
   `shared/ui`.
4. Los criterios de aceptación (Given/When/Then) del spec pasan
   manualmente o con prueba automatizada.
5. Resumen entregado al usuario y aprobación antes de iniciar el siguiente
   spec.
