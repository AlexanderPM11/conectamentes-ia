# Reglas permanentes de interfaz

Estas reglas aplican a cualquier implementación futura del proyecto:

- Nunca usar `window.alert`, `window.confirm`, `window.prompt` ni diálogos nativos o sin estilizar del navegador.
- Toda alerta, error, advertencia, confirmación o acción destructiva debe usar componentes propios de ConectaMentes, coherentes con el sistema visual y adaptados primero a móvil.
- Reutilizar `ConfirmDialog` para confirmaciones y acciones destructivas. El componente debe incluir título claro, explicación del impacto, cancelar, acción principal, cierre con Escape y roles ARIA de diálogo.
- Reutilizar toasts o mensajes propios para éxito, error y estado. No mostrar mensajes técnicos directamente al usuario.
- Antes de publicar cambios, buscar usos prohibidos (`window.alert`, `window.confirm`, `window.prompt`, `confirm(`, `alert(` y `prompt(`) y corregirlos.
- Las acciones irreversibles siempre requieren una confirmación visual explícita antes de ejecutarse.
- Mantener las mismas reglas en móvil y escritorio; ningún flujo debe depender de un diálogo nativo del sistema operativo.

La referencia funcional y de diseño también está documentada en `CONSTITUTION.md`, sección 5.
