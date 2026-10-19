/**
 * Ejercicio — backend de sincronización (Google Apps Script, V8, sin librerías).
 * Script ligado a una Hoja de cálculo; se publica como aplicación web:
 *   Ejecutar como: yo (el dueño) · Quién tiene acceso: cualquier usuario.
 *
 * POR QUÉ ESTE TRANSPORTE (no lo "mejores" sin leer esto):
 *  - El POST llega como JSON con `Content-Type: text/plain;charset=utf-8`. Eso es una
 *    "solicitud simple" de CORS: el navegador NO hace preflight (OPTIONS). Apps Script
 *    no puede responder OPTIONS, así que cualquier otro Content-Type o cabecera
 *    personalizada rompería la app. Por eso el token va DENTRO del body, nunca en un header.
 *  - El GET usa query params (?action=pull&token=...).
 *  - /exec responde 302 hacia script.googleusercontent.com; fetch (redirect:'follow') lo
 *    sigue (el POST se vuelve GET en el destino, que ya contiene la respuesta) y esa
 *    respuesta trae Access-Control-Allow-Origin:*. La respuesta se arma con ContentService
 *    (MimeType.JSON).
 *  - El estado completo vive en la hoja "Estado" (JSON en trozos, una celda aguanta 50,000
 *    caracteres). Se eligió sobre Script Properties (9 KB por valor) y sobre Drive
 *    (pide un permiso mucho más amplio).
 *  - Series y Sesiones se reconstruyen completas desde state.sessions en cada push:
 *    idempotente por construcción (reenviar no duplica) y una sesión borrada en la app
 *    desaparece de las hojas.
 *
 * Propiedad requerida (Configuración del proyecto → Propiedades de la secuencia de comandos):
 *   TOKEN = secreto compartido con la app. Si falta, se rechaza TODO.
 */

var SERIES_HEADERS = ['fecha', 'sesion_id', 'rutina', 'bloque', 'ejercicio', 'ronda', 'peso', 'unidad', 'reps', 'segundos'];
var SESIONES_HEADERS = ['sesion_id', 'fecha', 'rutina', 'series_hechas', 'calentamiento_hecho', 'extras_hechos', 'actualizado'];
var ESTADO_HEADERS = ['parte', 'json'];
var CHUNK = 40000;

// ---------- instalación ----------

/** Ejecutar una vez a mano: crea las 3 hojas (idempotente) y guarda el id del spreadsheet. */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());
  ensureSheet_(ss, 'Series', SERIES_HEADERS);
  ensureSheet_(ss, 'Sesiones', SESIONES_HEADERS);
  var estado = ensureSheet_(ss, 'Estado', ESTADO_HEADERS);
  estado.getRange(1, 1, 1, 2).setNumberFormat('@');
  estado.getRange(2, 1, 500, 2).setNumberFormat('@'); // texto plano: que Sheets no convierta fechas
}

function ensureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sh;
}

function ss_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) throw new Error('Falta ejecutar setup()');
  return active;
}

// ---------- entrada web ----------

function doGet(e) {
  return respond_(function () {
    var p = (e && e.parameter) || {};
    checkToken_(p.token);
    if (p.action === 'ping') return { ok: true, ts: new Date().toISOString() };
    if (p.action === 'pull') return withLock_(pull_);
    return { ok: false, error: 'accion_desconocida' };
  });
}

function doPost(e) {
  return respond_(function () {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    checkToken_(body.token);
    if (body.action !== 'push') return { ok: false, error: 'accion_desconocida' };
    if (!body.state || typeof body.state !== 'object') return { ok: false, error: 'estado_invalido' };
    return withLock_(function () { return push_(body.state); });
  });
}

function respond_(fn) {
  var out;
  try { out = fn(); }
  catch (err) { out = { ok: false, error: err && err.message === 'unauthorized' ? 'unauthorized' : 'error: ' + (err && err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function checkToken_(given) {
  var real = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!real) throw new Error('unauthorized');
  given = String(given == null ? '' : given);
  var diff = given.length ^ real.length;
  for (var i = 0; i < real.length; i++) diff |= (given.charCodeAt(i) || 0) ^ real.charCodeAt(i);
  if (diff !== 0) throw new Error('unauthorized');
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// ---------- Estado ----------

function readEstado_() {
  var sh = ss_().getSheetByName('Estado');
  var last = sh ? sh.getLastRow() : 0;
  if (last < 2) return { updatedAt: '', state: null };
  var rows = sh.getRange(2, 1, last - 1, 2).getValues();
  var updatedAt = '', parts = [];
  rows.forEach(function (r) {
    if (String(r[0]) === 'updatedAt') updatedAt = unpre_(r[1]);
    else if (r[0] !== '') parts.push([Number(r[0]), unpre_(r[1])]);
  });
  if (!parts.length) return { updatedAt: updatedAt, state: null };
  parts.sort(function (a, b) { return a[0] - b[0]; });
  return { updatedAt: updatedAt, state: JSON.parse(parts.map(function (p) { return p[1]; }).join('')) };
}

function writeEstado_(state) {
  var sh = ss_().getSheetByName('Estado');
  var json = JSON.stringify(state);
  var rows = [['updatedAt', PRE + String(state.updatedAt || '')]];
  for (var i = 0, n = 0; i < json.length; i += CHUNK, n++) rows.push([String(n), PRE + json.substr(i, CHUNK)]);
  clearBody_(sh, 2);
  // Sheets could read '=', '+', '-', '@' as a formula, drop a leading apostrophe,
  // turn digit-only text into a number or an ISO date into a Date; the 'j:' prefix
  // makes every cell plain text. Column B is also forced to text format.
  var rng = sh.getRange(2, 1, rows.length, 2);
  rng.setNumberFormat('@');
  rng.setValues(rows);
}

var PRE = 'j:';
// Strip the prefix; unprefixed values (older versions) pass through unchanged.
function unpre_(v) {
  v = String(v);
  return v.indexOf(PRE) === 0 ? v.substr(PRE.length) : v;
}

function clearBody_(sh, cols) {
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, cols).clearContent();
}

function pull_() {
  var cur = readEstado_();
  return { ok: true, updatedAt: cur.updatedAt, state: cur.state };
}

function push_(state) {
  var cur = readEstado_();
  var incoming = String(state.updatedAt || '');
  if (cur.state && cur.updatedAt > incoming) {
    return { ok: false, conflict: true, updatedAt: cur.updatedAt, state: cur.state };
  }
  writeEstado_(state);
  writeSessions_(state);
  return { ok: true, updatedAt: incoming };
}

// ---------- Series / Sesiones (reflejo de state.sessions) ----------

function dateStr_(iso, tz) {
  var d = new Date(iso);
  return isNaN(d.getTime()) ? String(iso || '') : Utilities.formatDate(d, tz, 'yyyy-MM-dd HH:mm');
}

function writeSessions_(state) {
  var ss = ss_();
  var tz = ss.getSpreadsheetTimeZone();
  var routines = {};
  (state.routines || []).forEach(function (r) { routines[r.id] = r; });
  var series = [], sesiones = [];
  (state.sessions || []).filter(function (s) { return s.finished !== false; })
    .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; })
    .forEach(function (s) {
      var r = routines[s.routineId];
      var rName = r ? r.name : String(s.routineId);
      var fecha = dateStr_(s.date, tz);
      (s.sets || []).forEach(function (x) {
        var blockName = '', exName = x.exName;
        if (r) (r.blocks || []).forEach(function (b) {
          (b.exercises || []).forEach(function (ex) {
            if (ex.id === x.exId) { blockName = b.name; exName = ex.name; }
          });
        });
        series.push([fecha, s.id, rName, blockName, exName, x.round, nz_(x.weight), x.unit || '', nz_(x.reps), nz_(x.seconds)]);
      });
      sesiones.push([s.id, fecha, rName, (s.sets || []).length, (s.warmupDone || []).length, (s.extrasDone || []).length,
        String(state.updatedAt || '')]);
    });
  fill_(ss.getSheetByName('Series'), SERIES_HEADERS.length, series);
  fill_(ss.getSheetByName('Sesiones'), SESIONES_HEADERS.length, sesiones);
}

function nz_(v) { return v == null ? '' : v; }

function fill_(sh, cols, rows) {
  clearBody_(sh, cols);
  if (rows.length) sh.getRange(2, 1, rows.length, cols).setValues(rows);
}
