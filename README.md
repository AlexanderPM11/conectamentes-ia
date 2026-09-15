# ConectaMentes IA — Paquete de Spec-Driven Development (SDD)

Este paquete convierte el informe del proyecto "ConectaMentes IA" en artefactos
listos para **Spec-Driven Development**: primero se fija la especificación y
las reglas, y solo después se genera código. El agente de IA que desarrolle
la aplicación debe leer estos archivos **en este orden** antes de escribir la
primera línea de código:

1. `CONSTITUTION.md` — reglas no negociables del proyecto (stack, estructura
   de carpetas, mobile-first, formularios, diálogos, skills a instalar).
2. `SPEC.md` — especificación maestra: alcance delimitado del MVP, entidades
   de datos y glosario. Es la fuente de verdad del "qué".
3. `PLAN.md` — plan técnico y secuencia de fases (el "cómo" y en qué orden).
4. `specs/0X-*.md` — una especificación por flujo/función, en el orden en que
   deben implementarse. Cada una es autocontenida: historias de usuario,
   criterios de aceptación, reglas de negocio, entidades y endpoints.

## Prompt de arranque para el agente

Copia y pega esto como primer mensaje al agente (Claude Code, Cursor, etc.)
en la raíz del repositorio, junto con estos archivos:

> Vas a construir "ConectaMentes IA" siguiendo Spec-Driven Development.
> Lee primero `CONSTITUTION.md` completo y trátalo como reglas obligatorias
> durante todo el proyecto, sin excepción. Luego lee `SPEC.md` y `PLAN.md`
> para entender el alcance y el orden de fases. No generes código todavía.
>
> Instala primero las skills/plugins indicados en la sección "Skills y
> herramientas del agente" de `CONSTITUTION.md`.
>
> Después, procesa los archivos de `specs/` **uno a la vez, en orden
> numérico**. Para cada uno: (1) confírmame que entendiste el spec y resume
> los criterios de aceptación, (2) genera el diagrama correspondiente con la
> skill de diagramas antes de programar, (3) implementa backend y frontend
> para ese flujo respetando `CONSTITUTION.md`, (4) escribe pruebas mínimas,
> (5) muéstrame un resumen de archivos creados/modificados y espera mi
> aprobación antes de pasar al siguiente spec.
>
> No mezcles specs entre sí ni adelantes funcionalidad de una fase futura.

## Estructura de este paquete

```
CONSTITUTION.md          Reglas globales del proyecto
SPEC.md                  Especificación maestra (alcance, entidades, glosario)
PLAN.md                  Plan técnico y fases de construcción
specs/
  01-autenticacion.md
  02-perfil-aprendizaje.md
  03-solicitudes-apoyo.md
  04-coincidencias-inteligentes.md
  05-agenda-sesiones.md
  06-valoraciones-reconocimiento.md
  07-panel-institucional.md
  08-seguridad-moderacion.md
```

Cada spec de `specs/` sigue la misma plantilla para que el agente los procese
de forma consistente: Objetivo → Historias de usuario → Criterios de
aceptación (Given/When/Then) → Reglas de negocio → Entidades y datos →
Endpoints sugeridos → Pantallas mobile-first → Diagrama a generar.

## Ejecución con Docker

1. Copia .env.example como .env y ajusta los secretos.
2. Ejecuta docker compose up --build.
3. Abre http://localhost:3000; la API queda disponible en
   http://localhost:8080 y Swagger en /swagger.

El compose levanta MySQL, espera su health check y luego inicia la API y la
PWA. Las variables de .env se mapean al contenedor de backend y VITE_API_URL
se inyecta durante el build del frontend.

Por defecto, MySQL se publica en el puerto local 3307 para evitar conflictos
con instalaciones locales que ya usen 3306; dentro de Docker sigue disponible
en mysql:3306.
