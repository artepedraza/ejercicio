# Instalación del backend (Google Sheets + Apps Script)

Cuenta: **artepedraza@gmail.com**. Las etiquetas en inglés van entre paréntesis por si la interfaz está en inglés.
El token está en `backend/.token` (en la computadora). **No lo pegues en ningún otro archivo ni lo compartas.**

## 1. Crear la hoja
1. Abrir `https://sheets.new` con la cuenta artepedraza@gmail.com.
2. Renombrar el archivo (clic en "Hoja de cálculo sin título" / "Untitled spreadsheet") a **Ejercicio - Registro**.

## 2. Abrir Apps Script y pegar el código
1. Menú **Extensiones** (Extensions) → **Apps Script**. Se abre `script.google.com` en una pestaña nueva.
2. Renombrar el proyecto (arriba a la izquierda, "Proyecto sin título" / "Untitled project") a **Ejercicio Sync**.
3. En el archivo **Código.gs** (Code.gs): seleccionar todo el contenido, borrarlo y pegar el contenido completo de `backend/Code.gs`.
4. **Guardar** (ícono del disquete / Save, o Ctrl+S).

## 3. Ejecutar `setup` y autorizar
1. En la barra superior, en el menú desplegable de funciones, elegir **setup**.
2. Clic en **Ejecutar** (Run). Aparece "Se necesita autorización" (Authorization required) → **Revisar permisos** (Review permissions).
3. Elegir la cuenta **artepedraza@gmail.com**.
4. Pantalla "Google no ha verificado esta app" (Google hasn't verified this app) → **Configuración avanzada** / **Avanzado** (Advanced) → **Ir a Ejercicio Sync (no seguro)** (Go to Ejercicio Sync (unsafe)). Es normal: el script es tuyo.
5. **Permitir** (Allow).
6. Esperar "Ejecución completada" (Execution completed) en el registro. En la hoja deben existir las pestañas **Series**, **Sesiones** y **Estado**. (Es seguro repetir `setup`.)

## 4. Poner el token
1. A la izquierda, ⚙ **Configuración del proyecto** (Project Settings).
2. Bajar a **Propiedades de la secuencia de comandos** (Script Properties) → **Agregar propiedad de la secuencia de comandos** (Add script property).
3. **Propiedad** (Property): `TOKEN` · **Valor** (Value): el contenido de `backend/.token`.
4. **Guardar propiedades de la secuencia de comandos** (Save script properties).

Sin `TOKEN` el servicio rechaza todas las peticiones.

## 5. Implementar como aplicación web
1. Arriba a la derecha: **Implementar** (Deploy) → **Nueva implementación** (New deployment).
2. Junto a "Seleccionar tipo" (Select type) clic en ⚙ → **Aplicación web** (Web app).
3. Descripción: `v1`.
4. **Ejecutar como** (Execute as): **Yo (artepedraza@gmail.com)** (Me).
5. **Quién tiene acceso** (Who has access): **Cualquier usuario** (Anyone).
   ⚠️ **NO** elegir "Cualquier usuario con una cuenta de Google" (Anyone with Google account): la app llama sin iniciar sesión en Google y esa opción la bloquearía.
6. **Implementar** (Deploy). Si vuelve a pedir autorización, repetir el paso 3.2–3.5.
7. Copiar la **URL de la aplicación web** (Web app URL); termina en `/exec`.

## 6. Verificar
Abrir en el navegador: `<URL>?action=ping&token=<TOKEN>`
El navegador terminará en una URL `script.googleusercontent.com/...` mostrando el JSON; es lo esperado (Apps Script redirige ahí). Debe responder `{"ok":true,...}`. Con un token incorrecto responde `{"ok":false,"error":"unauthorized"}`.

## 7. Conectar la app
En la app, pantalla Inicio → **Sincronizar con Google Sheets**: pegar la URL (`/exec`) y el token → **Guardar**. El estado debe decir "Sincronizado hh:mm". Repetir en cada dispositivo con la misma URL y token.

## Actualizar el código después SIN cambiar la URL
1. Editar/pegar el nuevo código en Apps Script y guardar.
2. **Implementar** (Deploy) → **Gestionar implementaciones** (Manage deployments).
3. En la implementación activa, clic en ✏ (Editar / Edit).
4. **Versión** (Version): **Nueva versión** (New version).
5. **Implementar** (Deploy).

No uses "Nueva implementación" para actualizar: genera otra URL y habría que reconfigurar la app.
