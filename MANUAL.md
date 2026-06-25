# Manual — Bot Pokémon WhatsApp

Guía paso a paso para instalar y ejecutar el bot en **Windows**.

---

## ¿Desde dónde se ejecuta `npm start`?

Se ejecuta en una **terminal** (consola de comandos), **dentro de la carpeta del proyecto**:

```
C:\Users\USER\Desktop\BotWhatsapp
```

Esa carpeta es donde están `package.json`, `index.js` y la carpeta `public`.

---

## Requisito previo: Node.js

> **Ya instalado en tu PC:** Node.js v24.17.0 y las dependencias del proyecto (`npm install`) ya fueron instaladas. Solo te falta **arrancar** el bot.

Si en otra PC o después de formatear necesitas instalarlo de nuevo:

1. Entra a: [https://nodejs.org](https://nodejs.org)
2. Descarga la versión **LTS** (recomendada).
3. Instálala con las opciones por defecto (siguiente, siguiente…).
4. **Cierra y vuelve a abrir** cualquier terminal que tuvieras abierta.

### Comprobar que quedó instalado

Abre **PowerShell** o **Símbolo del sistema** y escribe:

```powershell
node -v
npm -v
```

Deberías ver números de versión (por ejemplo `v20.x.x` y `10.x.x`).  
Si dice *"no se reconoce"* → Node.js no está instalado o hay que reiniciar la PC.

---

## Opción A — La más fácil (doble clic)

En la carpeta del proyecto hay dos archivos `.bat`:


| Archivo        | Qué hace                                           |
| -------------- | -------------------------------------------------- |
| `instalar.bat` | Instala las dependencias (solo la **primera vez**) |
| `iniciar.bat`  | Arranca el bot y el panel web                      |


### Pasos

1. Abre el **Explorador de archivos**.
2. Ve a: `C:\Users\USER\Desktop\BotWhatsapp`
3. ~~**Primera vez:** doble clic en `**instalar.bat~~*`* *(ya hecho)*
4. Doble clic en `**iniciar.bat*`*.
5. Se abrirá una ventana negra (consola). **No la cierres** mientras uses el bot.
6. Abre el navegador en: **[http://localhost:3000](http://localhost:3000)**
7. Pulsa **Iniciar bot** y escanea el QR con WhatsApp.

---

## Opción B — Desde PowerShell (manual)

### 1. Abrir la terminal en la carpeta correcta

**Método rápido (recomendado):**

1. Abre el Explorador en `C:\Users\USER\Desktop\BotWhatsapp`
2. Haz clic en la **barra de dirección** (donde dice la ruta)
3. Escribe `powershell` y pulsa **Enter**
  → Se abre PowerShell **ya dentro de esa carpeta**

**Método alternativo:**

1. Pulsa `Win + R`, escribe `powershell` y Enter
2. Escribe:

```powershell
cd C:\Users\USER\Desktop\BotWhatsapp
```

### 2. Instalar dependencias (solo la primera vez)

```powershell
npm install
```

Espera a que termine sin errores. Puede tardar unos minutos la primera vez (descarga librerías y Chromium).

### 3. Iniciar el bot

```powershell
npm start
```

Verás algo como:

```
🌐 Panel web: http://localhost:3000
   Abre esa URL en el navegador para controlar el bot.
```

### 4. Usar el panel web

1. Abre Chrome, Edge o Firefox.
2. Ve a: **[http://localhost:3000](http://localhost:3000)**
3. Clic en **Iniciar bot**
4. Escanea el **código QR** con WhatsApp:
  - WhatsApp en el móvil → **Dispositivos vinculados** → **Vincular dispositivo**
5. Cuando diga **Conectado**, ya puedes usar los comandos en cualquier chat.

### 5. Detener el bot

- En el panel web: botón **Detener bot**, o
- En la ventana de PowerShell: `Ctrl + C`

---

## Comandos de WhatsApp

Escribe estos mensajes en cualquier chat (grupo o privado):


| Comando             | Qué hace            |
| ------------------- | ------------------- |
| `#pokemon`          | Pokémon aleatorio   |
| `#pokemon pikachu`  | Buscar por nombre   |
| `#poketeam`         | Equipo de 6 Pokémon |
| `#pokebatle @rival` | Batalla simulada    |


El bot **responde citando** tu mensaje original.

---

## Problemas frecuentes

### "npm no se reconoce como comando"

- Instala Node.js desde [https://nodejs.org](https://nodejs.org)
- Reinicia la PC o al menos cierra y abre de nuevo la terminal

### "Cannot find module..."

Estás en la carpeta equivocada o no instalaste dependencias. Ejecuta:

```powershell
cd C:\Users\USER\Desktop\BotWhatsapp
npm install
```

### El navegador no abre localhost:3000

- Comprueba que `npm start` sigue corriendo (ventana abierta)
- Prueba manualmente: [http://127.0.0.1:3000](http://127.0.0.1:3000)

### El QR no aparece

- En el panel, pulsa **Iniciar bot** otra vez
- Espera unos segundos; la primera vez tarda más

### La sesión se pierde al cerrar

- La sesión se guarda en la carpeta `.wwebjs_auth` (no la borres)
- La próxima vez que ejecutes `npm start`, normalmente **no** pedirá QR de nuevo

### "Could not find Chrome" / error de Puppeteer

El bot usa **Google Chrome o Edge** instalados en tu PC (no hace falta descargar Chrome aparte).

Si sigue fallando:

- Instala Chrome: [https://www.google.com/chrome/](https://www.google.com/chrome/)
- Cierra el bot y vuelve a ejecutar `iniciar.bat`

---

## Resumen rápido

```
✅ Node.js instalado
✅ npm install hecho
→ Doble clic en iniciar.bat   (o npm start)
→ Abrir http://localhost:3000
→ Iniciar bot → escanear QR → listo
```

---

## Estructura del proyecto

```
BotWhatsapp/
├── iniciar.bat       ← doble clic para arrancar (Windows)
├── instalar.bat      ← doble clic para instalar (Windows)
├── MANUAL.md         ← este archivo
├── index.js          ← arranque del servidor
├── public/           ← panel web (interfaz visual)
├── commands/         ← lógica de #pokemon, #poketeam, #pokebatle
└── services/         ← WhatsApp, PokéAPI, cooldowns
```

