// materias.js - Catálogo de Materias y Backend Apps Script
const MATERIAS_CONFIG = {
  "175": {
    codigo: "175",
    nombre: "Matemática I",
    scriptUrl: "https://script.google.com/macros/s/AKfycby74QRdNkKjtV_I_auAImfvpi2BJMrzUbN6RdwuIDpPnDzua9WaXCd-xVisA45Z5252/exec",
    csvPreguntas: "./preguntas.csv",
    csvEjercicios: "./ejercicios.csv"
  },
  "178": {
    codigo: "178",
    nombre: "Matemática II",
    scriptUrl: "https://script.google.com/macros/s/AKfycbyVVmX4dJ1eBNpn2ezcjLDu23R8smSh5Z1-nFgUUVA3OBKfMAqUUk3FT0J8LZT4BKF03w/exec",
    csvPreguntas: "./data/178_preguntas.csv",
    csvEjercicios: "./data/178_ejercicios.csv"
  }
  "768": {
    codigo: "768",
    nombre: "Topologia",
    scriptUrl: "https://script.google.com/macros/s/AKfycbyhcJcZlg-JWzBwl5Y627_5H2nfXQQoZT6iw8oCLL4PmNABLmzx0wrTLhNoMdSdz00k6A/exec",
    csvPreguntas: "./data/178_preguntas.csv",
    csvEjercicios: "./data/178_ejercicios.csv"
  }
};

// Materia activa guardada en localStorage o por defecto '175'
let materiaActiva = localStorage.getItem('mateuna_materia_activa') || '175';

function getMateriaActual() {
  return MATERIAS_CONFIG[materiaActiva] || MATERIAS_CONFIG["175"];
}
