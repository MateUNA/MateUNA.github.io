// materias.js - Catálogo de Materias centralizado
const WEB_APP_URL_CENTRAL = "https://script.google.com/macros/s/AKfycby74QRdNkKjtV_I_auAImfvpi2BJMrzUbN6RdwuIDpPnDzua9WaXCd-xVisA45Z5252/exec";

const MATERIAS_CONFIG = {
  "175": {
    codigo: "175",
    nombre: "Matemática I",
    scriptUrl: WEB_APP_URL_CENTRAL,
    csvPreguntas: "./preguntas/p_mate1_175.csv",
    csvEjercicios: "./ejercicios/p_mate1_175.csv"
  },
  "178": {
    codigo: "178",
    nombre: "Matemática II",
    scriptUrl: WEB_APP_URL_CENTRAL,
    csvPreguntas: "./pregunta/p_mate2_178.csv",
    csvEjercicios: "./ejercicios/p_mate2_178.csv"
  },    
  "768": {
    codigo: "768",
    nombre: "Topologia",
    scriptUrl: WEB_APP_URL_CENTRAL,
    csvPreguntas: "./preguntas/p_topologia_768.csv",
    csvEjercicios: "./ejercicios/p_topologia_768.csv"
  }
};

let materiaActiva = localStorage.getItem('mateuna_materia_activa') || '175';

function getMateriaActual() {
  return MATERIAS_CONFIG[materiaActiva] || MATERIAS_CONFIG["175"];
}
