# Manual de Usuario - Manuales MEA

## Tabla de Contenidos

1. [Introduccion](#introduccion)
2. [Acceso al Sistema](#acceso-al-sistema)
3. [Pantalla Principal](#pantalla-principal)
4. [Consultar Manuales con IA](#consultar-manuales-con-ia)
5. [Visor de Paginas](#visor-de-paginas)
6. [Mi Perfil](#mi-perfil)
7. [Tema Claro/Oscuro](#tema-clarooscuro)
8. [Recuperar Contrasena](#recuperar-contrasena)
9. [Panel de Administracion](#panel-de-administracion) *(Solo Administradores)*

---

## Introduccion

**Manuales MEA** es una aplicacion web que permite consultar manuales tecnicos de equipos GSE (Ground Support Equipment) mediante inteligencia artificial. En lugar de buscar manualmente en documentos extensos, puedes hacer preguntas en lenguaje natural y recibir respuestas precisas con referencias a las paginas exactas del manual.

### Caracteristicas principales:
- Busqueda inteligente mediante IA (Claude de Anthropic)
- Respuestas con referencias a paginas especificas
- Visor integrado de paginas del manual
- Soporte para manuales escaneados (OCR)
- Interfaz responsive (funciona en movil y escritorio)
- Tema claro y oscuro

---

## Acceso al Sistema

### Iniciar Sesion

1. Abre la aplicacion en tu navegador: **https://manualesmea.mx**
2. Ingresa tu **correo electronico** y **contrasena**
3. Haz clic en **"Iniciar sesion"**

![Login](docs/login.png)

> **Nota:** Las cuentas de usuario son creadas por los administradores. Si no tienes cuenta, contacta a tu administrador.

### Ver/Ocultar Contrasena

- Haz clic en el icono del ojo junto al campo de contrasena para mostrarla u ocultarla

---

## Pantalla Principal

Una vez que inicies sesion, veras la pantalla principal dividida en dos secciones:

### Selector de Manual (Izquierda)
- Lista desplegable con todos los manuales disponibles
- Muestra el numero de paginas de cada manual
- Selecciona un manual para comenzar a consultarlo

### Area de Chat (Derecha)
- Aqui aparecen tus preguntas y las respuestas del asistente
- Campo de texto en la parte inferior para escribir tus preguntas

### Barra Superior (Header)
- **Logo MEA**: Clic para volver a la pantalla principal
- **Icono de sol/luna**: Cambiar entre tema claro y oscuro
- **Menu de usuario**: Acceso a tu perfil, panel de administracion (si eres admin) y cerrar sesion

---

## Consultar Manuales con IA

### Como hacer una pregunta

1. **Selecciona un manual** del menu desplegable a la izquierda
2. **Escribe tu pregunta** en el campo de texto inferior
3. **Presiona Enter** o haz clic en el boton de enviar

### Tipos de preguntas que puedes hacer

- **Procedimientos**: *"Como se realiza el mantenimiento preventivo del sistema hidraulico?"*
- **Especificaciones**: *"Cual es la presion de operacion del sistema neumatico?"*
- **Ubicacion de componentes**: *"Donde se encuentra la valvula de alivio?"*
- **Solucion de problemas**: *"Que hacer si el motor no arranca?"*
- **Intervalos de servicio**: *"Cada cuanto se debe cambiar el aceite?"*

### Entendiendo las respuestas

Cada respuesta del asistente incluye:

1. **Texto de la respuesta**: Informacion extraida del manual
2. **Referencias**: Lista de paginas consultadas con su nivel de relevancia
   - Las paginas se muestran como botones clicables
   - El porcentaje indica que tan relevante es esa pagina para tu pregunta

### Borrar conversacion

- Haz clic en el icono de papelera en la barra azul del chat
- Confirma para eliminar el historial de la conversacion actual

> **Tip:** La conversacion se mantiene mientras navegas por la aplicacion. Solo se borra al cerrar sesion o al hacer clic en el boton de borrar.

---

## Visor de Paginas

Cuando el asistente responde, muestra referencias a paginas especificas del manual.

### Ver una pagina

1. Haz clic en el boton de la pagina (ej: **"Pag. 45"**)
2. Se abrira un visor con la imagen de esa pagina

### Controles del visor

- **Zoom (-/+)**: Ajusta el tamano de visualizacion (25% a 200%)
- **Abrir en nueva pestana**: Abre la imagen en una nueva ventana del navegador
- **Cerrar (X)**: Cierra el visor

### Navegacion

- Haz clic fuera del visor (en el fondo oscuro) para cerrarlo
- En movil, el zoom por defecto es 100% para mejor visualizacion

---

## Mi Perfil

Accede a tu perfil desde el menu de usuario en la esquina superior derecha.

### Informacion visible

- **Email**: Tu correo electronico (no editable)
- **Rol**: Tu nivel de acceso en el sistema (no editable)

### Informacion editable

- **Nombre**: Tu nombre
- **Apellido**: Tu apellido
- **Ubicacion**: Tu ubicacion de trabajo (ej: "Hangar 3", "Oficina Central")

### Guardar cambios

1. Modifica los campos que desees
2. Haz clic en **"Guardar Cambios"**
3. Veras un mensaje de confirmacion

---

## Tema Claro/Oscuro

La aplicacion soporta dos temas visuales:

### Cambiar tema

1. Haz clic en el icono de **sol** (tema claro) o **luna** (tema oscuro) en la barra superior
2. El cambio es inmediato y se guarda automaticamente

### Preferencias

- Tu preferencia de tema se guarda en tu perfil
- Al iniciar sesion desde cualquier dispositivo, se aplicara tu tema preferido

---

## Recuperar Contrasena

Si olvidaste tu contrasena:

1. En la pantalla de login, haz clic en **"¿Olvidaste tu contrasena?"**
2. Ingresa tu **correo electronico**
3. Haz clic en **"Enviar enlace de recuperacion"**
4. Revisa tu bandeja de entrada (y spam)
5. Haz clic en el enlace del correo
6. Ingresa tu **nueva contrasena** (minimo 6 caracteres)
7. Haz clic en **"Actualizar contrasena"**

> **Nota:** El enlace de recuperacion expira despues de un tiempo. Si expiro, solicita uno nuevo.

---

## Panel de Administracion

*Esta seccion es solo para usuarios con rol de Administrador o Administrador Maestro.*

Accede al panel desde el menu de usuario > **"Administracion"**

### Pestanas disponibles

El panel tiene tres secciones:

---

### 1. Manuales

Gestion de los manuales disponibles en el sistema.

#### Ver manuales
- Lista de todos los manuales con nombre, paginas y estado
- **Procesado**: El manual esta listo para consultas
- **Pendiente**: El manual aun se esta procesando

#### Subir nuevo manual
1. Haz clic en **"Subir Manual"**
2. Selecciona un archivo PDF
3. El sistema procesara automaticamente el manual (puede tomar varios minutos u horas dependiendo del tamano)
4. Una vez procesado, estara disponible para consultas

#### Eliminar manual
1. Haz clic en el icono de papelera junto al manual
2. Confirma la eliminacion

> **Advertencia:** Eliminar un manual borra toda la informacion asociada y no se puede deshacer.

---

### 2. Usuarios

Gestion de usuarios del sistema.

#### Ver usuarios
- Lista de todos los usuarios registrados
- Muestra: email, nombre, rol, ubicacion, fecha de creacion

#### Crear usuario
1. Haz clic en **"Crear Usuario"**
2. Completa el formulario:
   - **Email**: Correo electronico del usuario
   - **Contrasena**: Contrasena inicial (minimo 6 caracteres)
   - **Nombre y Apellido**: Datos del usuario
   - **Rol**: Nivel de acceso
   - **Ubicacion**: Lugar de trabajo (opcional)
3. Haz clic en **"Crear"**

#### Roles de usuario

| Rol | Permisos |
|-----|----------|
| **Usuario** | Consultar manuales, editar su perfil |
| **Administrador** | Todo lo anterior + gestionar manuales, usuarios y configuracion |
| **Administrador Maestro** | Todo lo anterior + delegar rol de administrador maestro |

#### Editar usuario
1. Haz clic en el icono de lapiz junto al usuario
2. Modifica los campos necesarios
3. Haz clic en **"Guardar"**

#### Eliminar usuario
1. Haz clic en el icono de papelera
2. Confirma la eliminacion

> **Nota:** No puedes eliminar tu propia cuenta ni la del Administrador Maestro.

---

### 3. Configuracion

Ajustes globales del sistema.

#### Modelo de IA
Selecciona el modelo de Anthropic para las respuestas:

| Modelo | Descripcion |
|--------|-------------|
| **Claude 3.5 Haiku** | Mas rapido y economico. Ideal para tareas simples. |
| **Claude Sonnet 4** | Balance entre costo y calidad. Recomendado para uso general. |
| **Claude Opus 4** | Maxima calidad. Ideal para tareas complejas. |

#### Limite de Subida
- Tamano maximo permitido para archivos PDF (10 MB a 200 MB)
- Ajusta segun las necesidades de tus manuales

#### Zoom de Paginas
Configura el zoom por defecto al visualizar paginas:

- **Version Web (escritorio)**: 25% a 200%
- **Version Mobile (celular/tablet)**: 25% a 200%

> **Tip:** En movil se recomienda 100% o mas para mejor legibilidad.

---

## Preguntas Frecuentes

### ¿Por que el asistente no encuentra informacion?
- Verifica que seleccionaste el manual correcto
- Intenta reformular tu pregunta con palabras diferentes
- Algunas paginas escaneadas pueden no haberse procesado correctamente

### ¿Cuanto tiempo tarda en procesarse un manual?
- Depende del numero de paginas y si son escaneadas
- Un manual de 100 paginas digitales: ~5 minutos
- Un manual de 100 paginas escaneadas: ~30-60 minutos

### ¿Puedo usar la aplicacion en mi celular?
- Si, la aplicacion es completamente responsive
- Funciona en cualquier navegador moderno (Chrome, Safari, Firefox)

### ¿Las conversaciones se guardan?
- Las conversaciones se mantienen durante tu sesion
- Al cerrar sesion, se pierden
- No se almacenan en el servidor

### ¿Como cambio mi contrasena?
- Actualmente debes usar la opcion "¿Olvidaste tu contrasena?" desde el login
- O pide a un administrador que la restablezca

---

## Soporte

Si tienes problemas o preguntas:

1. Contacta a tu administrador del sistema
2. Reporta errores tecnicos al equipo de TI

---

*Manual de Usuario v1.0 - Manuales MEA*
*Ultima actualizacion: Enero 2025*
