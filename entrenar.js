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

async function cargarLeitner() {
    const g = gen, msg = $id('leitner-msg');
    leitnerUI('mensaje');
    if (esVisitante()) {
        msg.textContent = 'Inicia sesión con tu cuenta de Google para que el método Leitner guarde tu progreso.';
        return;
    }
    msg.textContent = 'Cargando tus fichas...';
    try {
        const d = await apiGet({ action: 'getLeitner', email: emailActual() });
        if (g !== gen) return;
        if (d.error) throw new Error(d.error);
        leitner.todas = d.tarjetas || [];
        leitner.resumen = d.resumen || { total: 0, pendientes: 0, cajas: {} };
        cargado.leitner = true;
        poblarFiltroLeitner();
        aplicarFiltroLeitner();
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

async function responderLeitner(acierto) {
    const c = leitner.cola[leitner.idx];
    if (!c) return;
    const botones = $id('leitner-actions').querySelectorAll('button');
    botones.forEach(b => b.disabled = true);
    const g = gen;
    try {
        if (!c.repaso) { // el repaso rápido de una ficha fallada no vuelve a mover de caja
            const r = await apiPost({ action: 'leitnerResponder', email: emailActual(), id: c.id, acierto });
            if (g !== gen) return;
            if (r.status !== 'success') throw new Error(r.message || 'No se pudo guardar');
            const cajas = leitner.resumen.cajas;
            cajas[c.caja] = Math.max(0, (cajas[c.caja] || 1) - 1);
            cajas[r.caja] = (cajas[r.caja] || 0) + 1;
            renderCajasLeitner();
            if (!acierto) leitner.cola.push(Object.assign({}, c, { repaso: true })); // la verás de nuevo al final
        }
        leitner.idx++;
        mostrarFichaLeitner();
    } catch (e) {
        mostrarToast('⚠️ ' + e.message, 'info');
    }
    botones.forEach(b => b.disabled = false);
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
    const g = gen, cloud = $id('kims-cloud');
    cloud.textContent = 'Cargando sets...';
    try {
        const d = await apiGet({ sheet: 'Kim' });
        if (g !== gen) return;
        if (!Array.isArray(d)) throw new Error(d && d.error ? d.error : 'sin datos');
        kims.sets = d.map(normalizarKim).filter(s => s.elementos.length >= 3);
        cargado.kims = true;
        siguienteSetKim();
    } catch (e) {
        if (g === gen) cloud.textContent = 'No hay sets de Kim\'s Game para esta materia todavía.';
    }
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
