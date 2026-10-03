// materias.js - Catálogo de Materias centralizado
const WEB_APP_URL_CENTRAL = "https://script.google.com/macros/s/AKfycbxJZM8tAq-OUgoz-tGq28t7o1G7y40eZwd_zbpbzZoVhPfpjdeENyDRpTXmOz1BU6h7/exec";

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
   "756": {
    codigo: "756",
    nombre: "Calculo Integral",
    scriptUrl: WEB_APP_URL_CENTRAL,
    csvPreguntas: "./pregunta/p_calc_int_178.csv",
    csvEjercicios: "./ejercicios/p_calc_int_178.csv"
  },  
  "768": {
    codigo: "768",
    nombre: "Topologia",
    scriptUrl: WEB_APP_URL_CENTRAL,
    csvPreguntas: "./preguntas/p_topologia_768.csv",
    csvEjercicios: "./ejercicios/p_topologia_768.csv"
  }
   "773": {
    codigo: "773",
    nombre: "Modelos Matematicos",
    scriptUrl: WEB_APP_URL_CENTRAL,
    csvPreguntas: "./preguntas/p_mod_matem_768.csv",
    csvEjercicios: "./ejercicios/p_mod_matem_768.csv"
  }
};

let materiaActiva = localStorage.getItem('mateuna_materia_activa') || '175';

function getMateriaActual() {
  return MATERIAS_CONFIG[materiaActiva] || MATERIAS_CONFIG["175"];
}
