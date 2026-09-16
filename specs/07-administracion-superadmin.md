# Spec 07 — Administración y control de acceso

## Objetivo

Dar al propietario del sistema un espacio exclusivo para consultar usuarios registrados y gestionar su acceso con una razón explícita y visible.

## Criterios de aceptación

- El usuario raíz se crea al iniciar el API cuando existen `Admin__Email` y `Admin__Password` en `.env`.
- La contraseña del root debe tener al menos 12 caracteres y no se almacena en texto plano.
- El rol `superadmin` se emite en el JWT y habilita únicamente las rutas `/api/admin/*`.
- El panel permite consultar métricas, buscar por nombre/correo/carrera y filtrar por estado.
- Los estados disponibles son activo, suspendido y bloqueado.
- Suspender o bloquear exige un motivo de hasta 500 caracteres.
- El motivo aparece al intentar iniciar sesión con contraseña o Google.
- Un superadministrador no puede restringir su propia cuenta.
- Todas las acciones de cambio usan confirmación personalizada, nunca diálogos nativos.
- La interfaz funciona en móvil y escritorio con el lenguaje visual de ConectaMentes.

## Contrato principal

- `GET /api/admin/resumen`
- `GET /api/admin/usuarios?search=&status=`
- `POST /api/admin/usuarios/{id}/estado` con `{ "status": "suspended|blocked|active", "reason": "..." }`

## Variables de despliegue

Configurar antes del primer arranque:

```env
Admin__Email=admin@tu-dominio.com
Admin__Password=una-clave-larga-y-unica
Admin__DisplayName=Superadministrador
```

