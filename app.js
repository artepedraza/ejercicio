(function () {
  'use strict';

  var STATE_KEY = 'ejt:state', DRAFT_KEY = 'ejt:draft', BACKUP_KEY = 'ejt:backup', LASTBK_KEY = 'ejt:lastBackup';
  var VERSION = 1;
  var $app = document.getElementById('app');

  // ---------- util ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function uid(p) { return (p || 'x') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function parseNum(s) {
    if (s == null) return null;
    s = String(s).trim().replace(',', '.');
    if (s === '') return null;
    var n = Number(s);
    return isFinite(n) && n >= 0 ? n : NaN;
  }
  function fmtN(n) { return String(n); }
  function fmtDate(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }
  function slug(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 3500);
  }

  // ---------- storage ----------
  var S, D = null;

  function seedState() { return { v: VERSION, routines: clone(window.SEED_ROUTINES), sessions: [] }; }
  function migrate(st) { st.v = VERSION; return st; }
  function load() {
    try {
      var raw = localStorage.getItem(STATE_KEY);
      if (raw) {
        var st = JSON.parse(raw);
        if (st && Array.isArray(st.routines) && Array.isArray(st.sessions)) return migrate(st);
      }
    } catch (e) { /* cae al seed */ }
    return seedState();
  }
  function save() {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(S)); return true; }
    catch (e) { toast('No se pudo guardar (almacenamiento lleno o bloqueado).'); return false; }
  }
  function loadDraft() {
    try { var raw = localStorage.getItem(DRAFT_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  var draftTimer = null;
  function saveDraftNow() {
    clearTimeout(draftTimer); draftTimer = null;
    try {
      if (D) localStorage.setItem(DRAFT_KEY, JSON.stringify(D)); else localStorage.removeItem(DRAFT_KEY);
    } catch (e) { toast('No se pudo guardar el avance.'); }
  }
  function saveDraftSoon() { clearTimeout(draftTimer); draftTimer = setTimeout(saveDraftNow, 300); }
  function flush() { if (draftTimer) saveDraftNow(); }
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', function () { if (document.hidden) flush(); });

  S = load();
  D = loadDraft();
  if (!localStorage.getItem(STATE_KEY)) save();

  // ---------- dominio ----------
  function routineById(id) { return S.routines.filter(function (r) { return r.id === id; })[0]; }
  function sessionById(id) { return S.sessions.filter(function (s) { return s.id === id; })[0]; }
  function sessionsOf(routineId) {
    return S.sessions.filter(function (s) { return s.routineId === routineId; })
      .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  }
  function lastFinished(routineId) { return sessionsOf(routineId)[0] || null; }
  // Sets de un ejercicio dentro de una sesión: por exId, si no hay, por exName.
  function setsFor(session, ex) {
    var byId = session.sets.filter(function (s) { return s.exId === ex.id; });
    if (byId.length) return byId;
    return session.sets.filter(function (s) { return s.exName === ex.name; });
  }
  function allExercises(r) {
    var out = [];
    r.blocks.forEach(function (b) { b.exercises.forEach(function (e) { out.push(e); }); });
    return out;
  }
  // Prefill: 1) misma ronda en la última sesión que tenga el ejercicio, 2) última ronda registrada, 3) seed.
  function prefill(routine, ex, round) {
    var sessions = sessionsOf(routine.id);
    for (var i = 0; i < sessions.length; i++) {
      var sets = setsFor(sessions[i], ex);
      if (!sets.length) continue;
      var hit = sets.filter(function (s) { return s.round === round; })[0];
      if (!hit) hit = sets.slice().sort(function (a, b) { return b.round - a.round; })[0];
      var sameUnit = (hit.unit || null) === (ex.unit || null);
      return {
        weight: sameUnit ? hit.weight : ex.weight, reps: hit.reps, seconds: hit.seconds,
        unit: hit.unit || null, text: lastText(ex, hit.weight, hit.unit, hit.reps, hit.seconds, null)
      };
    }
    var hasSeed = ex.type === 'time' ? false : ex.seedReps != null;
    return {
      weight: ex.weight, reps: hasSeed ? ex.seedReps : null, seconds: null, unit: ex.unit || null,
      text: hasSeed ? lastText(ex, ex.weight, ex.unit, ex.seedReps, null, ex.seedNote) : null
    };
  }
  function lastText(ex, weight, unit, reps, seconds, note) {
    var core;
    var w = weight != null ? fmtN(weight) + ' ' + (unit || '') : '';
    w = w.trim();
    if (ex.type === 'time') {
      core = seconds != null ? (w ? w + ' × ' : '') + fmtN(seconds) + ' s' : null;
    } else if (ex.type === 'bodyweight') {
      core = reps != null ? fmtN(reps) + ' reps' : null;
    } else {
      core = reps != null ? (w ? w + ' × ' : '') + fmtN(reps) + ' reps' : null;
    }
    if (core == null) return null;
    return core + (note ? ' (' + note + ')' : '');
  }
  function subeSet(routine, session) {
    var res = {};
    if (!session) return res;
    allExercises(routine).forEach(function (ex) {
      var sets = setsFor(session, ex);
      if (!sets.length) return;
      var ok = sets.every(function (s) {
        var v = ex.type === 'time' ? s.seconds : s.reps;
        return v != null && v >= ex.max;
      });
      if (ok) res[ex.id] = true;
    });
    return res;
  }

  // ---------- modal ----------
  function modal(html, buttons) {
    return new Promise(function (resolve) {
      var bg = document.createElement('div');
      bg.className = 'modal-bg';
      bg.innerHTML = '<div class="modal" role="dialog">' + html + '<div class="row">' +
        buttons.map(function (b, i) {
          return '<button class="btn ' + (b.cls || '') + '" data-i="' + i + '" data-testid="' + esc(b.id) + '">' + esc(b.label) + '</button>';
        }).join('') + '</div></div>';
      document.body.appendChild(bg);
      bg.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-i]');
        if (!b) return;
        document.body.removeChild(bg);
        resolve(buttons[+b.getAttribute('data-i')].value);
      });
    });
  }
  function confirmModal(msg, okLabel) {
    return modal('<p>' + esc(msg) + '</p>', [
      { id: 'confirm-cancel', label: 'Cancelar', value: false },
      { id: 'confirm-ok', label: okLabel || 'Aceptar', value: true, cls: 'primary' }
    ]);
  }

  // ---------- vistas ----------
  function navBar(back) {
    return '<div class="nav"><a class="btn" href="#/">← Inicio</a>' + (back || '') + '</div>';
  }

  function viewHome() {
    var lastBk = localStorage.getItem(LASTBK_KEY);
    var h = '<h1>Mi ejercicio</h1>';
    if (D) {
      var dr = routineById(D.routineId);
      h += '<a class="btn primary big" style="margin-bottom:12px" data-testid="continue-session" href="#/sesion/' + esc(D.routineId) + '">Continuar sesión' +
        (dr ? ' · ' + esc(dr.name) : '') + '</a>';
    }
    S.routines.forEach(function (r) {
      var last = lastFinished(r.id);
      h += '<div class="card"><h2 style="margin-top:0">' + esc(r.name) + '</h2>' +
        '<div class="muted" style="margin-bottom:10px">' + (last ? 'Última sesión: ' + esc(fmtDate(last.date)) : 'Sin sesiones todavía') + '</div>' +
        '<button class="btn primary big" data-act="start" data-id="' + esc(r.id) + '" data-testid="start-' + esc(r.id) + '">Empezar</button></div>';
    });
    h += '<div class="nav"><a class="btn" href="#/historial" data-testid="nav-history">Historial</a>' +
      '<a class="btn" href="#/editar" data-testid="nav-edit">Editar</a></div>';
    h += '<div class="card"><div class="row wrap">' +
      '<button class="btn grow" data-act="export" data-testid="export-btn">Exportar</button>' +
      '<button class="btn grow" data-act="import" data-testid="import-btn">Importar</button></div>' +
      '<input type="file" id="import-file" accept="application/json,.json" hidden data-testid="import-file">' +
      '<details style="margin-top:10px"><summary>Pegar respaldo como texto</summary>' +
      '<textarea rows="5" style="width:100%" placeholder="Pega aquí el JSON del respaldo" data-testid="import-text"></textarea>' +
      '<button class="btn" data-act="import-text" data-testid="import-text-ok">Importar texto</button></details>' +
      '<p class="muted" style="margin-bottom:0" data-testid="backup-line">Último respaldo: ' + (lastBk ? esc(fmtDate(lastBk)) : 'nunca') +
      ' · Instálala en tu pantalla de inicio.</p></div>';
    $app.innerHTML = h;
  }

  function newDraft(routine) {
    var rows = {};
    routine.blocks.forEach(function (b) {
      for (var r = 1; r <= b.rounds; r++) {
        b.exercises.forEach(function (ex) {
          var p = prefill(routine, ex, r);
          rows[ex.id + '|' + r] = {
            weight: p.weight, reps: p.reps, seconds: p.seconds,
            unit: ex.unit || (ex.type === 'weight' ? 'kg' : null), done: false, last: p.text
          };
        });
      }
    });
    return {
      id: uid('s'), routineId: routine.id, date: new Date().toISOString(), startedAt: Date.now(),
      warmupDone: [], extrasDone: [], sets: [], finished: false, rows: rows
    };
  }

  function inputVal(v) { return v == null ? '' : esc(fmtN(v)); }

  function setRow(ex, r, row, sube) {
    var k = esc(ex.id) + '-' + r;
    var inputs = '';
    var showW = ex.type === 'weight' || (ex.type === 'time' && (ex.weight != null || ex.unit));
    if (showW) {
      inputs += '<label>Peso (' + esc(row.unit || ex.unit || 'kg') + ')<input type="text" inputmode="decimal" pattern="[0-9]*[.,]?[0-9]*" data-in="weight" data-testid="input-weight-' + k + '" value="' + inputVal(row.weight) + '"></label>';
    }
    if (ex.type === 'time') {
      inputs += '<label>Segundos<input type="text" inputmode="numeric" pattern="[0-9]*" data-in="seconds" data-testid="input-seconds-' + k + '" value="' + inputVal(row.seconds) + '"></label>';
    } else {
      inputs += '<label>Reps<input type="text" inputmode="numeric" pattern="[0-9]*" data-in="reps" data-testid="input-reps-' + k + '" value="' + inputVal(row.reps) + '"></label>';
    }
    return '<div class="set' + (row.done ? ' done' : '') + '" data-key="' + esc(ex.id) + '|' + r + '">' +
      '<div class="nm">' + esc(ex.name) + '<span class="range">' + esc(ex.min) + '–' + esc(ex.max) + (ex.type === 'time' ? ' s' : '') + '</span>' +
      (sube && r === 1 ? '<span class="badge" data-testid="badge-sube-' + esc(ex.id) + '">⬆ Sube peso</span>' : '') + '</div>' +
      '<div class="last" data-testid="last-time-' + k + '">' + (row.last ? 'la vez pasada: ' + esc(row.last) : 'sin registro previo') + '</div>' +
      '<div class="inputs">' + inputs +
      '<button class="tick" data-act="tick" data-testid="set-done-' + k + '" aria-label="Marcar serie hecha">✓</button></div></div>';
  }

  function checkRow(id, testid, name, detail, checked, kind) {
    return '<label class="check' + (checked ? ' done' : '') + '"><input type="checkbox" data-chk="' + kind + '" data-id="' + esc(id) + '" data-testid="' + esc(testid) + '"' + (checked ? ' checked' : '') + '>' +
      '<span><span class="nm">' + esc(name) + '</span>' + (detail ? '<br><span class="detail">' + esc(detail) + '</span>' : '') + '</span></label>';
  }

  function viewSession(routineId) {
    var routine = routineById(routineId);
    if (!routine) { location.hash = '#/'; return; }
    if (!D || D.routineId !== routineId) {
      D = newDraft(routine); saveDraftNow();
    }
    var sube = subeSet(routine, lastFinished(routine.id));
    var h = navBar() + '<h1>' + esc(routine.name) + '</h1>';
    h += '<h2>' + esc(routine.warmupTitle || 'Calentamiento') + '</h2><div class="card">';
    routine.warmup.forEach(function (w) {
      var d = [w.detail, w.note].filter(Boolean).join(' · ');
      h += checkRow(w.id, 'warmup-' + w.id, w.name, d, D.warmupDone.indexOf(w.id) >= 0, 'warmup');
    });
    h += '</div>';
    routine.blocks.forEach(function (b) {
      h += '<h2>' + esc(b.name) + ' · ' + esc(b.rounds) + (b.rounds === 1 ? ' ronda' : ' rondas') + '</h2>';
      for (var r = 1; r <= b.rounds; r++) {
        h += '<h3>Ronda ' + r + '</h3>';
        b.exercises.forEach(function (ex) {
          var key = ex.id + '|' + r;
          if (!D.rows[key]) {
            var p = prefill(routine, ex, r);
            D.rows[key] = { weight: p.weight, reps: p.reps, seconds: p.seconds, unit: ex.unit || (ex.type === 'weight' ? 'kg' : null), done: false, last: p.text };
          }
          h += setRow(ex, r, D.rows[key], !!sube[ex.id]);
        });
      }
    });
    (routine.extras || []).forEach(function (x) {
      h += '<h2>' + esc(x.title) + '</h2><div class="card">';
      x.items.forEach(function (i) {
        h += checkRow(i.id, 'extra-' + i.id, i.name, i.detail, D.extrasDone.indexOf(i.id) >= 0, 'extra');
      });
      h += '</div>';
    });
    h += '<div class="finish"><button class="btn primary big" data-act="finish" data-testid="finish-btn">Terminar sesión</button></div>';
    $app.innerHTML = h;
  }

  function tickSet(el) {
    var set = el.closest('.set'); if (!set) return;
    var key = set.getAttribute('data-key'), row = D.rows[key];
    var exId = key.split('|')[0];
    var routine = routineById(D.routineId);
    var ex = allExercises(routine).filter(function (e) { return e.id === exId; })[0];
    if (!row || !ex) return;
    if (row.done) { row.done = false; set.classList.remove('done'); saveDraftNow(); return; }
    var bad = [];
    var needW = ex.type === 'weight';
    function chk(field, required) {
      var inp = set.querySelector('[data-in="' + field + '"]');
      if (!inp) return;
      var n = parseNum(inp.value);
      var invalid = Number.isNaN(n) || (required && n == null);
      inp.classList.toggle('bad', invalid);
      if (invalid) bad.push(inp);
    }
    chk('weight', needW);
    if (ex.type === 'time') chk('seconds', true); else chk('reps', true);
    if (bad.length) { bad[0].focus(); toast('Revisa los números.'); return; }
    row.done = true; set.classList.add('done'); saveDraftNow();
  }

  function finishSession() {
    var routine = routineById(D.routineId);
    var sets = [];
    routine.blocks.forEach(function (b) {
      for (var r = 1; r <= b.rounds; r++) {
        b.exercises.forEach(function (ex) {
          var row = D.rows[ex.id + '|' + r];
          if (!row || !row.done) return;
          sets.push({
            exId: ex.id, exName: ex.name, round: r,
            weight: row.weight == null ? null : row.weight, unit: row.weight == null ? null : (row.unit || null),
            reps: ex.type === 'time' ? null : row.reps, seconds: ex.type === 'time' ? row.seconds : null
          });
        });
      }
    });
    if (!sets.length && !D.warmupDone.length) {
      toast('Marca al menos una serie con ✓ antes de terminar.'); return;
    }
    var session = {
      id: D.id, routineId: D.routineId, date: D.date, warmupDone: D.warmupDone.slice(),
      extrasDone: D.extrasDone.slice(), sets: sets, finished: true
    };
    S.sessions.push(session);
    if (!save()) { S.sessions.pop(); return; }
    D = null; saveDraftNow();
    location.hash = '#/resumen/' + session.id;
  }

  function viewSummary(id) {
    var s = sessionById(id);
    if (!s) { location.hash = '#/'; return; }
    var r = routineById(s.routineId);
    var h = navBar() + '<div data-testid="summary"><h1>¡Listo, buen trabajo!</h1><div class="card"><strong>' +
      esc(r ? r.name : 'Sesión') + '</strong><div class="muted">' + esc(fmtDate(s.date)) + ' · ' + s.sets.length + ' series hechas</div></div>';
    if (r) {
      // "Sube peso" se calcula sobre esta sesión, ya terminada.
      var sube = subeSet(r, s);
      var names = allExercises(r).filter(function (e) { return sube[e.id]; });
      if (names.length) {
        h += '<h2>Para la próxima</h2><div class="card">' + names.map(function (e) {
          return '<div class="check">' + esc(e.name) + '<span class="badge" data-testid="badge-sube-' + esc(e.id) + '">⬆ Sube peso</span></div>';
        }).join('') + '</div>';
      }
    }
    h += '</div>';
    $app.innerHTML = h;
  }

  function sessionSetsText(s) {
    var groups = {}, order = [];
    s.sets.forEach(function (x) {
      if (!groups[x.exName]) { groups[x.exName] = []; order.push(x.exName); }
      groups[x.exName].push(x);
    });
    return order.map(function (n) {
      return '<div class="check"><span><strong>' + esc(n) + '</strong><br><span class="detail">' + groups[n].map(function (x) {
        var t = x.seconds != null ? fmtN(x.seconds) + ' s' : fmtN(x.reps) + ' reps';
        return (x.weight != null ? fmtN(x.weight) + ' ' + esc(x.unit || '') + ' × ' : '') + t;
      }).map(function (t, i) { return 'R' + (i + 1) + ': ' + t; }).join(' · ') + '</span></span></div>';
    }).join('');
  }

  function topOf(sets) {
    var best = null;
    sets.forEach(function (s) {
      var w = s.weight != null ? s.weight : -1;
      var v = s.seconds != null ? s.seconds : (s.reps || 0);
      if (!best || w > best.w || (w === best.w && v > best.v)) best = { w: w, v: v, s: s };
    });
    return best;
  }

  function spark(vals) {
    if (!vals.length) return '';
    var w = 120, h = 30, p = 3, min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    var rng = max - min || 1;
    var pts = vals.map(function (v, i) {
      var x = vals.length === 1 ? w / 2 : p + i * (w - 2 * p) / (vals.length - 1);
      var y = h - p - (v - min) / rng * (h - 2 * p);
      return [x.toFixed(1), y.toFixed(1)];
    });
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true">' +
      (pts.length > 1 ? '<polyline points="' + pts.map(function (q) { return q.join(','); }).join(' ') + '"/>' : '') +
      '<circle cx="' + pts[pts.length - 1][0] + '" cy="' + pts[pts.length - 1][1] + '" r="3"/></svg>';
  }

  function viewHistory() {
    var h = navBar() + '<h1>Historial</h1>';
    var any = false;
    S.routines.forEach(function (r) {
      var list = sessionsOf(r.id);
      if (!list.length) return;
      any = true;
      h += '<h2>' + esc(r.name) + '</h2>';
      list.forEach(function (s) {
        h += '<a class="card btn" style="display:block;min-height:48px;color:inherit" href="#/historial/' + esc(s.id) + '" data-testid="history-session-' + esc(s.id) + '">' +
          esc(fmtDate(s.date)) + ' · <span class="muted">' + s.sets.length + ' series</span></a>';
      });
      h += progressHtml(r.id);
    });
    if (!any) h += '<p class="muted">Todavía no hay sesiones. ¡A darle!</p>';
    $app.innerHTML = h;
  }

  // Progreso por ejercicio dentro de una rutina (no se mezcla entre rutinas)
  function progressHtml(routineId) {
    var byName = {}, names = [];
    sessionsOf(routineId).slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).forEach(function (s) {
      var g = {};
      s.sets.forEach(function (x) { (g[x.exName] = g[x.exName] || []).push(x); });
      Object.keys(g).forEach(function (n) {
        if (!byName[n]) { byName[n] = []; names.push(n); }
        byName[n].push({ date: s.date, top: topOf(g[n]) });
      });
    });
    if (!names.length) return '';
    var h = '<h3>Progreso</h3>';
    names.sort().forEach(function (n) {
      var pts = byName[n];
      var useW = pts.some(function (p) { return p.top.w >= 0; });
      var vals = pts.map(function (p) { return useW ? Math.max(p.top.w, 0) : p.top.v; });
      h += '<details open class="card" data-testid="progress-' + esc(routineId) + '-' + esc(slug(n)) + '"><summary><span class="grow"><strong>' + esc(n) + '</strong></span>' + spark(vals) + '</summary>';
      pts.slice().reverse().forEach(function (p) {
        var s = p.top.s;
        var t = s.seconds != null ? fmtN(s.seconds) + ' s' : fmtN(s.reps) + ' reps';
        h += '<div class="check" data-testid="progress-row"><span class="grow">' + esc(fmtDate(p.date)) + '</span><span>' +
          (s.weight != null ? esc(fmtN(s.weight) + ' ' + (s.unit || '')) + ' × ' : '') + esc(t) + '</span></div>';
      });
      h += '</details>';
    });
    return h;
  }

  function viewSessionDetail(id) {
    var s = sessionById(id);
    if (!s) { location.hash = '#/historial'; return; }
    var r = routineById(s.routineId);
    $app.innerHTML = '<div class="nav"><a class="btn" href="#/historial">← Historial</a></div><h1>' + esc(r ? r.name : 'Sesión') + '</h1>' +
      '<p class="muted">' + esc(fmtDate(s.date)) + '</p><div class="card">' + (sessionSetsText(s) || '<span class="muted">Sin series registradas.</span>') + '</div>' +
      '<button class="btn danger big" data-act="del-session" data-id="' + esc(s.id) + '" data-testid="delete-session-' + esc(s.id) + '">Borrar sesión</button>';
  }

  // ---------- editar ----------
  var E = null; // copia de la rutina en edición

  function viewEditList() {
    var h = navBar() + '<h1>Editar rutinas</h1>';
    S.routines.forEach(function (r) {
      h += '<a class="card btn" style="display:block;color:inherit" href="#/editar/' + esc(r.id) + '" data-testid="edit-' + esc(r.id) + '">' + esc(r.name) + '</a>';
    });
    h += '<button class="btn danger big" data-act="restore" data-testid="edit-restore">Restaurar rutinas originales</button>';
    $app.innerHTML = h;
  }

  function fld(label, path, val, tid, extra) {
    return '<label class="field"><span>' + esc(label) + '</span><input type="text" ' + (extra || '') + ' data-bind="' + esc(path) + '" data-testid="' + esc(tid) + '" value="' + esc(val == null ? '' : val) + '"></label>';
  }

  function viewEdit(id) {
    var r = routineById(id);
    if (!r) { location.hash = '#/editar'; return; }
    if (!E || E.id !== id) E = clone(r);
    var h = '<div class="nav"><a class="btn" href="#/editar">← Rutinas</a></div><h1>Editar</h1>';
    h += fld('Nombre de la rutina', 'name', E.name, 'edit-name');
    h += '<h2>Calentamiento</h2>';
    E.warmup.forEach(function (w, i) {
      h += '<div class="card">' + fld('Nombre', 'warmup.' + i + '.name', w.name, 'edit-warm-name-' + w.id) +
        fld('Detalle', 'warmup.' + i + '.detail', w.detail, 'edit-warm-detail-' + w.id) +
        fld('Nota', 'warmup.' + i + '.note', w.note, 'edit-warm-note-' + w.id) +
        '<button class="btn danger small" data-act="rm-warm" data-i="' + i + '">Quitar</button></div>';
    });
    h += '<button class="btn" data-act="add-warm" data-testid="edit-add-warm">+ Agregar calentamiento</button>';
    E.blocks.forEach(function (b, bi) {
      h += '<h2>Bloque</h2><div class="card">' + fld('Nombre del bloque', 'blocks.' + bi + '.name', b.name, 'edit-block-name-' + b.id) +
        fld('Rondas', 'blocks.' + bi + '.rounds', b.rounds, 'edit-rounds-' + b.id, 'inputmode="numeric"');
      b.exercises.forEach(function (x, xi) {
        var p = 'blocks.' + bi + '.exercises.' + xi + '.';
        h += '<div class="card" style="background:var(--card2)">' + fld('Ejercicio', p + 'name', x.name, 'edit-ex-name-' + x.id) +
          '<label class="field"><span>Tipo</span><select data-bind="' + p + 'type" data-testid="edit-ex-type-' + esc(x.id) + '">' +
          [['weight', 'Peso y reps'], ['bodyweight', 'Peso corporal'], ['time', 'Tiempo']].map(function (o) {
            return '<option value="' + o[0] + '"' + (x.type === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
          }).join('') + '</select></label>' +
          '<div class="grid2">' + fld('Mín', p + 'min', x.min, 'edit-ex-min-' + x.id, 'inputmode="numeric"') +
          fld('Máx', p + 'max', x.max, 'edit-ex-max-' + x.id, 'inputmode="numeric"') + '</div>' +
          '<div class="grid2">' + fld('Peso inicial', p + 'weight', x.weight, 'edit-ex-weight-' + x.id, 'inputmode="decimal"') +
          '<label class="field"><span>Unidad</span><select data-bind="' + p + 'unit" data-testid="edit-ex-unit-' + esc(x.id) + '">' +
          [['', '—'], ['kg', 'kg'], ['lb', 'lb']].map(function (o) {
            return '<option value="' + o[0] + '"' + ((x.unit || '') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
          }).join('') + '</select></label></div>' +
          '<button class="btn danger small" data-act="rm-ex" data-bi="' + bi + '" data-xi="' + xi + '">Quitar ejercicio</button></div>';
      });
      h += '<div class="row wrap"><button class="btn" data-act="add-ex" data-bi="' + bi + '" data-testid="edit-add-ex-' + esc(b.id) + '">+ Ejercicio</button>' +
        '<button class="btn danger" data-act="rm-block" data-bi="' + bi + '">Quitar bloque</button></div></div>';
    });
    h += '<button class="btn" data-act="add-block" data-testid="edit-add-block">+ Agregar bloque</button>';
    h += '<div class="finish"><button class="btn primary big" data-act="save-edit" data-testid="edit-save">Guardar</button></div>';
    $app.innerHTML = h;
  }

  function setPath(obj, path, val) {
    var p = path.split('.');
    for (var i = 0; i < p.length - 1; i++) obj = obj[p[i]];
    obj[p[p.length - 1]] = val;
  }

  function onBind(el) {
    var path = el.getAttribute('data-bind'), v = el.value, last = path.split('.').pop();
    if (['rounds', 'min', 'max'].indexOf(last) >= 0 || last === 'weight') {
      var n = parseNum(v);
      v = Number.isNaN(n) ? v : n;
    } else if (last === 'unit') v = v || null;
    setPath(E, path, v);
  }

  function saveEdit() {
    var errs = [];
    if (!String(E.name).trim()) errs.push('Falta el nombre de la rutina.');
    E.blocks.forEach(function (b) {
      if (!(Number.isInteger(b.rounds) && b.rounds >= 1 && b.rounds <= 10)) errs.push('Rondas de "' + b.name + '": usa un número del 1 al 10.');
      b.exercises.forEach(function (x) {
        if (!String(x.name).trim()) errs.push('Hay un ejercicio sin nombre.');
        if (typeof x.min !== 'number' || typeof x.max !== 'number' || x.min > x.max) errs.push('Rango inválido en "' + x.name + '".');
        if (x.weight != null && x.weight !== '' && typeof x.weight !== 'number') errs.push('Peso inválido en "' + x.name + '".');
      });
    });
    if (errs.length) { toast(errs[0]); return; }
    E.blocks.forEach(function (b) {
      b.exercises.forEach(function (x) {
        if (x.weight === '') x.weight = null;
        if (x.weight != null && !x.unit) x.unit = 'kg';
        if (x.weight == null && x.type === 'weight' && !x.unit) x.unit = 'kg';
      });
    });
    var i = S.routines.findIndex(function (r) { return r.id === E.id; });
    S.routines[i] = clone(E);
    if (save()) { toast('Guardado.'); E = null; location.hash = '#/editar'; }
  }

  // ---------- export / import ----------
  function doExport() {
    var json = JSON.stringify(S, null, 2);
    var name = 'respaldo-ejercicio-' + new Date().toISOString().slice(0, 10) + '.json';
    var blob = new Blob([json], { type: 'application/json' });
    function mark() { try { localStorage.setItem(LASTBK_KEY, new Date().toISOString()); } catch (e) { /* nada */ } if (location.hash === '#/' || location.hash === '') render(); }
    var file;
    try { file = new File([blob], name, { type: 'application/json' }); } catch (e) { file = null; }
    // En iOS instalada (standalone) la descarga con <a download> puede no funcionar: se ofrece el texto.
    function fallback() { if (isStandaloneIOS()) showExportText(json, mark); else downloadBlob(blob, name, mark); }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'Respaldo de ejercicio' }).then(mark).catch(function (err) {
        if (err && err.name !== 'AbortError') fallback();
      });
    } else fallback();
  }
  function isStandaloneIOS() {
    var ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var sa = navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    return ios && sa;
  }
  function showExportText(json, done) {
    var bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = '<div class="modal" role="dialog"><p>Copia este texto y guárdalo (por ejemplo en Notas). Luego podrás pegarlo en «Importar respaldo».</p>' +
      '<textarea readonly rows="8" style="width:100%" data-testid="export-text">' + esc(json) + '</textarea>' +
      '<div class="row"><button class="btn primary" data-testid="export-copy">Copiar</button>' +
      '<button class="btn" data-testid="export-close">Cerrar</button></div></div>';
    document.body.appendChild(bg);
    var ta = bg.querySelector('textarea');
    bg.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.getAttribute('data-testid') === 'export-copy') {
        ta.focus(); ta.select();
        var ok = false;
        try { ok = document.execCommand && document.execCommand('copy'); } catch (er) { /* nada */ }
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(json).then(function () { toast('Copiado.'); }, function () { toast(ok ? 'Copiado.' : 'Selecciona el texto y cópialo.'); });
        else toast(ok ? 'Copiado.' : 'Selecciona el texto y cópialo.');
      } else { document.body.removeChild(bg); }
    });
    done();
  }
  function downloadBlob(blob, name, done) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 1000);
    done();
  }

  function isStr(x) { return typeof x === 'string' && x.length > 0; }
  function isNumOrNull(x) { return x === null || (typeof x === 'number' && isFinite(x)); }
  function validate(st) {
    var ids = {};
    function uniq(id) { if (!isStr(id) || ids[id]) return false; ids[id] = 1; return true; }
    if (!st || typeof st !== 'object' || typeof st.v !== 'number' || st.v > VERSION || st.v < 1) return 'La versión del respaldo no es compatible.';
    if (!Array.isArray(st.routines) || !Array.isArray(st.sessions)) return 'Faltan rutinas o sesiones.';
    var rids = {}, exIds = {};
    for (var i = 0; i < st.routines.length; i++) {
      var r = st.routines[i];
      if (!r || !uniq(r.id) || !isStr(r.name) || !Array.isArray(r.warmup) || !Array.isArray(r.blocks) || !Array.isArray(r.extras)) return 'Una rutina es inválida.';
      rids[r.id] = 1;
      for (var w = 0; w < r.warmup.length; w++) {
        var wi = r.warmup[w];
        if (!wi || !uniq(wi.id) || typeof wi.name !== 'string') return 'Calentamiento inválido en "' + r.name + '".';
      }
      for (var b = 0; b < r.blocks.length; b++) {
        var bl = r.blocks[b];
        if (!bl || !uniq(bl.id) || typeof bl.name !== 'string' || !Number.isInteger(bl.rounds) || bl.rounds < 1 || bl.rounds > 50 || !Array.isArray(bl.exercises)) return 'Bloque inválido en "' + r.name + '".';
        for (var e = 0; e < bl.exercises.length; e++) {
          var x = bl.exercises[e];
          if (!x || !uniq(x.id) || typeof x.name !== 'string') return 'Ejercicio inválido en "' + r.name + '".';
          if (['weight', 'bodyweight', 'time'].indexOf(x.type) < 0) return 'Tipo de ejercicio inválido.';
          if (typeof x.min !== 'number' || typeof x.max !== 'number' || !isFinite(x.min) || !isFinite(x.max) || x.min > x.max) return 'Rango inválido en "' + x.name + '".';
          if (!isNumOrNull(x.weight) || [null, 'kg', 'lb'].indexOf(x.unit) < 0) return 'Peso o unidad inválidos en "' + x.name + '".';
          if (x.seedReps != null && !isNumOrNull(x.seedReps)) return 'Dato inválido en "' + x.name + '".';
          exIds[x.id] = 1;
        }
      }
      for (var xi = 0; xi < r.extras.length; xi++) {
        var xt = r.extras[xi];
        if (!xt || !uniq(xt.id) || typeof xt.title !== 'string' || !Array.isArray(xt.items)) return 'Extras inválidos en "' + r.name + '".';
        for (var ii = 0; ii < xt.items.length; ii++) {
          if (!xt.items[ii] || !uniq(xt.items[ii].id) || typeof xt.items[ii].name !== 'string') return 'Extras inválidos en "' + r.name + '".';
        }
      }
    }
    var sids = {};
    for (var s = 0; s < st.sessions.length; s++) {
      var se = st.sessions[s];
      if (!se || !isStr(se.id) || sids[se.id] || !rids[se.routineId] || typeof se.date !== 'string' || isNaN(new Date(se.date)) ||
        !Array.isArray(se.warmupDone) || !Array.isArray(se.extrasDone) || !Array.isArray(se.sets)) return 'Una sesión es inválida.';
      sids[se.id] = 1;
      for (var k = 0; k < se.sets.length; k++) {
        var t = se.sets[k];
        if (!t || typeof t.exName !== 'string' || !Number.isInteger(t.round) || !isNumOrNull(t.weight) || !isNumOrNull(t.reps) ||
          !isNumOrNull(t.seconds) || [null, undefined, 'kg', 'lb'].indexOf(t.unit) < 0) return 'Una serie es inválida.';
        if (t.unit === undefined) t.unit = null;
      }
    }
    return null;
  }

  function doImport(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast('El archivo es muy grande (máx. 5 MB).'); return; }
    var fr = new FileReader();
    fr.onerror = function () { toast('No se pudo leer el archivo.'); };
    fr.onload = function () { importText(String(fr.result)); };
    fr.readAsText(file);
  }
  function importText(text) {
    var st;
    if (text.length > 5 * 1024 * 1024) { toast('El texto es muy grande (máx. 5 MB).'); return; }
    try { st = JSON.parse(text); } catch (e) { toast('El archivo no es un respaldo válido.'); return; }
    var err = validate(st);
    if (err) { toast(err); return; }
    {
      confirmModal('Este respaldo tiene ' + st.routines.length + ' rutinas y ' + st.sessions.length + ' sesiones. Reemplaza tus datos actuales. ¿Continuar?', 'Importar').then(function (ok) {
        if (!ok) return;
        try { localStorage.setItem(BACKUP_KEY, JSON.stringify(S)); } catch (e) { /* si no cabe, seguimos */ }
        S = migrate(st);
        D = null; E = null; saveDraftNow();
        if (save()) { toast('Respaldo importado.'); if (location.hash && location.hash !== '#/') location.hash = '#/'; else render(); }
      });
    }
  }

  // ---------- router ----------
  function render() {
    var parts = (location.hash || '#/').replace(/^#\/?/, '').split('/');
    var a = parts[0], b = parts[1] ? decodeURIComponent(parts[1]) : null;
    window.scrollTo(0, 0);
    if (a === '') viewHome();
    else if (a === 'sesion' && b) viewSession(b);
    else if (a === 'resumen' && b) viewSummary(b);
    else if (a === 'historial') b ? viewSessionDetail(b) : viewHistory();
    else if (a === 'editar') b ? viewEdit(b) : viewEditList();
    else location.hash = '#/';
  }
  window.addEventListener('hashchange', render);

  // ---------- eventos ----------
  $app.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');
    var id = el.getAttribute('data-id');
    var bi = +el.getAttribute('data-bi'), xi = +el.getAttribute('data-xi'), i = +el.getAttribute('data-i');
    if (act === 'start') {
      if (D && D.routineId !== id) {
        confirmModal('Ya tienes una sesión en curso. ¿Descartarla y empezar una nueva?', 'Empezar nueva').then(function (ok) {
          if (ok) { D = null; saveDraftNow(); location.hash = '#/sesion/' + id; }
        });
      } else location.hash = '#/sesion/' + id;
    } else if (act === 'tick') tickSet(el);
    else if (act === 'finish') finishSession();
    else if (act === 'export') doExport();
    else if (act === 'import-text') importText(document.querySelector('[data-testid="import-text"]').value);
    else if (act === 'import') document.getElementById('import-file').click();
    else if (act === 'del-session') {
      confirmModal('¿Borrar esta sesión? No se puede deshacer.', 'Borrar').then(function (ok) {
        if (!ok) return;
        S.sessions = S.sessions.filter(function (s) { return s.id !== id; });
        save(); location.hash = '#/historial';
      });
    } else if (act === 'restore') {
      confirmModal('Se reemplazan tus rutinas por las originales. Tu historial se conserva. ¿Continuar?', 'Restaurar').then(function (ok) {
        if (!ok) return;
        S.routines = clone(window.SEED_ROUTINES); E = null;
        if (D) { D = null; saveDraftNow(); }
        save(); toast('Rutinas restauradas.'); render();
      });
    } else if (E) {
      if (act === 'add-warm') E.warmup.push({ id: uid('w'), name: 'Nuevo', detail: '', note: '' });
      else if (act === 'rm-warm') E.warmup.splice(i, 1);
      else if (act === 'add-block') E.blocks.push({ id: uid('b'), name: 'Superserie ' + String.fromCharCode(65 + E.blocks.length), rounds: 3, exercises: [] });
      else if (act === 'rm-block') E.blocks.splice(bi, 1);
      else if (act === 'add-ex') E.blocks[bi].exercises.push({ id: uid('e'), name: 'Nuevo ejercicio', type: 'weight', min: 8, max: 12, weight: null, unit: 'kg', seedReps: null, seedNote: null });
      else if (act === 'rm-ex') E.blocks[bi].exercises.splice(xi, 1);
      else if (act === 'save-edit') { saveEdit(); return; }
      else return;
      viewEdit(E.id);
    }
  });

  $app.addEventListener('input', function (e) {
    var el = e.target;
    if (el.hasAttribute('data-bind') && E) { onBind(el); return; }
    var field = el.getAttribute('data-in');
    if (!field || !D) return;
    var set = el.closest('.set'), row = set && D.rows[set.getAttribute('data-key')];
    if (!row) return;
    var n = parseNum(el.value);
    el.classList.toggle('bad', Number.isNaN(n));
    row[field] = Number.isNaN(n) ? null : n;
    saveDraftSoon();
  });

  $app.addEventListener('change', function (e) {
    var el = e.target;
    if (el.hasAttribute('data-bind') && E) { onBind(el); return; }
    if (el.id === 'import-file') { doImport(el.files[0]); el.value = ''; return; }
    var kind = el.getAttribute('data-chk');
    if (!kind || !D) return;
    var list = kind === 'warmup' ? D.warmupDone : D.extrasDone, id = el.getAttribute('data-id');
    var idx = list.indexOf(id);
    if (el.checked && idx < 0) list.push(id);
    if (!el.checked && idx >= 0) list.splice(idx, 1);
    el.closest('.check').classList.toggle('done', el.checked);
    saveDraftNow();
  });

  // ---------- SW ----------
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      reg.addEventListener('updatefound', function () {
        var nw = reg.installing;
        if (nw) nw.addEventListener('statechange', function () {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('Hay versión nueva. Cierra y abre la app.');
        });
      });
    }).catch(function () { /* sin SW, la app sigue funcionando */ });
  }

  render();
})();
