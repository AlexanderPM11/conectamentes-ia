# Dirección arquitectónica de ConectaMentes IA

## Decisión

Mantener el backend como **Clean Architecture** dentro de un monolito modular y evolucionar el frontend hacia una organización **por funcionalidades**. No se recomienda separar servicios ni introducir DDD completo todavía: el producto necesita límites más claros y pruebas antes de asumir el coste operativo de microservicios o de una modelación de dominio más pesada.

## Evidencia del proyecto

- El backend ya tiene los cuatro límites principales: `Domain`, `Application`, `Infrastructure` y `Api`.
- El dominio incluye varios flujos conectados: autenticación, solicitudes, coincidencias, conexiones, chat, sesiones, reputación, moderación y administración.
- La aplicación integra EF Core, SignalR, Google Calendar, notificaciones push y almacenamiento de archivos; por eso conviene mantener infraestructura reemplazable detrás de Application.
- El frontend concentra actualmente la aplicación completa en `Frontend/src/main.tsx`, lo que dificulta localizar cambios y aislar pruebas.
- Los problemas recientes del chat móvil muestran que la UI necesita límites de feature y componentes de pantalla independientes, especialmente para el flujo de chat.

## Estado objetivo

```text
Frontend/src/
├── app/                 # composición de la aplicación y navegación
├── components/          # componentes visuales reutilizables
├── features/
│   ├── auth/
│   ├── chat/
│   ├── connections/
│   ├── profile/
│   └── requests/
├── shared/
│   ├── api/             # cliente HTTP y contratos de transporte
│   ├── config/
│   ├── hooks/
│   ├── lib/
│   └── types/
└── main.tsx             # punto de entrada, sin lógica de negocio nueva

Backend/
├── ConectaMentes.Domain/         # entidades y reglas de negocio
├── ConectaMentes.Application/    # casos de uso y contratos
├── ConectaMentes.Infrastructure/ # EF, proveedores y adaptadores
└── ConectaMentes.Api/            # composición y endpoints delgados
    └── Endpoints/                # grupos de endpoints por capacidad
```

## Reglas de dependencia

1. `Domain` no conoce ASP.NET, EF Core ni proveedores externos.
2. `Application` define casos de uso y contratos; no accede directamente a HTTP.
3. `Infrastructure` implementa contratos de `Application` y contiene persistencia/integraciones.
4. `Api` autentica, valida el transporte, llama casos de uso y traduce resultados HTTP.
5. En React, `shared` no importa features; una feature no importa otra feature directamente.
6. Los datos remotos deben vivir en una capa de acceso a datos/cache, no en un store global de UI.

## Migración incremental

1. Separar clientes compartidos y contratos de transporte. Esta primera etapa extrae el cliente HTTP del componente raíz.
2. Agrupar endpoints del backend por capacidad (`System`, `Auth`, `Chat`, `Connections`, etc.) sin cambiar rutas públicas.
3. Extraer `features/chat` como primera feature vertical, conservando el flujo móvil ya corregido.
4. Extraer casos de uso de `Program.cs` hacia Application, empezando por chat y conexiones.
5. Añadir pruebas de integración de cada capacidad y pruebas visuales de chat en viewport móvil con teclado.
6. Solo después evaluar React Router/query-cache y una división más profunda de módulos.

## Criterio de aceptación

Cada paso debe conservar las rutas de API y el comportamiento visible existente, compilar frontend/backend y añadir una prueba o una verificación reproducible para la capacidad modificada.
