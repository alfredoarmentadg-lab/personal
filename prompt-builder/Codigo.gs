/**
 * Asistente de Prompts — backend (Google Apps Script)
 *
 * Flujo:
 *   1. crearHojaDePrompts()  -> crea el Sheet con la estructura y ejemplos (una sola vez)
 *   2. Implementar > Nueva implementación > Aplicación web
 *   3. La web lee la hoja, arma los prompts con producto/URL y los copia al portapapeles
 */

const CONFIG = {
  PROP_SHEET_ID: 'PROMPTS_SHEET_ID',
  NOMBRE_HOJA: 'prompts',
  NOMBRE_ARCHIVO: 'Prompts — Asistente',
  CACHE_PROMPTS_SEG: 300,
  CACHE_URL_SEG: 1800,
  MAX_HTML: 400000
};

const COLUMNAS = ['activo', 'categoria', 'nombre', 'descripcion', 'destino', 'plantilla', 'orden'];

/* ────────────────────────────── Web app ────────────────────────────── */

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Asistente de Prompts')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(nombre) {
  return HtmlService.createHtmlOutputFromFile(nombre).getContent();
}

/* ──────────────────────── Creación de la hoja ───────────────────────── */

/**
 * Crea el Sheet de prompts, lo deja formateado con ejemplos y guarda su ID.
 * Ejecutar UNA vez desde el editor de Apps Script.
 */
function crearHojaDePrompts() {
  const props = PropertiesService.getScriptProperties();
  const idExistente = props.getProperty(CONFIG.PROP_SHEET_ID);
  if (idExistente) {
    try {
      const ya = SpreadsheetApp.openById(idExistente);
      Logger.log('Ya existe una hoja vinculada: ' + ya.getUrl());
      return ya.getUrl();
    } catch (e) {
      Logger.log('El ID guardado ya no es válido, creando una hoja nueva.');
    }
  }

  const ss = SpreadsheetApp.create(CONFIG.NOMBRE_ARCHIVO);
  const hoja = ss.getActiveSheet().setName(CONFIG.NOMBRE_HOJA);

  hoja.getRange(1, 1, 1, COLUMNAS.length).setValues([COLUMNAS])
    .setFontWeight('bold')
    .setBackground('#2E4057')
    .setFontColor('#FFFFFF');

  const ejemplos = plantillasDeEjemplo();
  hoja.getRange(2, 1, ejemplos.length, COLUMNAS.length).setValues(ejemplos);

  hoja.setFrozenRows(1);
  hoja.setColumnWidth(1, 70);
  hoja.setColumnWidth(2, 130);
  hoja.setColumnWidth(3, 220);
  hoja.setColumnWidth(4, 260);
  hoja.setColumnWidth(5, 110);
  hoja.setColumnWidth(6, 620);
  hoja.setColumnWidth(7, 70);
  hoja.getRange(2, 6, hoja.getMaxRows() - 1, 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  hoja.getRange(2, 1, hoja.getMaxRows() - 1, 1)
    .insertCheckboxes()
    .setHorizontalAlignment('center');

  const notas = ss.insertSheet('leeme');
  notas.getRange(1, 1, 1, 1).setValue('Cómo escribir plantillas').setFontWeight('bold').setFontSize(14);
  notas.getRange(3, 1, VARIABLES_DOC.length, 2).setValues(VARIABLES_DOC);
  notas.getRange(3, 1, VARIABLES_DOC.length, 1).setFontFamily('Courier New');
  notas.setColumnWidth(1, 160);
  notas.setColumnWidth(2, 560);
  notas.getRange(3, 2, VARIABLES_DOC.length, 1).setWrap(true);

  props.setProperty(CONFIG.PROP_SHEET_ID, ss.getId());
  CacheService.getScriptCache().remove('prompts');
  Logger.log('Hoja creada: ' + ss.getUrl());
  return ss.getUrl();
}

/** Vincula manualmente una hoja existente por ID o URL. */
function vincularHoja(idOUrl) {
  const id = String(idOUrl).match(/[-\w]{25,}/);
  if (!id) throw new Error('No pude extraer el ID de esa URL.');
  SpreadsheetApp.openById(id[0]);
  PropertiesService.getScriptProperties().setProperty(CONFIG.PROP_SHEET_ID, id[0]);
  CacheService.getScriptCache().remove('prompts');
  return 'Hoja vinculada.';
}

const VARIABLES_DOC = [
  ['{{producto}}', 'Nombre del producto que escribes arriba en la app. Obligatorio.'],
  ['{{url}}', 'La URL de referencia, tal cual.'],
  ['{{titulo}}', 'Título de la página, extraído al pulsar "Leer URL". Editable a mano.'],
  ['{{descripcion}}', 'Meta descripción de la página. Editable a mano.'],
  ['{{precio}}', 'Precio detectado en la página, si lo hay. Editable a mano.'],
  ['{{sitio}}', 'Dominio de la URL (ej. amazon.es).'],
  ['{{extra}}', 'El campo libre de notas de la app.'],
  ['{{fecha}}', 'Fecha de hoy (AAAA-MM-DD).'],
  ['REGLA', 'Si una línea contiene SOLO variables vacías, la app borra esa línea entera al armar el prompt. Así no quedan etiquetas huérfanas tipo "Precio:" sin valor. Pon cada dato opcional en su propia línea.'],
  ['activo', 'Casilla desmarcada = ese prompt no aparece en la app.'],
  ['orden', 'Número. Ordena los prompts dentro de su categoría.'],
  ['destino', 'Etiqueta libre (ChatGPT, Claude, Midjourney...). Solo se muestra como badge.']
];

/* ──────────────────────── Lectura de prompts ───────────────────────── */

function getEstado() {
  const id = PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_SHEET_ID);
  if (!id) return { hayHoja: false, hojaUrl: '' };
  try {
    return { hayHoja: true, hojaUrl: SpreadsheetApp.openById(id).getUrl() };
  } catch (e) {
    return { hayHoja: false, hojaUrl: '' };
  }
}

function getPrompts(forzarRecarga) {
  const cache = CacheService.getScriptCache();
  if (!forzarRecarga) {
    const guardado = cache.get('prompts');
    if (guardado) return JSON.parse(guardado);
  }

  const id = PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_SHEET_ID);
  if (!id) throw new Error('No hay hoja vinculada. Ejecuta crearHojaDePrompts() desde el editor de Apps Script.');

  const hoja = SpreadsheetApp.openById(id).getSheetByName(CONFIG.NOMBRE_HOJA);
  if (!hoja) throw new Error('No encuentro la pestaña "' + CONFIG.NOMBRE_HOJA + '" en la hoja vinculada.');

  const datos = hoja.getDataRange().getValues();
  if (datos.length < 2) return [];

  const cabeceras = datos[0].map(function (h) { return String(h).trim().toLowerCase(); });
  const idx = {};
  COLUMNAS.forEach(function (c) { idx[c] = cabeceras.indexOf(c); });
  if (idx.plantilla === -1 || idx.nombre === -1) {
    throw new Error('La hoja necesita al menos las columnas "nombre" y "plantilla".');
  }

  const prompts = [];
  for (let f = 1; f < datos.length; f++) {
    const fila = datos[f];
    const celda = function (col) { return idx[col] === -1 ? '' : fila[idx[col]]; };

    const plantilla = String(celda('plantilla')).trim();
    const nombre = String(celda('nombre')).trim();
    if (!plantilla || !nombre) continue;
    if (idx.activo !== -1 && celda('activo') === false) continue;

    prompts.push({
      id: 'p' + f,
      fila: f + 1,
      categoria: String(celda('categoria')).trim() || 'Sin categoría',
      nombre: nombre,
      descripcion: String(celda('descripcion')).trim(),
      destino: String(celda('destino')).trim(),
      plantilla: plantilla,
      orden: Number(celda('orden')) || 999
    });
  }

  prompts.sort(function (a, b) {
    if (a.categoria === b.categoria) return a.orden - b.orden;
    return a.categoria.localeCompare(b.categoria, 'es');
  });

  cache.put('prompts', JSON.stringify(prompts), CONFIG.CACHE_PROMPTS_SEG);
  return prompts;
}

/* ─────────────────── Extracción de datos de la URL ──────────────────── */

function leerUrl(url) {
  url = String(url || '').trim();
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, error: 'La URL tiene que empezar por http:// o https://' };
  }

  const cache = CacheService.getScriptCache();
  const clave = 'url_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, url)
  );
  const guardado = cache.get(clave);
  if (guardado) return JSON.parse(guardado);

  let res;
  try {
    res = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      validateHttpsCertificates: true,
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
      }
    });
  } catch (e) {
    return { ok: false, sitio: dominio(url), error: 'No pude conectar con la página: ' + e.message };
  }

  const codigo = res.getResponseCode();
  if (codigo >= 400) {
    return {
      ok: false,
      sitio: dominio(url),
      error: 'La página respondió ' + codigo + (codigo === 403 || codigo === 503
        ? '. Ese sitio bloquea lectores automáticos: rellena los campos a mano.'
        : '.')
    };
  }

  const tipo = String(res.getHeaders()['Content-Type'] || res.getHeaders()['content-type'] || '');
  if (tipo && tipo.indexOf('html') === -1 && tipo.indexOf('text') === -1) {
    return { ok: false, sitio: dominio(url), error: 'Eso no es una página HTML (' + tipo.split(';')[0] + ').' };
  }

  const charset = (tipo.match(/charset=([\w-]+)/i) || [])[1];
  let html;
  try {
    html = charset ? res.getContentText(charset) : res.getContentText();
  } catch (e) {
    html = res.getContentText();
  }
  html = html.slice(0, CONFIG.MAX_HTML);

  const datos = {
    ok: true,
    sitio: dominio(url),
    titulo: primerValor([
      meta(html, 'property', 'og:title'),
      meta(html, 'name', 'twitter:title'),
      etiqueta(html, 'title')
    ]),
    descripcion: primerValor([
      meta(html, 'name', 'description'),
      meta(html, 'property', 'og:description'),
      meta(html, 'name', 'twitter:description')
    ]),
    precio: precio(html),
    imagen: primerValor([
      meta(html, 'property', 'og:image'),
      meta(html, 'name', 'twitter:image')
    ]),
    error: ''
  };

  if (!datos.titulo && !datos.descripcion) {
    datos.ok = false;
    datos.error = 'La página cargó pero no trae título ni descripción legibles (probablemente se pinta con JavaScript). Rellena a mano.';
  }

  cache.put(clave, JSON.stringify(datos), CONFIG.CACHE_URL_SEG);
  return datos;
}

function meta(html, atributo, valor) {
  const patron = new RegExp(
    '<meta[^>]+' + atributo + '\\s*=\\s*["\']' + valor.replace(':', '\\:') + '["\'][^>]*>', 'i');
  const etiquetaMeta = (html.match(patron) || [])[0];
  if (!etiquetaMeta) return '';
  const contenido = etiquetaMeta.match(/content\s*=\s*["']([\s\S]*?)["']/i);
  return contenido ? limpiar(contenido[1]) : '';
}

function etiqueta(html, nombre) {
  const m = html.match(new RegExp('<' + nombre + '[^>]*>([\\s\\S]*?)</' + nombre + '>', 'i'));
  return m ? limpiar(m[1]) : '';
}

function precio(html) {
  const candidatos = [
    (html.match(/"price"\s*:\s*"?([\d]+[.,]?[\d]*)"?/i) || [])[1],
    meta(html, 'property', 'og:price:amount'),
    meta(html, 'property', 'product:price:amount'),
    (html.match(/itemprop\s*=\s*["']price["'][^>]*content\s*=\s*["']([^"']+)["']/i) || [])[1]
  ];
  const valor = primerValor(candidatos);
  if (!valor) return '';
  const moneda = primerValor([
    (html.match(/"priceCurrency"\s*:\s*"([A-Z]{3})"/) || [])[1],
    meta(html, 'property', 'og:price:currency'),
    meta(html, 'property', 'product:price:currency')
  ]);
  return moneda ? valor + ' ' + moneda : valor;
}

function primerValor(lista) {
  for (let i = 0; i < lista.length; i++) {
    const v = String(lista[i] || '').trim();
    if (v) return v;
  }
  return '';
}

function dominio(url) {
  const m = String(url).match(/^https?:\/\/([^\/\?#:]+)/i);
  return m ? m[1].replace(/^www\./i, '') : '';
}

function limpiar(texto) {
  return String(texto)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&#x27;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(Number(n)); })
    .replace(/\s+/g, ' ')
    .trim();
}

/* ─────────────────────── Prompts de ejemplo ─────────────────────────── */

function plantillasDeEjemplo() {
  return [
    [true, 'Pinterest', 'Títulos de pin (5 variantes)', 'Cinco títulos con la keyword al inicio, sin lenguaje de folleto.', 'ChatGPT',
      [
        'Escribe 5 títulos de pin de Pinterest para este producto:',
        '',
        'Producto: {{producto}}',
        'Página: {{url}}',
        'Título de la página: {{titulo}}',
        'Descripción: {{descripcion}}',
        'Precio: {{precio}}',
        'Notas: {{extra}}',
        '',
        'Reglas:',
        '- Máximo 40 caracteres cada uno.',
        '- La palabra clave principal va al principio, no al final.',
        '- Nada de "descubre", "transforma", "eleva", "revoluciona".',
        '- Prohibido el molde "Verbo: producto" (nada de "Ahorra tiempo: la cafetera X").',
        '- Que se lean como algo que escribiría una persona buscando eso en Google.',
        '',
        'Devuélvelos en lista numerada, sin explicaciones.'
      ].join('\n'), 1],

    [true, 'Pinterest', 'Descripción de pin + hashtags', 'Descripción de 2 frases orientada a búsqueda.', 'ChatGPT',
      [
        'Escribe la descripción de un pin de Pinterest para: {{producto}}',
        '',
        'Datos de la página ({{sitio}}):',
        'Título: {{titulo}}',
        'Descripción: {{descripcion}}',
        'Precio: {{precio}}',
        'URL: {{url}}',
        'Notas: {{extra}}',
        '',
        'Formato: 2 frases (máx. 180 caracteres en total) + 4 hashtags al final.',
        'La primera frase tiene que contener la búsqueda real que haría alguien interesado.',
        'Tono directo, sin adjetivos de catálogo. Español neutro.'
      ].join('\n'), 2],

    [true, 'Contenido', 'Esqueleto de reseña', 'Estructura de artículo de reseña con secciones y ángulos.', 'Claude',
      [
        'Necesito el esqueleto de una reseña honesta de: {{producto}}',
        '',
        'Fuente: {{url}}',
        'Título de la página: {{titulo}}',
        'Descripción oficial: {{descripcion}}',
        'Precio: {{precio}}',
        'Contexto extra: {{extra}}',
        '',
        'Dame:',
        '1. Tres ángulos posibles para el artículo, y cuál elegirías tú y por qué.',
        '2. El H1 y los H2 del ángulo ganador.',
        '3. Para cada H2, una frase con lo que va dentro.',
        '4. Las 3 objeciones que tendría alguien antes de comprarlo.',
        '5. Qué datos me faltan y tendría que verificar por mi cuenta.',
        '',
        'No escribas todavía el artículo.'
      ].join('\n'), 1],

    [true, 'Contenido', 'Ficha comparativa', 'Tabla pros/contras y para quién sí y para quién no.', 'Claude',
      [
        'Analiza este producto y dame una ficha de decisión:',
        '',
        'Producto: {{producto}}',
        'URL: {{url}}',
        'Título: {{titulo}}',
        'Descripción: {{descripcion}}',
        'Precio: {{precio}}',
        '',
        'Entrega:',
        '- Tabla de 4 pros y 4 contras concretos (nada de "buena calidad-precio").',
        '- "Para quién sí" y "para quién no", una frase cada uno.',
        '- Dos alternativas directas y en qué gana cada una.',
        '- Una pega real que la marca no menciona.'
      ].join('\n'), 2],

    [true, 'Imagen', 'Prompt de imagen para el pin', 'Prompt visual listo para Midjourney o similar.', 'Midjourney',
      [
        'Prompt de imagen vertical 2:3 para un pin de Pinterest sobre {{producto}}.',
        'Referencia visual: {{url}}',
        'Contexto: {{titulo}}. {{descripcion}}',
        'Notas: {{extra}}',
        '',
        'Descríbeme la escena en inglés, en una sola línea: sujeto, entorno, luz, paleta, ángulo de cámara y espacio libre arriba para el texto.',
        'Sin texto ni logos dentro de la imagen. Estilo fotografía real, no ilustración 3D.'
      ].join('\n'), 1],

    [true, 'Email', 'Correo de recomendación', 'Email corto a la lista recomendando el producto.', 'ChatGPT',
      [
        'Escribe un correo corto para mi lista recomendando: {{producto}}',
        '',
        'Enlace: {{url}}',
        'Datos: {{titulo}} — {{descripcion}}',
        'Precio: {{precio}}',
        'Contexto mío: {{extra}}',
        '',
        'Estructura: asunto (máx. 45 caracteres, sin emoji), 120-160 palabras, un solo enlace, cierre con una pregunta.',
        'Empieza contando cuándo lo usé o para qué lo busqué, no con la ficha técnica.',
        'Sin "espero que estés bien", sin listas de beneficios, sin urgencia falsa.'
      ].join('\n'), 1],

    [false, 'Email', 'Secuencia de 3 correos', 'Desactivado: ejemplo de prompt apagado con la casilla.', 'ChatGPT',
      [
        'Secuencia de 3 correos para {{producto}} ({{url}}).',
        'Correo 1: el problema. Correo 2: cómo lo resuelve. Correo 3: la oferta y el cierre.',
        'Notas: {{extra}}'
      ].join('\n'), 2]
  ];
}
