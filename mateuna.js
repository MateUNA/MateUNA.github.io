const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzxz5bmHZK2ukteSfVh4fMNT-He7UgpbxLJWKXTv1_OJoqM6lLb1acBVNDG-F6M8GK_/exec";
let currentUser = null;
let selectedAnswerCorrect = null;
let currentObjective = "";
let allQuestions = [];

let sessionSeconds = 0;
let totalStudySeconds = parseInt(localStorage.getItem('mateuna_total_study_seconds')) || 0;
let sessionTimerInterval = null;
let objetivosDisponibles = [];

const siteContent = {    
    ruta: {
        title: "Ruta de Estudio Recomendada",
        html: `
            <p class="text-slate-600 mb-4">Para un estudiante nuevo en la Universidad Nacional Abierta (UNA), adaptarse a la modalidad a distancia es más sencillo si sigues esta ruta de trabajo ordenada:</p>
            <div class="space-y-4">
                <div class="border border-slate-200 p-4 rounded-xl">
                    <h4 class="font-bold text-blue-900 mb-1">1. Conoce las reglas del juego (Plan de Curso e Instructivo Oficial)</h4>
                    <ul class="list-disc list-inside space-y-1 text-slate-600 text-sm">
                        <li><strong>Revisa los enlaces de utilidad:</strong> Antes de empezar, entra en la sección de <strong>Links Importantes</strong> para consultar el Plan de Curso oficial y el blog de Diseño Académico UNA donde se publican las evaluaciones.</li>
                        <li><strong>Entiende la evaluación (Los 2 TSP):</strong> La materia se evalúa mediante dos <strong>Trabajos Sustitutivos de Pruebas (TSP1 y TSP2)</strong>, los cuales evalúan el primer y segundo 50% de los objetivos, respectivamente.</li>
                    </ul>
                </div>
            </div>
        `
    }
};

// --- PARSER Y NORMALIZADOR DE DATOS ---

function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    
    return lines.slice(1).map(line => {
        const values = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || line.split(',');
        const obj = {};
        headers.forEach((header, index) => {
            let val = values[index] ? values[index].trim().replace(/^"|"$/g, '') : '';
            obj[header] = val;
        });
        return obj;
    });
}

function normalizeQuestionsKeys(data) {
    return data.map(q => ({
        Objetivo: String(q.Objetivo || q.objetivo || '').trim(),
        Pregunta: q.Pregunta || q.pregunta || q.question || '',
        Opcion1_Correcta: q.Opcion1_Correcta || q.Opcionl_Correcta || q.correct || '',
        Opcion2_Incorrecta1: q.Opcion2_Incorrecta1 || q.Opcion2_Incorrectal || q.incorrect1 || '',
        Opcion3_Incorrecta2: q.Opcion3_Incorrecta2 || q.incorrect2 || ''
    }));
}

// --- CARGA DE DATOS INSTANTÁNEA (CSV) + SINCRONIZACIÓN EN SEGUNDO PLANO (SHEETS) ---

async function fetchQuestions() {
    const questionTextEl = document.getElementById('question-text');
    let loadedFromLocal = false;

    try {
        const localResponse = await fetch('./preguntas/p_mate1_175.csv');
        if (localResponse.ok) {
            const csvText = await localResponse.text();
            const localData = parseCSV(csvText);
            
            if (localData.length > 0) {
                allQuestions = normalizeQuestionsKeys(localData);
                inicializarObjetivosQuiz(allQuestions);
                loadedFromLocal = true;
            }
        }
    } catch (e) {
        console.warn("No se encontró preguntas.csv local o falló su lectura.", e);
    }

    if (!loadedFromLocal && questionTextEl) {
        questionTextEl.innerText = "Conectando con la base de datos remota...";
    }

    try {
        const response = await fetch(`${WEB_APP_URL}?sheet=Preguntas&materia=${materiaActiva}`);
        const remoteData = await response.json();
        
        if (Array.isArray(remoteData) && remoteData.length > 0) {
            const normalizedRemote = normalizeQuestionsKeys(remoteData);
            
            if (!loadedFromLocal || JSON.stringify(allQuestions) !== JSON.stringify(normalizedRemote)) {
                allQuestions = normalizedRemote;
                inicializarObjetivosQuiz(allQuestions);
            }
        }
    } catch (err) {
        console.error("Error al consultar Google Sheets en segundo plano:", err);
        if (!loadedFromLocal && questionTextEl) {
            questionTextEl.innerText = "Error de conexión al cargar las preguntas.";
        }
    }
}

// --- GESTIÓN DE INTERFAZ Y QUIZ ---

function decodeJwtResponse(token) {
    let base64Url = token.split('.')[1];
    let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    let jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
}

function renderAppUI(userData) {
    document.getElementById('login-prompt')?.classList.add('hidden');
    document.getElementById('auth-section')?.classList.add('hidden');
    document.getElementById('user-info')?.classList.remove('hidden');
    document.getElementById('app-container')?.classList.remove('hidden');
    
    const userNameElem = document.getElementById('user-name');
    if (userNameElem) {
        userNameElem.innerText = `Hola, ${userData.name}`;
        userNameElem.dataset.email = userData.email;
        // Guardar también el correo separado para las estadísticas
        localStorage.setItem('mateuna_user_email', userData.email);
    }
    const menuBtn = document.getElementById('mobile-menu-btn');
    if (menuBtn) menuBtn.classList.remove('hidden');
}

function handleCredentialResponse(response) {
    const responsePayload = decodeJwtResponse(response.credential);
    currentUser = {
        name: responsePayload.name,
        email: responsePayload.email
    };
    
    const userData = {
        name: responsePayload.name,
        email: responsePayload.email,
        picture: responsePayload.picture
    };
    localStorage.setItem('mateuna_user', JSON.stringify(userData));

    renderAppUI(userData);
    startSessionTimer();    
    fetchQuestions();
}

function startSessionTimer() {
    sessionSeconds = 0;
    if (sessionTimerInterval) clearInterval(sessionTimerInterval);
    
    sessionTimerInterval = setInterval(() => {
        sessionSeconds++;
        totalStudySeconds++;
        
        if (totalStudySeconds % 10 === 0) {
            localStorage.setItem('mateuna_total_study_seconds', totalStudySeconds);
        }
        
        updateTimersDisplay();
    }, 1000);
}

function updateTimersDisplay() {
    const sessMin = Math.floor(sessionSeconds / 60).toString().padStart(2, '0');
    const sessSec = (sessionSeconds % 60).toString().padStart(2, '0');
    const sessionElem = document.getElementById('session-timer');
    if (sessionElem) sessionElem.innerText = `⏱️ Sesión: ${sessMin}:${sessSec}`;

    const totalHours = Math.floor(totalStudySeconds / 3600);
    const totalMins = Math.floor((totalStudySeconds % 3600) / 60);
    const totalElem = document.getElementById('total-study-timer');
    if (totalElem) {
        totalElem.innerText = totalHours > 0 
            ? `📚 Total: ${totalHours}h ${totalMins}m` 
            : `📚 Total: ${totalMins}m`;
    }
}

// Solución para ocultar/mostrar sin conflictos de Tailwind
function toggleTimersVisibility() {
    const container = document.getElementById('timers-container');
    if (container) {
        container.classList.toggle('custom-hidden-timer');
        if (container.style.display === 'none') {
            container.style.display = '';
        } else {
            container.style.display = 'none';
        }
    }
}

function inicializarObjetivosQuiz(preguntas) {
    objetivosDisponibles = [...new Set(preguntas.map(p => p.Objetivo || p.objetivo || p.obj))].sort();
    
    const container = document.getElementById('objectives-tabs-container');
    if (!container) return;

    if (objetivosDisponibles.length === 0) {
        container.innerHTML = '<span class="text-xs text-slate-400 p-2">No hay objetivos disponibles</span>';
        return;
    }

    if (!currentObjective || !objetivosDisponibles.includes(currentObjective)) {
        currentObjective = objetivosDisponibles[0];
    }

    container.innerHTML = objetivosDisponibles.map(obj => `
        <button onclick="switchObjective('${obj}')" id="btn-obj-${obj}" 
            class="px-4 py-2 rounded-xl font-medium text-sm transition shrink-0 ${
                obj === currentObjective 
                ? 'bg-blue-900 text-white shadow-sm' 
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }">
            Obj. ${obj}
        </button>
    `).join('');

    loadQuestionsForCurrentObjective();
}

function switchObjective(objNum) {
    currentObjective = objNum;
    objetivosDisponibles.forEach(o => {
        const btn = document.getElementById(`btn-obj-${o}`);
        if (btn) {
            if (o === objNum) {
                btn.className = "px-4 py-2 rounded-xl font-medium text-sm transition shrink-0 bg-blue-900 text-white shadow-sm";
            } else {
                btn.className = "px-4 py-2 rounded-xl font-medium text-sm transition shrink-0 bg-slate-100 text-slate-700 hover:bg-slate-200";
            }
        }
    });
    loadQuestionsForCurrentObjective();
}

function loadQuestionsForCurrentObjective() {
    const currentObjNormalized = String(currentObjective).replace(',', '.').trim();

    const filtered = allQuestions.filter(q => {
        if (!q.Objetivo) return false;
        const objStr = String(q.Objetivo).replace(',', '.').trim().replace(/^obj\.?\s*/i, '');
        return objStr === currentObjNormalized;
    });

    const titleEl = document.getElementById('obj-title');
    if (titleEl) titleEl.innerText = `OBJETIVO ${currentObjective}`;
    
    const container = document.getElementById('options-container');
    if (container) container.innerHTML = "";
    
    const resultContainer = document.getElementById('result-container');
    if (resultContainer) resultContainer.classList.add('hidden');

    const questionTextEl = document.getElementById('question-text');

    if (filtered.length === 0) {
        if (questionTextEl) questionTextEl.innerText = "No hay preguntas disponibles para este objetivo actualmente.";
        const submitBtn = document.getElementById('submit-btn');
        if (submitBtn) submitBtn.style.display = 'none';
        return;
    }

    const qData = filtered[Math.floor(Math.random() * filtered.length)];
    if (questionTextEl) questionTextEl.innerText = qData.Pregunta;

    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) {
        submitBtn.style.display = 'block';
        submitBtn.disabled = true;
        submitBtn.className = "w-full bg-slate-200 text-slate-400 font-medium py-3 rounded-xl transition cursor-not-allowed";
    }

    let optionsArray = [
        { text: qData.Opcion1_Correcta, correct: true },
        { text: qData.Opcion2_Incorrecta1, correct: false },
        { text: qData.Opcion3_Incorrecta2, correct: false }
    ].filter(opt => opt.text && String(opt.text).trim() !== "");

    for (let i = optionsArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [optionsArray[i], optionsArray[j]] = [optionsArray[j], optionsArray[i]];
    }

    if (container) {
        optionsArray.forEach((opt) => {
            const btn = document.createElement('button');
            btn.className = "w-full text-left p-4 rounded-xl border border-slate-200 hover:border-blue-500 transition option-btn my-2";
            btn.innerText = opt.text;
            btn.onclick = () => selectOption(btn, opt.correct);
            container.appendChild(btn);
        });
    }

    selectedAnswerCorrect = null;
}

function selectOption(selectedBtn, isCorrect) {
    selectedAnswerCorrect = isCorrect;

    document.querySelectorAll('#options-container button').forEach(btn => {
        btn.classList.remove('border-blue-900', 'bg-blue-50', 'ring-2', 'ring-blue-500');
        btn.classList.add('border-slate-200');
    });

    selectedBtn.classList.remove('border-slate-200');
    selectedBtn.classList.add('border-blue-900', 'bg-blue-50', 'ring-2', 'ring-blue-500');

    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.className = "w-full bg-blue-900 hover:bg-blue-800 text-white font-medium py-3 rounded-xl transition cursor-pointer";
    }
}

function submitQuiz() {
    if (selectedAnswerCorrect === null) return;

    const payload = {
        email: currentUser ? currentUser.email : "offline@estudiante.una",
        name: currentUser ? currentUser.name : "Estudiante",
        objective: currentObjective,
        isCorrect: selectedAnswerCorrect,
        materia: materiaActiva
    };

    const btn = document.getElementById('submit-btn');
    if (btn) {
        btn.innerText = "Evaluando...";
        btn.disabled = true;
    }

    const isCorrect = selectedAnswerCorrect;

    fetch(WEB_APP_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .catch(err => {
        console.warn("Respuesta guardada solo en modo local.", err);
    })
    .finally(() => {
        showFeedbackResult(isCorrect);
        if (btn) btn.innerText = "Enviar Respuesta";
    });
}

function showFeedbackResult(isCorrect) {
    const resultContainer = document.getElementById('result-container');
    if (!resultContainer) return;

    resultContainer.classList.remove('hidden');

    if (isCorrect) {
        resultContainer.className = "bg-emerald-50 border border-emerald-200 p-6 rounded-2xl text-center my-4";
        resultContainer.innerHTML = `
            <div class="flex items-center justify-center gap-2 mb-2">
                <span class="text-2xl">✅</span>
                <h3 class="text-xl font-bold text-emerald-800">¡Respuesta Correcta!</h3>
            </div>
            <p class="text-emerald-700 text-sm mb-4">Excelente trabajo. Has dominado este ítem.</p>
            <button onclick="loadQuestionsForCurrentObjective()" class="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition shadow-sm">
                Siguiente Pregunta
            </button>
        `;
    } else {
        resultContainer.className = "bg-rose-50 border border-rose-200 p-6 rounded-2xl text-center my-4";
        resultContainer.innerHTML = `
            <div class="flex items-center justify-center gap-2 mb-2">
                <span class="text-2xl">❌</span>
                <h3 class="text-xl font-bold text-rose-800">Respuesta Incorrecta</h3>
            </div>
            <p class="text-rose-700 text-sm mb-4">Revisa el material de estudio e inténtalo nuevamente.</p>
            <button onclick="loadQuestionsForCurrentObjective()" class="bg-rose-600 hover:bg-rose-700 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition shadow-sm">
                Intentar Otra Pregunta
            </button>
        `;
    }
}

function logoutUser() {
    if(sessionTimerInterval) clearInterval(sessionTimerInterval);
    localStorage.removeItem('mateuna_user');
    location.reload();
}

function showSection(sectionKey) {
    const quizView = document.getElementById('view-quiz');
    const dynamicView = document.getElementById('view-dynamic');
    const estadisticasView = document.getElementById('view-estadisticas');
    
    if (window.innerWidth < 768) {
        document.getElementById('sidebar-menu')?.classList.add('hidden');
    }

    document.querySelectorAll('aside button').forEach(btn => {
        btn.classList.remove('bg-blue-50', 'text-blue-900');
        btn.classList.add('text-slate-600', 'hover:bg-slate-50');
    });
    
    const activeBtn = document.getElementById(`nav-${sectionKey}`);
    if (activeBtn) {
        activeBtn.classList.remove('text-slate-600', 'hover:bg-slate-50');
        activeBtn.classList.add('bg-blue-50', 'text-blue-900');
    }     

    // Ocultar todas las vistas principales primero
    if (quizView) quizView.classList.add('hidden');
    if (dynamicView) dynamicView.classList.add('hidden');
    if (estadisticasView) estadisticasView.classList.add('hidden');

    if (sectionKey === 'quiz') {
        quizView?.classList.remove('hidden');
        return;
    } else if (sectionKey === 'estadisticas') {
        estadisticasView?.classList.remove('hidden');
        cargarEstadisticasUsuario();
        return;
    }

    dynamicView?.classList.remove('hidden');

    if (siteContent[sectionKey]) {
        dynamicView.innerHTML = `
            <h2 class="text-xl font-bold text-blue-900 mb-4">${siteContent[sectionKey].title}</h2>
            ${siteContent[sectionKey].html}
        `;
    } else if (sectionKey === 'links') {
        loadSheetDataAsTable('Links', dynamicView, 'Links Importantes de la Universidad');
    } else if (sectionKey === 'notas') {
        loadStudentGradesSheet(dynamicView);
    } else if (sectionKey === 'contacto') {
        loadSheetDataAsTable('Contacto', dynamicView, 'Contacto con Profesores y Asesores');
    } else if (sectionKey === 'examenes') {
        loadSheetDataAsTable('Examenes', dynamicView, 'Fechas de Exámenes y Calendario Oficial');
    } else if (sectionKey === 'clases') {
        loadSheetDataAsTable('Clases', dynamicView, 'Fechas y Horarios de Clases');
    } else if (sectionKey === 'plan') {
        loadPlanCursoDynamic(dynamicView); 
    } else if (sectionKey === 'fundamentacion') {
        loadFundamentacionDynamic(dynamicView);
    } else if (sectionKey === 'viejos') {
        loadSheetDataAsTable('Viejos', dynamicView, 'Archivo de Exámenes Anteriores');
    }
}

async function loadPlanCursoDynamic(container) {
    container.innerHTML = `
        <h2 class="text-xl font-bold text-blue-900 mb-4">Plan de Curso y Ruta de Estudio</h2>
        <p class="text-slate-400 text-sm">Cargando unidades y contenido desde Google Sheets...</p>
    `;

    try {
        const response = await fetch(`${WEB_APP_URL}?action=getPlanCurso&materia=${materiaActiva}`);
        const planData = await response.json();

        if (!planData || planData.length === 0) {
            container.innerHTML = `
                <h2 class="text-xl font-bold text-blue-900 mb-4">Plan de Curso y Ruta de Estudio</h2>
                <p class="text-slate-500 text-sm">No hay unidades cargadas en la pestaña PlanCurso.</p>
            `;
            return;
        }

        let html = `
            <h2 class="text-xl font-bold text-blue-900 mb-4">Plan de Curso y Ruta de Estudio</h2>
            <div class="space-y-4">
        `;

        planData.forEach(item => {
            html += `
                <div class="border border-slate-200 p-4 rounded-xl">
                    <h4 class="font-bold text-blue-900 mb-2">${item.unidad}</h4>
                    <ul class="text-sm text-slate-600 space-y-1.5 list-disc list-inside">
            `;

            item.temas.forEach(temaObj => {
                if (temaObj.link) {
                    html += `
                        <li>
                            <a href="${temaObj.link}" target="_blank" class="text-blue-700 hover:text-blue-900 underline font-medium transition">
                                ${temaObj.texto} ↗
                            </a>
                        </li>
                    `;
                } else {
                    html += `<li>${temaObj.texto}</li>`;
                }
            });

            html += `
                    </ul>
                </div>
            `;
        });

        html += `</div>`;
        container.innerHTML = html;

    } catch (e) {
        console.error("Error al cargar Plan de Curso:", e);
        container.innerHTML = `
            <h2 class="text-xl font-bold text-blue-900 mb-4">Plan de Curso y Ruta de Estudio</h2>
            <p class="text-red-500 text-sm">Error al obtener los datos del Plan de Curso.</p>
        `;
    }
}

async function loadSheetDataAsTable(sheetName, container, title) {
    container.innerHTML = `<h2 class="text-xl font-bold text-blue-900 mb-4">${title}</h2><p class="text-slate-400 text-sm">Cargando datos desde Google Sheets...</p>`;
    try {
        const response = await fetch(`${WEB_APP_URL}?sheet=${sheetName}&materia=${materiaActiva}`);
        const data = await response.json();
        
        if (!data || data.length === 0) {
            container.innerHTML = `<h2 class="text-xl font-bold text-blue-900 mb-4">${title}</h2><p class="text-slate-500 text-sm">No hay registros cargados en esta sección todavía.</p>`;
            return;
        }

        let html = `<h2 class="text-xl font-bold text-blue-900 mb-4">${title}</h2><div class="overflow-x-auto"><table class="w-full text-left text-sm text-slate-600"><thead class="bg-slate-50 text-slate-700 uppercase text-xs"><tr>`;
        
        const headers = Object.keys(data[0]);
        headers.forEach(h => html += `<th class="p-3">${h}</th>`);
        html += `</tr></thead><tbody>`;

        data.forEach(row => {
            html += `<tr class="border-b border-slate-100">`;
            headers.forEach(h => {
                let val = row[h] || '';
                if(typeof val === 'string' && val.startsWith('http')) {
                    val = `<a href="${val}" target="_blank" class="text-blue-600 underline">Ver Enlace / PDF</a>`;
                }
                html += `<td class="p-3">${val}</td>`;
            });
            html += `</tr>`;
        });
        html += `</tbody></table></div>`;
        container.innerHTML = html;
    } catch (e) {
        console.error(e);
        container.innerHTML = `<h2 class="text-xl font-bold text-blue-900 mb-4">${title}</h2><p class="text-red-500 text-sm">Error al conectar con la base de datos de Google Sheets.</p>`;
    }
}

async function loadStudentGradesSheet(container) {
    const userEmail = (document.getElementById('user-name')?.dataset.email || (currentUser ? currentUser.email : '')).trim().toLowerCase();
    
    container.innerHTML = `
        <h2 class="text-xl font-bold text-blue-900 mb-4">Mis Notas Oficiales</h2>
        <p class="text-slate-400 text-sm mb-4">Cargando tus calificaciones...</p>
    `;

    if (!userEmail) {
        container.innerHTML = `
            <h2 class="text-xl font-bold text-blue-900 mb-4">Mis Notas Oficiales</h2>
            <p class="text-amber-600 bg-amber-50 p-4 rounded-xl border border-amber-200 text-sm">
                Debes iniciar sesión con tu cuenta de Google para ver tu registro de notas.
            </p>
        `;
        return;
    }

    try {
        const response = await fetch(`${WEB_APP_URL}?sheet=Notas&materia=${materiaActiva}`);
        const data = await response.json();

        if (!data || !Array.isArray(data) || data.length === 0) {
            container.innerHTML = `
                <h2 class="text-xl font-bold text-blue-900 mb-4">Mis Notas Oficiales</h2>
                <p class="text-slate-500 text-sm">No hay registros cargados en la planilla de notas aún.</p>
            `;
            return;
        }

        const studentRow = data.find(row => {
            const rowEmail = (row.Correo || row.correo || row.Email || row.email || '').toString().trim().toLowerCase();
            return rowEmail === userEmail;
        });

        if (!studentRow) {
            container.innerHTML = `
                <h2 class="text-xl font-bold text-blue-900 mb-4">Mis Notas Oficiales</h2>
                <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                    <p class="text-slate-700 font-medium mb-1">Estudiante: ${userEmail}</p>
                    <p class="text-slate-500 text-sm">No se encontraron registros de calificaciones asociados a tu correo institucional.</p>
                </div>
            `;
            return;
        }

        const objectivesKeys = Object.keys(studentRow).filter(k => k.toLowerCase().includes('obj') || k.startsWith('Obj'));

        let html = `
            <h2 class="text-xl font-bold text-blue-900 mb-2">Mis Notas Oficiales</h2>
            <div class="bg-blue-50 border border-blue-100 p-4 rounded-2xl mb-6 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <h3 class="font-bold text-blue-900">${studentRow.nombre || studentRow.Nombre || 'Estudiante'}</h3>
                    <p class="text-xs text-blue-700">${userEmail}</p>
                </div>
                <div class="text-right">
                    <span class="text-xs text-slate-500 uppercase font-semibold block">Nota Final</span>
                    <span class="text-2xl font-black text-blue-900">${studentRow.Nota || studentRow.nota || '-'}</span>
                </div>
            </div>

            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm text-slate-600 border-collapse">
                    <thead class="bg-slate-100 text-slate-700 uppercase text-xs">
                        <tr>
                            <th class="p-3 border-b">Objetivo</th>
                            <th class="p-3 border-b text-center">Estatus / Calificación</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        objectivesKeys.forEach(objKey => {
            const gradeVal = studentRow[objKey] !== undefined ? studentRow[objKey] : '-';
            html += `
                <tr class="border-b border-slate-100 hover:bg-slate-50">
                    <td class="p-3 font-medium text-slate-800">${objKey}</td>
                    <td class="p-3 text-center font-bold text-blue-900">${gradeVal}</td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = html;

    } catch (e) {
        console.error(e);
        container.innerHTML = `
            <h2 class="text-xl font-bold text-blue-900 mb-4">Mis Notas Oficiales</h2>
            <p class="text-red-500 text-sm">Ocurrió un error al cargar tus notas desde Google Sheets.</p>
        `;
    }
}

// --- INICIALIZACIÓN DE LA APLICACIÓN ---

window.addEventListener('DOMContentLoaded', () => {
    const savedUser = localStorage.getItem('mateuna_user');
    
    if (savedUser) {
        const userData = JSON.parse(savedUser);
        currentUser = userData;
        renderAppUI(userData);
        startSessionTimer();
        fetchQuestions();
    } else {
        initializeGoogleButton();
        // Cargar en modo visitante offline por defecto para pruebas rápidas si se desea
    }
});

function initializeGoogleButton() {
    if (typeof google !== 'undefined' && google.accounts) {
        google.accounts.id.initialize({
            client_id: "205229444634-85v2gua4tv360jnn02bj5d68uhrb2e85.apps.googleusercontent.com",
            callback: handleCredentialResponse
        });

        const authSection = document.getElementById("auth-section");
        if (authSection) {
            google.accounts.id.renderButton(
                authSection,
                { theme: "outline", size: "large", text: "signin_with" }
            );
        }
    }
}

function toggleMobileMenu() {
    const sidebar = document.getElementById('sidebar-menu');
    if (sidebar) {
        sidebar.classList.toggle('hidden');
    }
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .catch((err) => {
                console.error('Error al registrar Service Worker:', err);
            });
    });
}

function loginOfflineMode() {
    const offlineUser = {
        name: "Estudiante (Offline)",
        email: "offline@estudiante.una"
    };
    currentUser = offlineUser;
    localStorage.setItem('mateuna_user', JSON.stringify(offlineUser));
    renderAppUI(offlineUser);
    startSessionTimer();
    fetchQuestions();
}

function cambiarMateria(codigo) {
    if (!codigo) return;
    materiaActiva = codigo;
    localStorage.setItem('mateuna_materia_activa', codigo);
    
    fetchQuestions();
    
    const dynamicView = document.getElementById('view-dynamic');
    if (dynamicView && !dynamicView.classList.contains('hidden')) {
        const activeNavBtn = document.querySelector('aside button.bg-blue-50');
        if (activeNavBtn) {
            const sectionKey = activeNavBtn.id.replace('nav-', '');
            showSection(sectionKey);
        }
    }
}

async function loadFundamentacionDynamic(container) {
    const materia = getMateriaActual();
    container.innerHTML = `
        <h2 class="text-xl font-bold text-blue-900 mb-4">Fundamentación del Curso - ${materia.nombre}</h2>
        <p class="text-slate-400 text-sm">Cargando la fundamentación desde la base de datos...</p>
    `;

    try {
        const response = await fetch(`${WEB_APP_URL}?action=getFundamentacion&materia=${materiaActiva}`);
        const data = await response.json();

        if (!data || Object.keys(data).length === 0 || data.error) {
            container.innerHTML = `
                <h2 class="text-xl font-bold text-blue-900 mb-4">Fundamentación del Curso</h2>
                <p class="text-slate-500 text-sm">No se encontró información de fundamentación cargada para esta asignatura.</p>
            `;
            return;
        }

        let librosPrincipalesHtml = '';
        if (Array.isArray(data.libros_principales) && data.libros_principales.length > 0) {
            librosPrincipalesHtml = `<ol class="list-decimal list-inside mt-2 space-y-1">`;
            data.libros_principales.forEach(item => {
                librosPrincipalesHtml += `
                    <li class="font-bold text-blue-900">
                        <a href="${item.url}" target="_blank" class="underline hover:text-blue-700">${item.titulo} ↗</a>
                    </li>
                `;
            });
            librosPrincipalesHtml += `</ol>`;
        }

        let librosCarrerasHtml = '';
        if (Array.isArray(data.libros_carreras) && data.libros_carreras.length > 0) {
            librosCarrerasHtml = `
                <p class="mt-4 text-slate-700 font-medium">Dependiendo de tu carrera deberás utilizar alguno de estos textos:</p>
                <ol class="list-decimal list-inside mt-2 space-y-1">
            `;
            data.libros_carreras.forEach(item => {
                librosCarrerasHtml += `
                    <li class="font-bold text-blue-900">
                        <a href="${item.url}" target="_blank" class="underline hover:text-blue-700">Código ${item.codigo} ↗</a>
                    </li>
                `;
            });
            librosCarrerasHtml += `</ol>`;
        }

        container.innerHTML = `
            <h2 class="text-xl font-bold text-blue-900 mb-4">Fundamentación del Curso (${materia.nombre})</h2>
            <p class="mb-4 text-slate-600">${data.texto_fundamentacion || ''}</p>
            <h3 class="font-bold text-blue-900 mt-4 mb-2">Objetivo Global de la Asignatura</h3>
            <p class="text-slate-600 bg-blue-50 p-4 rounded-xl border border-blue-100 mb-4">
                ${data.objetivo_global || ''}
            </p>
            <h3 class="font-bold text-blue-900 mt-4 mb-2">Material Instruccional Obligatorio</h3>
            ${librosPrincipalesHtml}
            ${librosCarrerasHtml}
        `;

    } catch (e) {
        console.error("Error al obtener la fundamentación:", e);
        container.innerHTML = `
            <h2 class="text-xl font-bold text-blue-900 mb-4">Fundamentación del Curso</h2>
            <p class="text-red-500 text-sm">Ocurrió un error al cargar la fundamentación desde Google Sheets.</p>
        `;
    }
}

function cargarEstadisticasUsuario() {
    const materiaActual = getMateriaActual();
    const emailUsuario = (document.getElementById('user-name')?.dataset.email || localStorage.getItem('mateuna_user_email') || '').trim().toLowerCase();

    const container = document.getElementById('estadisticas-container');
    container.innerHTML = `<p class="text-sm text-slate-400 text-center py-8">Cargando métricas de rendimiento...</p>`;

    fetch(`${materiaActual.scriptUrl}?action=getEstadisticas&materia=${materiaActual.codigo}`)
        .then(res => res.json())
        .then(data => {
            if (!Array.isArray(data) || data.length === 0) {
                container.innerHTML = `<div class="p-4 text-center text-slate-400 text-sm">No hay registros de intentos guardados todavía en la base de datos.</div>`;
                return;
            }

            // Buscar por correo exacto o tomar el primero si está en modo offline/visitante
            let usuarioData = data.find(u => String(u.email).trim().toLowerCase() === emailUsuario);
            if (!usuarioData && emailUsuario.includes('offline')) {
                usuarioData = data[0]; // Muestra el primero como ejemplo si es offline
            }

            if (!usuarioData || !usuarioData.detallesObjetivos) {
                container.innerHTML = `<div class="p-4 text-center text-slate-400 text-sm">Aún no tienes registros de práctica guardados para este usuario (${emailUsuario}).</div>`;
                return;
            }

            let html = `
                <div class="bg-slate-50 p-4 rounded-xl mb-4 flex justify-between items-center">
                    <div>
                        <span class="text-xs text-slate-500 block">Estudiante</span>
                        <span class="font-bold text-slate-800">${usuarioData.nombre || usuarioData.email}</span>
                    </div>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            `;

            for (let objId in usuarioData.detallesObjetivos) {
                let stats = usuarioData.detallesObjetivos[objId];
                let colorBarra = stats.porcentajeEfectividad >= 70 ? 'bg-emerald-500' : stats.porcentajeEfectividad >= 40 ? 'bg-amber-500' : 'bg-rose-500';

                html += `
                    <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-xs space-y-2">
                        <div class="flex justify-between items-center">
                            <span class="font-bold text-sm text-slate-700">Objetivo ${objId}</span>
                            <span class="text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">${stats.porcentajeEfectividad}% Efectividad</span>
                        </div>
                        <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div class="${colorBarra} h-full transition-all duration-500" style="width: ${stats.porcentajeEfectividad}%"></div>
                        </div>
                        <div class="flex justify-between text-[11px] text-slate-400 pt-1">
                            <span>Aciertos: ${stats.totalAciertos}</span>
                            <span>Total Intentos: ${stats.totalIntentos}</span>
                        </div>
                    </div>
                `;
            }

            html += `</div>`;
            container.innerHTML = html;
        })
        .catch(err => {
            console.error("Error cargando estadísticas:", err);
            container.innerHTML = `<div class="p-4 text-center text-rose-500 text-sm">Error al conectar con el servidor de estadísticas.</div>`;
        });
}
