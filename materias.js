// materias.js - Catálogo de Materias centralizado
// Para agregar una materia: añade un bloque aquí, su logo en ./assets/materias/<codigo>.svg (o .png)
// y su hoja de cálculo en GOOGLE_SHEETS_MAP dentro de mateAPP.gs.
const WEB_APP_URL_CENTRAL = "https://script.google.com/macros/s/AKfycbxy7G-XsG9PwoW4B-pvwXKnP6BEyupIkwbQ79bFJ-bdLmNgRT1hegVC8fjPI7jg-rkw/exec";

const MATERIAS_CONFIG = {
  "175": {
    codigo: "175",
    codigos: "175 / 176 / 177",
    nombre: "Matemática I",
    logo: "./assets/materias/175.svg",
    scriptUrl: WEB_APP_URL_CENTRAL,
    csvPreguntas: "./preguntas/p_mate1_175.csv",
    csvEjercicios: "./ejercicios/p_mate1_175.csv",
    // Lista fija de objetivos para la Central de Estudio. Si una materia no la trae,
    // la Central de Estudio arma la lista con los objetivos que existan en su hoja.
    objetivos: [
      { id: "1.1", name: "Objetivo 1.1: N,Z,Q", desc: "Conjuntos numéricos, axiómica de números reales y propiedades." },
      { id: "1.2", name: "Objetivo 1.2: Numeros Reales", desc: "Ecuaciones, inecuaciones y valor absoluto." },
      { id: "1.3", name: "Objetivo 1.3: Orden en R", desc: "Geometría analítica, recta y secciones cónicas." },
      { id: "2.1", name: "Objetivo 2.1: Sistema de Coordenadas", desc: "Relaciones y funciones reales de variable real." },
      { id: "2.2", name: "Objetivo 2.2: Funciones Elementales", desc: "Operaciones con funciones y función inversa." },
      { id: "2.3", name: "Objetivo 2.3: Representaciones Graficas", desc: "Funciones trascendentes (Exponencial, Logarítmica, Trigonométrica)." },
      { id: "3.1", name: "Objetivo 3.1: Sucesiones", desc: "Sucesiones numéricas y concepto de límite de una sucesión." },
      { id: "3.2", name: "Objetivo 3.2: Limites", desc: "Límite de una función real y propiedades de los límites." },
      { id: "3.3", name: "Objetivo 3.3: Continuidad", desc: "Continuidad de funciones reales y teoremas de continuidad." }
    ]
  },
  "178": {
    codigo: "178",
    codigos: "178 / 179",
    nombre: "Matemática II",
    logo: "./assets/mateDOS.png",
    scriptUrl: WEB_APP_URL_CENTRAL,
    csvPreguntas: "./preguntas/p_mate2_178.csv",
    csvEjercicios: "./ejercicios/p_mate2_178.csv"
  },
  "756": {
    codigo: "756",
    codigos: "756",
    nombre: "Cálculo Integral",
    logo: "./assets/materias/756.svg",
    scriptUrl: WEB_APP_URL_CENTRAL,
    csvPreguntas: "./preguntas/p_calc_int_756.csv",
    csvEjercicios: "./ejercicios/p_calc_int_756.csv"
  },
  "768": {
    codigo: "768",
    codigos: "768",
    nombre: "Topología",
    logo: "./assets/topologo.jpg",
    scriptUrl: WEB_APP_URL_CENTRAL,
    csvPreguntas: "./preguntas/p_topologia_768.csv",
    csvEjercicios: "./ejercicios/p_topologia_768.csv",
    // Atajos de tema para el Tutor IA (edítalos a tu gusto)
    temasChat: ["Espacios topológicos y bases", "Continuidad y homeomorfismos", "Compacidad", "Conexidad", "Axiomas de separación"]
  },
  "773": {
    codigo: "773",
    codigos: "773",
    nombre: "Modelos Matemáticos",
    logo: "./assets/materias/773.svg",
    scriptUrl: WEB_APP_URL_CENTRAL,
    csvPreguntas: "./preguntas/p_mod_matem_773.csv",
    csvEjercicios: "./ejercicios/p_mod_matem_773.csv"
  }
};

let materiaActiva = localStorage.getItem('mateuna_materia_activa') || '175';
if (!MATERIAS_CONFIG[materiaActiva]) materiaActiva = '175'; // por si se guardó un código que ya no existe

function getMateriaActual() {
  return MATERIAS_CONFIG[materiaActiva] || MATERIAS_CONFIG["175"];
}
