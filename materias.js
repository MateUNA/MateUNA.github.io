// materias.js - Catálogo de Materias centralizado
const WEB_APP_URL_CENTRAL = "https://script.google.com/macros/s/AKfycby74QRdNkKjtV_I_auAImfvpi2BJMrzUbN6RdwuIDpPnDzua9WaXCd-xVisA45Z5252/exec";

const MATERIAS_CONFIG = {
  "175": {
    codigo: "175",
    nombre: "Matemática I",
    scriptUrl: WEB_APP_URL_CENTRAL,
    csvPreguntas: "./preguntas.csv",
    csvEjercicios: "./ejercicios.csv"
  },
  "178": {
    codigo: "178",
    nombre: "Matemática II",
    scriptUrl: WEB_APP_URL_CENTRAL,
    csvPreguntas: "./preguntas.csv",
    csvEjercicios: "./ejercicios.csv"
  },    
  "768": {
    codigo: "768",
    nombre: "Topologia",
    scriptUrl: WEB_APP_URL_CENTRAL,
    csvPreguntas: "./preguntas.csv",
    csvEjercicios: "./ejercicios.csv"
  }
};

let materiaActiva = localStorage.getItem('mateuna_materia_activa') || '175';

function getMateriaActual() {
  return MATERIAS_CONFIG[materiaActiva] || MATERIAS_CONFIG["175"];
}
