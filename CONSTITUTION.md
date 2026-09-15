# Constitución del proyecto — ConectaMentes IA

Estas reglas son **obligatorias** durante todo el desarrollo. Si una
instrucción futura entra en conflicto con esta constitución, la constitución
gana y el agente debe señalarlo antes de continuar.

## 1. Stack tecnológico (fijo, no se negocia)

- **Backend**: ASP.NET Core **8** (C#), en la carpeta `Backend/` en la raíz
  del repositorio.
- **Frontend**: React (TypeScript), en la carpeta `Frontend/` en la raíz del
  repositorio.
- **Tipo de aplicación**: **PWA** (Progressive Web App). El frontend debe
  incluir `manifest.json`, service worker con estrategia de caché para el
  shell de la app, iconos para instalación y soporte offline básico
  (al menos una pantalla de "sin conexión" y caché del shell).
- **Comunicación**: API REST documentada con OpenAPI/Swagger, expuesta por
  `Backend/` y consumida por `Frontend/`.

## 2. Estructura de carpetas

```
/
├── Backend/            # ASP.NET Core 8 — API, dominio, infraestructura
├── Frontend/           # React + TypeScript — PWA
├── docs/
│   └── diagrams/       # Diagramas generados spec por spec
└── specs/              # Especificaciones (este paquete SDD)
```

Dentro de `Backend/`, usar una separación por capas (ej. `Domain`,
`Application`, `Infrastructure`, `Api`) para mantener las reglas de negocio
independientes del framework web y de la base de datos.

Dentro de `Frontend/`, organizar por *feature* (una carpeta por función:
perfil, solicitudes, coincidencias, agenda, valoraciones, panel,
seguridad), no por tipo de archivo.

## 3. Enfoque mobile-first (regla de proceso, no solo de CSS)

- Toda pantalla o componente nuevo se diseña, se maqueta y se implementa
  **primero para el viewport móvil** (≈360–414px de ancho). Solo después de
  que la versión móvil funciona y fue revisada, se adapta a tablet/escritorio
  añadiendo *breakpoints* hacia arriba (`min-width`), nunca al revés.
- No se aprueba ningún flujo como "terminado" si únicamente existe su
  versión de escritorio.
- Los componentes deben ser totalmente adaptables (responsive) usando CSS
  con enfoque *mobile-first* (media queries `min-width`, unidades relativas,
  layouts flexibles con Flexbox/Grid).
- Objetivos táctiles (botones, campos, ítems de lista) con área mínima
  cómoda para dedo (orientativo: 44×44px).

## 4. Formularios: sin zoom automático al enfocar un campo

- Ningún campo de formulario debe provocar que el navegador móvil haga zoom
  automático de la pantalla al recibir foco.
- Técnica obligatoria: todo `input`, `select` y `textarea` debe tener
  `font-size` de al menos `16px` (o el equivalente en `rem`) en móvil. Esta
  es la causa más común del zoom automático en iOS/Android y se soluciona
  sin sacrificar accesibilidad.
- **No** está permitido deshabilitar el zoom del usuario de forma global vía
  `<meta name="viewport" content="...user-scalable=no...">` o
  `maximum-scale=1`, porque eso rompe la accesibilidad para personas con baja
  visión. La regla es evitar el zoom *no deseado* al enfocar, no impedir que
  el usuario haga zoom si lo necesita.
- Verificar esta regla en cada formulario nuevo como parte de la revisión de
  cada spec (ver plantilla de specs).

## 5. Diálogos, alertas y confirmaciones: siempre personalizados

- **Prohibido** usar diálogos nativos del navegador: `alert()`, `confirm()`,
  `prompt()`, o el `<dialog>` sin estilizar del navegador.
- Todo mensaje de confirmación, error, éxito o advertencia debe implementarse
  con un componente propio de la aplicación (modal / toast / snackbar
  personalizado), consistente con el sistema de diseño del proyecto,
  accesible (rol ARIA correspondiente, manejo de foco, cierre con teclado) y
  mobile-first.
- Crear un componente base reutilizable (ej. `<ConfirmDialog>`, `<Toast>`)
  desde el primer spec que lo necesite, y reutilizarlo en el resto del
  proyecto en lugar de crear variantes sueltas.

## 6. Skills y herramientas del agente

Antes de implementar el primer spec, el agente debe instalar y dejar
disponibles estas herramientas:

1. **Skill de diseño de UI (shadcn/ui)** — para tener un sistema de
   componentes accesible y consistente como base del frontend mobile-first.
   Instalación oficial:
   ```
   npx shadcn@latest init
   npx shadcn@latest mcp init
   ```
   El agente debe usar los componentes de este sistema (formularios,
   diálogos, toggles) como base y personalizarlos según la identidad visual
   que se defina para ConectaMentes IA, respetando siempre las reglas de
   formularios y diálogos de las secciones 4 y 5.

2. **Skill de diagramas editoriales (diagram-design)** — para documentar
   arquitectura y flujos a medida que se implementan los specs. Instalación
   (Claude Code):
   ```
   /plugin marketplace add cathrynlavery/diagram-design
   /plugin install diagram-design@diagram-design
   ```
   Regla de uso: **antes** de implementar cada spec de `specs/`, generar el
   diagrama indicado en ese spec (flujo, secuencia o modelo de datos) y
   guardarlo en `docs/diagrams/`. Esto sirve como verificación de que el
   flujo se entendió antes de programarlo, y como documentación del proyecto
   para la sustentación académica.

Si el entorno del agente no soporta plugins/MCP, el agente debe avisarlo
explícitamente y proponer una alternativa equivalente antes de continuar.

## 7. Metodología: Spec-Driven Development

- No se escribe código de un flujo sin haber leído su archivo en `specs/`.
- Cada spec se implementa de punta a punta (backend + frontend + prueba
  mínima) antes de pasar al siguiente, siguiendo el orden numérico de
  `specs/` y las dependencias descritas en `PLAN.md`.
- Si al implementar un spec se descubre una ambigüedad o un caso no
  contemplado, el agente debe señalarlo explícitamente y proponer una
  interpretación razonable citando la regla de negocio afectada, en lugar de
  asumir en silencio.
- Cambios de alcance (agregar o quitar funcionalidad) se reflejan primero en
  el archivo de spec correspondiente, y solo después en el código.

## 8. Reglas de producto que aplican a todo el sistema

Tomadas del informe del proyecto (sección 10, "Reglas básicas del
proyecto") y aplicables transversalmente:

- Toda conexión entre dos estudiantes requiere aceptación de **ambas**
  partes; nunca se agenda una sesión de forma unilateral.
- Un estudiante puede ocultar información personal no indispensable para la
  conexión; el modelo de datos y las pantallas de perfil deben permitir
  campos opcionales/ocultables (ver `specs/02-perfil-aprendizaje.md`).
- No se debe permitir, ni facilitar mediante la IA, solicitudes para que
  otra persona realice tareas, exámenes o proyectos completos.
- Las valoraciones deben referirse a la experiencia académica, nunca a
  características personales.
- Rechazar una recomendación no debe tener penalización visible para el
  usuario que rechaza.
- La aplicación debe poder explicar en lenguaje simple por qué recomienda
  cada coincidencia (ver `specs/04-coincidencias-inteligentes.md`).
- La IA no asigna calificaciones académicas, no diagnostica condiciones
  personales y no decide sanciones; esas decisiones quedan bajo
  responsabilidad humana (moderador).
- Privacidad: recolectar solo los datos mínimos declarados por el propio
  usuario (ver `specs/02-perfil-aprendizaje.md` y sección 12–13 del informe).
  Para el prototipo académico se usan perfiles simulados, no datos reales de
  una universidad.

## 9. Calidad mínima esperada

- Backend: pruebas unitarias mínimas sobre las reglas de negocio críticas de
  cada spec (con xUnit).
- Frontend: pruebas de componente mínimas para formularios y flujos críticos
  (con Vitest + Testing Library).
- Todo endpoint nuevo se documenta en OpenAPI/Swagger antes de darse por
  terminado.
