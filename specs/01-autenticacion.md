# Spec 01 — Registro e inicio de sesión

## Objetivo

Permitir que un estudiante cree una cuenta y acceda a la aplicación de forma
segura, como base para todo lo demás. Sin sistema universitario real: el
prototipo usa cuentas propias de la app (email/usuario + contraseña).

## Historias de usuario

- Como estudiante nuevo, quiero registrarme con mis datos académicos básicos
  para empezar a usar la plataforma.
- Como estudiante registrado, quiero iniciar sesión de forma rápida desde mi
  celular para continuar donde lo dejé.
- Como estudiante, quiero cerrar sesión y recuperar mi contraseña si la
  olvido.

## Criterios de aceptación

- **Given** un visitante sin cuenta, **when** completa el formulario de
  registro con email, contraseña, nombre/alias y carrera, **then** se crea
  su Usuario y queda autenticado.
- **Given** un email ya registrado, **when** intenta registrarse de nuevo,
  **then** el sistema muestra un mensaje de error con el componente de
  diálogo personalizado (nunca `alert()`), sin revelar si el email existe
  con fines de enumeración (mensaje genérico).
- **Given** credenciales correctas, **when** el usuario inicia sesión,
  **then** recibe un token válido y es redirigido a su panel principal.
- **Given** credenciales incorrectas, **when** el usuario intenta iniciar
  sesión, **then** ve un mensaje de error accesible sin bloquear el
  formulario innecesariamente.
- **Given** un campo de email o contraseña en móvil, **when** el usuario lo
  toca, **then** el teclado aparece sin que el navegador haga zoom en la
  pantalla (font-size ≥16px, ver `CONSTITUTION.md` §4).

## Reglas de negocio

- Contraseñas nunca se almacenan en texto plano (hash + salt, ej.
  `Identity` de ASP.NET Core o `BCrypt`).
- Un Usuario puede tener rol de solicitante y colaborador simultáneamente
  por defecto (no son cuentas separadas).
- El campo de datos académicos (carrera, periodo) es obligatorio; otros
  campos de perfil (habilidades, disponibilidad) se completan en
  `specs/02` y no bloquean el registro.

## Entidades y datos

- **Usuario**: id, email, hashContraseña, nombre/alias, carrera, periodo
  académico, fechaCreación, preferenciasPrivacidad (por defecto
  conservadoras), rol(es).

## Endpoints sugeridos

- `POST /api/auth/registro`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/recuperar-contrasena`
- `GET /api/usuarios/me`

## Pantallas mobile-first

1. Pantalla de bienvenida/landing corta con acceso a "Registrarme" /
   "Iniciar sesión".
2. Formulario de registro (una columna en móvil, campos apilados,
   validación inline, sin diálogos nativos).
3. Formulario de login.
4. Formulario de recuperación de contraseña.

En escritorio, estos formularios pueden centrarse en una tarjeta más ancha,
pero deben partir del layout móvil ya funcional.

## Diagrama a generar

Diagrama de **secuencia**: Usuario → Frontend (React PWA) → API
(`/auth/registro`, `/auth/login`) → Base de datos, incluyendo el caso de
error de credenciales inválidas.
