// entrenar.js - Práctica inteligente: Leitner, Kim's Game y Tutor IA (por materia)
// Depende de mateuna.js / materias.js (apiUrl, materiaActiva, getMateriaActual, esc, $id, mostrarToast, currentUser)

let tabEntrenar = 'leitner';
let gen = 0; // sube al cambiar de materia: descarta respuestas lentas de la materia anterior
const cargado = { leitner: false, kims: false, chat: false };

const TAB_BASE = 'px-4 py-2 rounded-xl font-medium text-sm transition shrink-0 ';
const TAB_ON = TAB_BASE + 'bg-blue-900 text-white shadow-sm';
const TAB_OFF = TAB_BASE + 'bg-slate-100 text-slate-700 hover:bg-slate-200';

function emailActual() {
    return (typeof currentUser !== 'undefined' && currentUser && currentUser.email) || localStorage.getItem('mateuna_user_email') || '';
}
function esVisitante() {
    const e = emailActual();
    return !e || e.indexOf('offline') > -1;
}
async function apiGet(params) {
    const qs = new URLSearchParams(Object.assign({ materia: materiaActiva }, params));
    const r = await fetch(`${apiUrl()}?${qs}`);
    return r.json();
}
async function apiPost(body) {
    const r = await fetch(apiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ materia: materiaActiva }, body))
    });
    return r.json();
}
// Fórmulas LaTeX ($...$) dentro de fichas, sets y mensajes
function mj(el) {
    if (el && window.MathJax && typeof MathJax.typesetPromise === 'function') MathJax.typesetPromise([el]).catch(() => {});
}
function norm(t) {
    return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}


// =====================================================================
//  MODO SIN CONEXIÓN (Leitner y Kim's Game)
//  - Fichas y sets: se guardan en el dispositivo cada vez que se cargan con internet.
//    Si nunca se abrió con internet, se leen de ./leitner/<materia>.csv y ./kim/<materia>.csv
//  - Progreso Leitner: se calcula y guarda en el dispositivo; las respuestas dadas sin
//    conexión se encolan y se envían a la hoja cuando vuelve internet.
// =====================================================================
// ==== OFFLINE-HELPERS ====
const INTERVALOS_LEITNER = [0, 1, 3, 7, 15, 30]; // igual que en mateAPP.gs: días de espera según la caja (1..5)
const LS_OUTBOX = 'mateuna_leitner_outbox';
const LS_CARTAS = m => 'mateuna_lcards_' + m;
const LS_PROG = (m, e) => 'mateuna_lprog_' + m + '_' + e;
const LS_KIM = m => 'mateuna_kim_' + m;

function leerLS(k, def) { try { const v = JSON.parse(localStorage.getItem(k)); return (v === null || v === undefined) ? def : v; } catch (e) { return def; } }
function guardarLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function pad2(n) { return String(n).padStart(2, '0'); }
function isoDe(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function hoyISO() { return isoDe(new Date()); }
function sumarDias(iso, n) { const p = iso.split('-').map(Number); return isoDe(new Date(p[0], p[1] - 1, p[2] + n)); }
function conTimeout(promesa, ms) { return Promise.race([promesa, new Promise((_, rej) => setTimeout(() => rej(new Error('tiempo agotado')), ms))]); }
function sinConexion() { return typeof navigator !== 'undefined' && navigator.onLine === false; }

// CSV con comillas, comas y saltos de línea dentro de campos
function parseCSV(texto) {
    const filas = []; let fila = [], celda = '', comillas = false;
    const t = String(texto || '').replace(/^\uFEFF/, '');
    for (let i = 0; i < t.length; i++) {
        const c = t[i];
        if (comillas) {
            if (c === '"') { if (t[i + 1] === '"') { celda += '"'; i++; } else comillas = false; }
            else celda += c;
        } else if (c === '"') comillas = true;
        else if (c === ',') { fila.push(celda); celda = ''; }
        else if (c === '\n') { fila.push(celda); filas.push(fila); fila = []; celda = ''; }
        else if (c !== '\r') celda += c;
    }
    if (celda !== '' || fila.length) { fila.push(celda); filas.push(fila); }
    return filas;
}
function csvAObjetos(texto) {
    const f = parseCSV(texto).filter(r => r.some(x => String(x).trim() !== ''));
    if (f.length < 2) return [];
    const h = f[0].map(x => String(x).trim());
    return f.slice(1).map(r => { const o = {}; h.forEach((k, i) => { o[k] = r[i] === undefined ? '' : r[i]; }); return o; });
}
function valorCampo(r, nombre) {
    const k = Object.keys(r).find(x => x.trim().toLowerCase() === nombre);
    return k ? String(r[k]) : '';
}
async function cargarCSV(url) {
    try { const r = await fetch(url); if (!r.ok) return []; return csvAObjetos(await r.text()); } catch (e) { return []; }
}
async function cartasDesdeCSV(materia) {
    const filas = await cargarCSV('./leitner/' + materia + '.csv');
    return filas.map(r => ({
        id: valorCampo(r, 'id').trim(), objetivo: valorCampo(r, 'objetivo').trim(),
        anverso: valorCampo(r, 'anverso'), reverso: valorCampo(r, 'reverso')
    })).filter(c => c.id && c.anverso.trim());
}

// Misma regla que el servidor: acierta -> sube una caja; falla -> vuelve a la caja 1
function aplicarRespuestaLocal(prog, id, acierto, fechaISO) {
    const actual = prog[id] ? (parseInt(prog[id].caja) || 1) : 1;
    const nueva = acierto ? Math.min(actual + 1, 5) : 1;
    prog[id] = { caja: nueva, proximo: sumarDias(fechaISO, INTERVALOS_LEITNER[nueva]) };
    return nueva;
}
// Ficha pendiente = nueva o con fecha de repaso vencida (igual que getLeitner del servidor)
function construirColaLeitner(cartas, prog, hoy) {
    const cajas = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const due = [];
    cartas.forEach(c => {
        const p = prog[c.id];
        const caja = p ? Math.min(Math.max(parseInt(p.caja) || 1, 1), 5) : 1;
        cajas[caja]++;
        if (!p || !p.proximo || p.proximo <= hoy) due.push({ id: c.id, objetivo: c.objetivo, anverso: c.anverso, reverso: c.reverso, caja });
    });
    due.sort((a, b) => a.caja - b.caja); // primero las más débiles
    return { todas: due.slice(0, 40), resumen: { total: cartas.length, pendientes: due.length, cajas } };
}
// ==== FIN OFFLINE-HELPERS ====

function leerOutbox() { return leerLS(LS_OUTBOX, []); }
function pendientesLeitner(materia, email) { return leerOutbox().filter(ev => ev.materia === materia && ev.email === email).length; }

let vaciandoLeitner = false;
async function vaciarOutboxLeitner() {
    if (vaciandoLeitner || sinConexion()) return;
    const cola = leerOutbox();
    if (!cola.length) return;
    vaciandoLeitner = true;
    const resto = [];
    try {
        for (const ev of cola) {
            try {
                const r = await conTimeout(apiPost(Object.assign({ action: 'leitnerResponder' }, ev)), 15000);
                if (r && r.status === 'success') continue;
                if (r && /inicia sesi/i.test(String(r.message || ''))) continue; // nunca se podrá guardar: se descarta
                resto.push(ev);
            } catch (e) { resto.push(ev); }
        }
    } finally {
        const nuevos = leerOutbox().slice(cola.length); // respuestas dadas mientras se enviaba
        guardarLS(LS_OUTBOX, resto.concat(nuevos));
        vaciandoLeitner = false;
    }
}

// Devuelve { cartas, prog, email, visitante, materia, conRed }: usa internet si hay; si no, lo guardado; si no, el CSV
async function sincronizarLeitner() {
    const materia = materiaActiva, visitante = esVisitante();
    const email = visitante ? 'visitante' : emailActual().toLowerCase();
    let cartas = leerLS(LS_CARTAS(materia), null);
    let prog = leerLS(LS_PROG(materia, email), {});
    let conRed = false;
    if (!sinConexion()) {
        if (!visitante) await vaciarOutboxLeitner();
        try {
            const params = { action: 'getLeitnerSync' };
            if (!visitante) params.email = email;
            const d = await conTimeout(apiGet(params), 12000);
            if (d && Array.isArray(d.cartas) && !d.error) {
                conRed = true;
                cartas = d.cartas;
                guardarLS(LS_CARTAS(materia), cartas);
                // el servidor manda solo si no quedan respuestas pendientes de enviar
                if (!visitante && pendientesLeitner(materia, email) === 0) { prog = d.progreso || {}; guardarLS(LS_PROG(materia, email), prog); }
            }
        } catch (e) { /* sin red o servidor lento: se usa lo guardado */ }
    }
    if (!cartas || !cartas.length) cartas = await cartasDesdeCSV(materia);
    return { cartas: cartas || [], prog, email, visitante, materia, conRed };
}

// Deja guardado en el dispositivo lo necesario para estudiar sin internet
async function precalentarOffline() {
    if (sinConexion()) return;
    try {
        const d = await conTimeout(apiGet({ sheet: 'Kim' }), 12000);
        if (Array.isArray(d) && d.length) guardarLS(LS_KIM(materiaActiva), d);
    } catch (e) {}
    try { await sincronizarLeitner(); } catch (e) {}
}
window.addEventListener('online', () => { vaciarOutboxLeitner(); precalentarOffline(); });
window.addEventListener('load', () => setTimeout(() => { vaciarOutboxLeitner(); precalentarOffline(); }, 4000));

function abrirTabEntrenar(tab) {
    if (tab) tabEntrenar = tab;
    ['leitner', 'kims', 'chat', 'quiz'].forEach(t => {
        $id('pane-' + t)?.classList.toggle('hidden', t !== tabEntrenar);
        const b = $id('tab-' + t);
        if (b) b.className = t === tabEntrenar ? TAB_ON : TAB_OFF;
    });
    if (tabEntrenar === 'leitner' && !cargado.leitner) cargarLeitner();
    if (tabEntrenar === 'kims' && !cargado.kims) cargarKims();
    if (tabEntrenar === 'chat' && !cargado.chat) iniciarChat();
}

// Se llama desde cambiarMateria(): limpia todo lo de la materia anterior
function resetEntrenamiento() {
    gen++;
    cargado.leitner = cargado.kims = cargado.chat = false;
    leitner = { todas: [], cola: [], idx: 0, filtro: '', resumen: null };
    kims = { sets: [], actual: null, ocultas: [], ultimoId: null };
    clearInterval(kimTimer);
    chat = { hist: [], enviando: false };
    const m = $id('leitner-msg'); if (m) m.textContent = 'Cargando...';
    const sb = $id('chat-send'); if (sb) sb.disabled = false;
    setTimeout(() => { if (typeof precalentarOffline === 'function') precalentarOffline(); }, 800);
}

// =====================================================================
//  LEITNER (el progreso se guarda por alumno en la hoja LeitnerProgreso)
// =====================================================================
let leitner = { todas: [], cola: [], idx: 0, filtro: '', resumen: null };

function leitnerUI(estado) {
    // estado: 'ficha' | 'mensaje'
    const ficha = estado === 'ficha';
    $id('leitner-question').classList.toggle('hidden', !ficha);
    $id('leitner-answer-box').classList.add('hidden');
    $id('leitner-actions').classList.add('hidden');
    $id('leitner-flip').classList.toggle('hidden', !ficha);
    $id('leitner-msg').classList.toggle('hidden', ficha);
}

function recalcularLeitner() {
    const b = leitner.base;
    const r = construirColaLeitner(b.cartas, b.prog, hoyISO());
    leitner.todas = r.todas;
    leitner.resumen = r.resumen;
}

async function cargarLeitner() {
    const g = gen, msg = $id('leitner-msg');
    leitnerUI('mensaje');
    msg.textContent = 'Cargando tus fichas...';
    try {
        const base = await sincronizarLeitner();
        if (g !== gen) return;
        leitner.base = base;
        recalcularLeitner();
        cargado.leitner = true;
        poblarFiltroLeitner();
        aplicarFiltroLeitner();
        if (base.visitante) mostrarToast('👤 Modo visitante: tu avance Leitner se guarda solo en este dispositivo.', 'info');
        else if (sinConexion() || !base.conRed) mostrarToast('📴 Sin conexión: puedes estudiar; tu avance se enviará cuando vuelva internet.', 'info');
    } catch (e) {
        if (g === gen) msg.textContent = 'No se pudieron cargar las fichas: ' + e.message;
    }
}

function poblarFiltroLeitner() {
    const sel = $id('leitner-obj-filter');
    const objs = [...new Set(leitner.todas.map(c => c.objetivo).filter(Boolean))]
        .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
    sel.innerHTML = '<option value="">Todos los objetivos</option>' + objs.map(o => `<option value="${esc(o)}">Objetivo ${esc(o)}</option>`).join('');
    sel.value = leitner.filtro;
    sel.classList.toggle('hidden', objs.length < 2);
}

function leitnerFiltrar() {
    leitner.filtro = $id('leitner-obj-filter').value;
    aplicarFiltroLeitner();
}

function aplicarFiltroLeitner() {
    leitner.cola = leitner.todas.filter(c => !leitner.filtro || c.objetivo === leitner.filtro);
    leitner.idx = 0;
    renderCajasLeitner();
    mostrarFichaLeitner();
}

function renderCajasLeitner() {
    const cajas = (leitner.resumen && leitner.resumen.cajas) || {};
    $id('leitner-boxes').innerHTML = [1, 2, 3, 4, 5].map(n => `
        <div class="flex-1 rounded-xl bg-slate-50 border border-slate-100 py-2">
            <div class="text-[10px] uppercase tracking-wide text-slate-400">Caja ${n}</div>
            <div class="text-lg font-bold text-blue-900">${cajas[n] || 0}</div>
        </div>`).join('');
}

function mostrarFichaLeitner() {
    const msg = $id('leitner-msg'), badge = $id('leitner-box-badge'), cnt = $id('leitner-counter');
    if (leitner.idx >= leitner.cola.length) {
        leitnerUI('mensaje');
        const hayFichas = leitner.resumen && leitner.resumen.total > 0;
        msg.textContent = hayFichas
            ? '🎉 ¡Listo! No tienes más fichas por repasar ahora. Vuelve mañana: el sistema te las irá programando.'
            : 'Esta materia todavía no tiene fichas Leitner cargadas.';
        badge.textContent = hayFichas ? 'Completado' : 'Leitner';
        cnt.textContent = '';
        return;
    }
    const c = leitner.cola[leitner.idx];
    leitnerUI('ficha');
    badge.textContent = c.repaso ? 'Repaso rápido' : `Caja ${c.caja}`;
    cnt.textContent = `Ficha ${leitner.idx + 1} de ${leitner.cola.length}`;
    $id('leitner-question').textContent = c.anverso;
    $id('leitner-answer').textContent = c.reverso;
    mj($id('leitner-question'));
}

function voltearLeitner() {
    $id('leitner-answer-box').classList.remove('hidden');
    $id('leitner-actions').classList.remove('hidden');
    $id('leitner-flip').classList.add('hidden');
    mj($id('leitner-answer'));
}

function responderLeitner(acierto) {
    const c = leitner.cola[leitner.idx];
    if (!c || !leitner.base) return;
    if (!c.repaso) { // el repaso rápido de una ficha fallada no vuelve a mover de caja
        const b = leitner.base, ts = hoyISO(), cajaAntes = c.caja;
        const nueva = aplicarRespuestaLocal(b.prog, c.id, acierto, ts);
        guardarLS(LS_PROG(b.materia, b.email), b.prog);
        if (!b.visitante) {
            const out = leerOutbox();
            out.push({ materia: b.materia, email: b.email, id: c.id, acierto: !!acierto, ts: ts });
            guardarLS(LS_OUTBOX, out);
            vaciarOutboxLeitner(); // en segundo plano; sin red queda en la cola
        }
        const cajas = leitner.resumen.cajas;
        cajas[cajaAntes] = Math.max(0, (cajas[cajaAntes] || 1) - 1);
        cajas[nueva] = (cajas[nueva] || 0) + 1;
        renderCajasLeitner();
        if (!acierto) leitner.cola.push(Object.assign({}, c, { repaso: true })); // la verás de nuevo al final
    }
    leitner.idx++;
    mostrarFichaLeitner();
}

// =====================================================================
//  KIM'S GAME (memoriza una nube de conceptos y adivina los que faltan)
// =====================================================================
let kims = { sets: [], actual: null, ocultas: [], ultimoId: null };
let kimTimer = null;
const CHIP = 'px-3 py-1.5 rounded-full text-sm font-medium border ';
const CHIP_OK = CHIP + 'bg-blue-50 text-blue-900 border-blue-100';
const CHIP_FALTA = CHIP + 'bg-amber-100 text-amber-800 border-amber-300 border-dashed';

function normalizarKim(r) {
    const get = (k) => {
        const hit = Object.keys(r).find(x => x.trim().toLowerCase() === k);
        return hit ? String(r[hit]).trim() : '';
    };
    const raw = get('elementos');
    const sep = raw.indexOf(';') > -1 ? ';' : ','; // usa ; si algún concepto lleva comas (ej. f(x,y))
    return {
        id: get('id'),
        objetivo: get('objetivo'),
        categoria: get('categoria') || get('categoría') || "Kim's Game",
        elementos: raw.split(sep).map(x => x.trim()).filter(Boolean),
        dificultad: Math.max(1, parseInt(get('dificultad')) || 1)
    };
}

async function cargarKims() {
    const g = gen, cloud = $id('kims-cloud'), materia = materiaActiva;
    cloud.textContent = 'Cargando sets...';
    let datos = null;
    if (!sinConexion()) {
        try {
            const d = await conTimeout(apiGet({ sheet: 'Kim' }), 12000);
            if (Array.isArray(d) && d.length) { datos = d; guardarLS(LS_KIM(materia), d); }
        } catch (e) { /* sin red: se usa lo guardado */ }
    }
    if (g !== gen) return;
    if (!datos) datos = leerLS(LS_KIM(materia), null);
    if (!datos || !datos.length) datos = await cargarCSV('./kim/' + materia + '.csv');
    if (g !== gen) return;
    kims.sets = (datos || []).map(normalizarKim).filter(s => s.elementos.length >= 3);
    if (!kims.sets.length) { cloud.textContent = 'No hay sets de Kim\'s Game para esta materia todavía.'; return; }
    cargado.kims = true;
    siguienteSetKim();
}

function chipsKim(elementos, ocultasIdx) {
    const cloud = $id('kims-cloud');
    cloud.innerHTML = '';
    elementos.forEach((txt, i) => {
        const s = document.createElement('span');
        const falta = ocultasIdx && ocultasIdx.indexOf(i) > -1;
        s.className = falta ? CHIP_FALTA : CHIP_OK;
        s.textContent = falta ? '❓ ¿cuál falta?' : txt;
        cloud.appendChild(s);
    });
    mj(cloud);
}

function siguienteSetKim() {
    clearInterval(kimTimer);
    if (!kims.sets.length) { $id('kims-cloud').textContent = 'No hay sets de Kim\'s Game para esta materia todavía.'; return; }
    const candidatos = kims.sets.length > 1 ? kims.sets.filter(s => s.id !== kims.ultimoId) : kims.sets;
    kims.actual = candidatos[Math.floor(Math.random() * candidatos.length)];
    kims.ultimoId = kims.actual.id;
    $id('kims-category-title').textContent = kims.actual.categoria;
    $id('kims-feedback').innerHTML = '';
    $id('kims-next').classList.add('hidden');
    $id('kims-input-section').classList.add('hidden');
    $id('kims-answer').value = '';
    iniciarMemorizacionKim();
}

function iniciarMemorizacionKim() {
    const s = kims.actual;
    chipsKim(s.elementos, null);
    $id('kims-instruccion').textContent = 'Memoriza todos los elementos. Luego te quitaré algunos.';
    $id('kims-timer-display').classList.remove('hidden');
    $id('kims-skip').classList.remove('hidden');
    let t = Math.min(30, Math.max(10, s.elementos.length * 2));
    const txt = $id('kims-timer-count');
    txt.textContent = t;
    clearInterval(kimTimer);
    kimTimer = setInterval(() => {
        t--; txt.textContent = t;
        if (t <= 0) iniciarAdivinanzaKim();
    }, 1000);
}

function kimsYaMeLoSe() { iniciarAdivinanzaKim(); }

function iniciarAdivinanzaKim() {
    clearInterval(kimTimer);
    const s = kims.actual;
    if (!s) return;
    $id('kims-timer-display').classList.add('hidden');
    $id('kims-skip').classList.add('hidden');
    $id('kims-instruccion').textContent = `Faltan ${Math.min(s.dificultad, Math.floor(s.elementos.length / 2))} elemento(s). Escríbelos (separados por coma).`;
    // índices distintos al azar (el original podía repetir el mismo y dejar un hueco como "palabra")
    const n = Math.min(s.dificultad, Math.floor(s.elementos.length / 2));
    const idx = s.elementos.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, n);
    kims.ocultas = idx;
    chipsKim(s.elementos, idx);
    $id('kims-input-section').classList.remove('hidden');
    $id('kims-answer').focus();
}

function verificarKims() {
    const s = kims.actual;
    if (!s || !kims.ocultas.length) return;
    const entrada = norm($id('kims-answer').value);
    let aciertos = 0;
    const detalle = kims.ocultas.map(i => {
        const palabra = s.elementos[i];
        const ok = entrada.length > 0 && entrada.indexOf(norm(palabra)) > -1;
        if (ok) aciertos++;
        return `<li>${ok ? '✅' : '❌'} ${esc(palabra)}</li>`;
    }).join('');
    const total = kims.ocultas.length;
    const fb = $id('kims-feedback');
    fb.className = 'mt-4 text-sm font-semibold ' + (aciertos === total ? 'text-emerald-700' : 'text-rose-700');
    fb.innerHTML = `${aciertos === total ? '🎉 ¡Perfecto!' : `Acertaste ${aciertos} de ${total}.`}<ul class="mt-2 text-left inline-block font-normal">${detalle}</ul>`;
    chipsKim(s.elementos, null);
    kims.ocultas = [];
    $id('kims-input-section').classList.add('hidden');
    $id('kims-next').classList.remove('hidden');
    mj(fb);
}

// =====================================================================
//  TUTOR IA (el prompt y la clave viven en el servidor, no en el navegador)
// =====================================================================
let chat = { hist: [], enviando: false };

function iniciarChat() {
    cargado.chat = true;
    const m = getMateriaActual();
    $id('chat-materia-label').textContent = '· ' + m.nombre;
    const temas = m.temasChat || [];
    $id('chat-temas-chips').innerHTML = temas.map(t =>
        `<button onclick="chatNueva(this.dataset.t)" data-t="${esc(t)}" class="text-xs bg-blue-50 text-blue-900 border border-blue-100 hover:bg-blue-100 px-3 py-1 rounded-full transition">${esc(t)}</button>`).join('');
    chatNueva();
}

function chatNueva(tema) {
    if (typeof tema === 'string') $id('chat-tema').value = tema;
    chat.hist = [];
    $id('chat-messages').innerHTML = '';
    const m = getMateriaActual();
    const t = $id('chat-tema').value.trim();
    burbuja('model', `¡Hola! Soy tu tutor de ${m.nombre}. ${t ? `Trabajemos en: ${t}. ` : ''}Cuéntame qué parte te cuesta o qué ejercicio estás intentando, y vamos paso a paso. Yo te hago preguntas y te doy pistas: la idea es que lo descubras tú.`);
}

function formatearChat(texto) {
    return esc(texto)
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/`([^`]+)`/g, '<code class="bg-slate-100 px-1 rounded">$1</code>');
}

function burbuja(rol, texto, temporal) {
    const cont = $id('chat-messages');
    const d = document.createElement('div');
    d.className = 'max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ' +
        (rol === 'user' ? 'self-end bg-blue-900 text-white' : 'self-start bg-white border border-slate-200 text-slate-800');
    if (temporal) d.classList.add('italic', 'text-slate-400');
    d.innerHTML = rol === 'user' ? esc(texto) : formatearChat(texto);
    cont.appendChild(d);
    cont.scrollTop = cont.scrollHeight;
    if (!temporal) mj(d);
    return d;
}

async function chatEnviar() {
    const input = $id('chat-input');
    const txt = input.value.trim();
    if (!txt || chat.enviando) return;
    if (esVisitante()) { burbuja('model', 'Inicia sesión con tu cuenta de Google para usar el tutor IA.'); return; }

    const g = gen;
    burbuja('user', txt);
    input.value = '';
    chat.hist.push({ role: 'user', text: txt });
    chat.enviando = true;
    $id('chat-send').disabled = true;
    const espera = burbuja('model', 'Pensando…', true);

    try {
        const r = await apiPost({
            action: 'chat',
            email: emailActual(),
            tema: $id('chat-tema').value.trim().slice(0, 120),
            history: chat.hist.slice(-12)
        });
        if (g !== gen) return;
        espera.remove();
        if (r.status !== 'success') throw new Error(r.message || 'El tutor no respondió');
        burbuja('model', r.respuesta);
        chat.hist.push({ role: 'model', text: r.respuesta });
    } catch (e) {
        if (g !== gen) return;
        espera.remove();
        burbuja('model', '⚠️ ' + e.message);
        chat.hist.pop();      // la pregunta no quedó respondida:
        input.value = txt;    // se devuelve al cuadro para reintentar
    } finally {
        if (g === gen) { chat.enviando = false; $id('chat-send').disabled = false; }
    }
}
