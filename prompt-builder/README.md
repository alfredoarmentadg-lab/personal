# Asistente de Prompts

Aplicación web de Google Apps Script. Escribes el producto y (opcional) una URL de
referencia arriba; abajo hay un botón por cada prompt guardado en un Google Sheet.
Al pulsar, el prompt se arma con esos datos y se copia al portapapeles.

Vista previa navegable (datos falsos, sin backend):
https://claude.ai/code/artifact/3943c32b-6dcf-4c10-b7ee-10a0a056f9ff

## Archivos

| Archivo | Qué es |
|---|---|
| `prompts-semilla.json` | **El origen.** Los 24 prompts con su categoría, destino y plantilla. |
| `Codigo.gs` | Backend: sirve la web, lee el Sheet, extrae metadatos de la URL, crea la hoja. |
| `Semilla.gs` | Generado por `build.py`. La biblioteca de prompts para Apps Script. No editar. |
| `Index.html` | Estructura de la página. |
| `Estilos.html` | CSS (paleta navy/crema/terracota, la misma de la landing). |
| `App.html` | Lógica del navegador: rellenar plantillas, copiar, buscar, vista previa. |
| `appsscript.json` | Manifiesto: permisos y configuración de la web app. |
| `preview/mock.html` | Backend falso para la vista previa. No se sube a Apps Script. |
| `build.py` | Genera `Semilla.gs` y la vista previa desde el mismo origen. |

## Montarlo (10 minutos)

### Opción A — copiar y pegar

1. Entra en https://script.google.com y crea un proyecto nuevo.
2. Crea estos archivos con el mismo nombre y pega el contenido:
   - `Codigo.gs` y `Semilla.gs` (archivos de secuencia de comandos)
   - `Index.html`, `Estilos.html`, `App.html` (archivos HTML — Apps Script les pone
     la extensión `.html` solo, escribe el nombre sin extensión)
3. Menú ⚙️ *Configuración del proyecto* → marca **Mostrar el archivo de manifiesto
   `appsscript.json`** y pega el contenido de `appsscript.json`.
4. Selecciona la función `crearHojaDePrompts` y pulsa **Ejecutar**. Acepta los
   permisos. En el registro aparece la URL del Sheet recién creado, con la
   estructura y 7 prompts de ejemplo.
5. **Implementar → Nueva implementación → Aplicación web**.
   - Ejecutar como: *Yo*
   - Quién tiene acceso: *Solo yo*
6. Abre la URL que te da. Guárdala en el móvil como acceso directo.

### Opción B — con clasp

```bash
npm install -g @google/clasp
clasp login
cd prompt-builder
clasp create --type webapp --title "Asistente de Prompts"
clasp push
clasp run crearHojaDePrompts   # o ejecútala desde el editor
clasp deploy
```

`.claspignore` ya deja fuera `preview/`, el JSON y los scripts de Python: a Apps
Script solo suben los cinco archivos que necesita.

## Cómo escribir prompts en el Sheet

Una fila por prompt. Columnas:

| Columna | Para qué |
|---|---|
| `activo` | Casilla. Desmarcada = ese prompt no aparece en la app. |
| `categoria` | Agrupa los botones por secciones. |
| `nombre` | El título de la tarjeta. |
| `descripcion` | La línea gris de debajo. |
| `destino` | Etiqueta libre (ChatGPT, Claude, Midjourney). Solo decorativa. |
| `plantilla` | El prompt, con variables entre llaves dobles. |
| `orden` | Número. Ordena dentro de su categoría. |

Variables disponibles:

```
{{producto}}      lo que escribes arriba (obligatorio)
{{url}}           la URL tal cual
{{titulo}}        título leído de la página (editable a mano)
{{descripcion}}   meta descripción de la página (editable a mano)
{{precio}}        precio detectado (editable a mano)
{{sitio}}         dominio de la URL, ej. amazon.es
{{extra}}         el campo de notas extra
{{fecha}}         fecha de hoy, AAAA-MM-DD
```

**Regla importante:** si una línea contiene *solo* variables vacías, la app borra
esa línea entera al armar el prompt. Así no quedan etiquetas huérfanas como
`Precio:` sin nada detrás. Por eso conviene poner cada dato opcional en su propia
línea:

```
Producto: {{producto}}
Precio: {{precio}}        ← desaparece si no hay precio
Notas: {{extra}}          ← desaparece si no hay notas
```

Para escribir varias líneas dentro de una celda: **Alt+Enter** (Windows) u
**Opción+Enter** (Mac).

Los prompts se cachean 5 minutos. Si editas el Sheet y no ves el cambio, pulsa
**↻ Recargar** en la app.

## Sobre "Leer URL"

Hace una petición a la página y saca `og:title`, la meta descripción y el precio
(JSON-LD, `og:price:amount` o `itemprop="price"`). Los tres campos quedan
**editables**: si el sitio devuelve basura o bloquea la lectura, los corriges a mano
y los prompts siguen funcionando igual.

Sitios que casi seguro van a fallar: Amazon, tiendas con protección anti-bot y
cualquier página que se pinte entera con JavaScript. La app te lo dice con un aviso
en vez de fallar en silencio. La URL se sigue insertando en el prompt aunque no se
pueda leer.

Las lecturas se cachean 30 minutos por URL.

## Los 24 prompts

Vienen en `prompts-semilla.json`, repartidos así:

| Categoría | Prompts |
|---|---|
| Copywriting & Ventas | PAS, hero de landing, correo de recomendación, secuencia de 4 correos, beneficios desde especificaciones |
| SEO & Fichas | descripción de producto, meta title + description, FAQ con JSON-LD, mapa de palabras clave |
| Redes Sociales | guion de TikTok/Reels, títulos de pin, descripción de pin, carrusel de 8, hilo de X |
| Análisis & Estrategia | matriz de objeciones, auditoría de competencia y UVP, tres perfiles de comprador, ocho ángulos de venta |
| Visual & Creatividades | prompt de imagen, concepto de miniatura, brief de anuncio con variantes A/B |
| Investigación & Verificación | ficha técnica limpia, pros y contras verificables, preguntas reales de compradores |

Todos llevan dentro las reglas de tono: nada de "descubre/transforma/eleva", nada
del molde "Verbo: producto", y `[VERIFICAR]` en lugar de inventarse un dato.

## Regenerar lo derivado

Si tocas los prompts, el HTML, el CSS o el JS:

```bash
python3 build.py
```

Escribe `Semilla.gs` (para Apps Script) y `preview/asistente-prompts.html` (la
vista previa con backend falso) desde el mismo origen. Los prompts viven en un
único sitio: sin dos copias que se desincronicen.

## Diseño

Navy institucional `#16324F` heredado del `#2E4057` de la landing, papel cálido
neutro y terracota quemada como única señal (favoritos, avisos, campo
obligatorio). IBM Plex en sus tres cortes: Serif para la identidad, Sans para la
interfaz, Mono para los prompts. Filete de 1px en vez de sombras, radio 4px, sin
degradados. Tema claro y oscuro por tokens, y responsive hasta 400px.

## Cosas que faltan (por si las quieres luego)

- Historial de los últimos productos usados, para reutilizarlos con un clic.
- Guardar el prompt generado de vuelta en otra pestaña del Sheet, como registro.
- Botón para abrir directamente ChatGPT/Claude con el prompt ya pegado
  (funciona con `chat.openai.com/?q=`, pero se rompe si el prompt es muy largo).
- Un segundo campo de producto para prompts comparativos (producto A vs producto B).
- Encadenar prompts: que la salida de "Ficha técnica limpia" alimente a los demás.
