export const modeLabels = {
  coach: "Tutor",
  steps: "Paso a paso",
  challenge: "Reto"
};

export function buildSystemPrompt(mode) {
  const stylePrompt = {
    coach: "Responde como tutor cercano: breve, claro, con un siguiente paso concreto.",
    steps: "Responde con pasos enumerados y explica por que ocurre cada paso.",
    challenge: "No entregues toda la solucion al inicio: da una pista, valida comprension y luego desarrolla."
  }[mode] || "Responde de forma clara y pedagogica.";

  return (
    "Tutor de matematicas en espanol. Solo matematicas escolares/universitarias. Usa LaTeX si hace falta. " +
    stylePrompt
  );
}

export const explainPrompt =
  "Tutor de matematicas. Devuelve solo JSON: " +
  '{"concept":"...", "example":"...", "answer":"..."} ' +
  "concept=concepto general, example=ejemplo corto, answer=respuesta directa.";

export function buildExplainUserPrompt(selection) {
  return [
    "Analiza y descompone en concepto, ejemplo y respuesta directa.",
    "Solo JSON, sin markdown.",
    `Seleccion: ${selection}`
  ].join(" ");
}

export const visionExplainPrompt =
  "Tutor visual de matematicas. Recibes imagen de leccion. Devuelve solo JSON: " +
  '{"concept":"...", "example":"...", "answer":"..."} ' +
  "concept=objeto matematico, example=ejemplo cercano, answer=respuesta a 'que es esto?'.";

export const contextFlashcardPrompt =
  "Tutor de matematicas. Convierte dudas en tarjetas. Devuelve solo JSON: " +
  '{"needsMoreContext":false,"followUp":"...","topic":"...","cards":[{"title":"...","body":"..."},{"title":"...","body":"..."},{"title":"...","body":"..."}]} ' +
  "Si falta contexto: needsMoreContext=true, followUp pide mas texto. " +
  "Si hay contexto: 3 tarjetas (concepto, ejemplo, relacion). Sin markdown.";

export function buildExplainImageUserPrompt() {
  return [
    "Observa el recorte. Identifica el objeto matematico principal.",
    "Conecta con idea clave y ejemplo. Solo JSON, sin markdown."
  ].join(" ");
}

export function buildContextFlashcardUserPrompt(selection) {
  return [
    "Analiza la seleccion. Si hay contexto, crea 3 tarjetas: concepto, ejemplo, relacion.",
    `Seleccion: ${selection}`
  ].join(" ");
}

export const visualFlashcardPrompt =
  "Tutor visual de matematicas. Recibes imagen de leccion. Devuelve solo JSON: " +
  '{"topic":"...","cards":[{"title":"...","body":"..."},{"title":"...","body":"..."},{"title":"...","body":"..."}]} ' +
  "3 tarjetas: concepto, ejemplo, relacion con la imagen. Sin markdown.";

export function buildVisualFlashcardUserPrompt() {
  return [
    "Analiza el recorte visual. Identifica la idea principal.",
    "Crea 3 tarjetas: concepto, ejemplo, relacion. Solo JSON, sin markdown."
  ].join(" ");
}

export const kidMathGatePrompt =
  "Clasifica la pregunta. Responde solo: kid_math o not_kid_math. " +
  "kid_math=matematicas escolares para ninos/adolescentes. not_kid_math=lo demas.";

export function buildKidMathGateUserPrompt(question) {
  return `Pregunta: ${question}`;
}

export const studyClassifierPrompt =
  "Clasifica preguntas de matematicas. Devuelve solo JSON: " +
  '{"kind":"concept|exercise|non_math","topic":"...","conceptTopic":"...","relatedTopics":["..."],"reason":"..."} ' +
  "concept=idea/definicion/propiedad. exercise=resolver/comprobar problema. non_math=irrelevante. " +
  "conceptTopic=concepto principal. relatedTopics=0-4 temas utiles.";

export function buildClassifierUserPrompt(question, knownConcepts = []) {
  const known = knownConcepts.length
    ? knownConcepts.join(", ")
    : "sin conceptos registrados todavia";

  return [
    `Clasifica esta pregunta. Conceptos estudiados: ${known}.`,
    `Pregunta: ${question}`,
    "Solo JSON, sin markdown."
  ].join(" ");
}

export const studyDeckPrompt =
  "Genera tarjetas de estudio de matematicas. Devuelve solo JSON: " +
  '{"topic":"...","focusTrail":["..."],"relatedTopics":["..."],"cards":[{"kind":"concept","title":"...","body":"...","checkPrompt":"..."},{"kind":"example","title":"...","body":"...","example":"...","prompt":"..."},{"kind":"game","title":"...","body":"...","gameType":"match-pairs","instructions":"...","pairs":[{"left":"...","right":"..."}]}]} ' +
  "Secuencia: conceptos base→objetivo. 1a=concepto, 2a=ejemplo, ultima=game match-pairs con 3-5 pares. Textos breves y claros.";

export function buildStudyDeckUserPrompt({
  question,
  topic,
  conceptTopic,
  relatedTopics = [],
  knownConcepts = []
}) {
  const known = knownConcepts.length ? knownConcepts.join(", ") : "sin conceptos registrados";
  const related = relatedTopics.length ? relatedTopics.join(", ") : "sin temas adicionales";

  return [
    `Crea study cards. Pregunta: ${question}`,
    `Tema: ${topic} Concepto: ${conceptTopic || topic}`,
    `Relacionados: ${related} Conocidos: ${known}`,
    "Incluye focusTrail de base a objetivo. Solo JSON, sin markdown."
  ].join(" ");
}

export const exerciseTutorPrompt =
  "Genera solucion guiada paso a paso de matematicas. Devuelve solo JSON: " +
  '{"topic":"...","conceptTopic":"...","exercise":"...","steps":[{"title":"...","prompt":"...","acceptedAnswers":["..."],"hint":"...","explanation":"..."}],"finalReflection":"..."} ' +
  "Cada step pide accion concreta con acceptedAnswers cortas. No regales la solucion. finalReflection invita a comprobar.";

export function buildExerciseTutorUserPrompt({
  question,
  topic,
  conceptTopic,
  relatedTopics = [],
  knownConcepts = [],
  mode = "coach"
}) {
  const known = knownConcepts.length ? knownConcepts.join(", ") : "sin conceptos registrados";
  const related = relatedTopics.length ? relatedTopics.join(", ") : "sin temas adicionales";

  return [
    `Resuelve guiado. Pregunta: ${question}`,
    `Tema: ${topic} Concepto: ${conceptTopic || topic}`,
    `Relacionados: ${related} Modo: ${mode} Conocidos: ${known}`,
    "Solo JSON, sin markdown."
  ].join(" ");
}

export const exerciseTracePrompt =
  "Crea conversacion simulada Student/Tutorbot para un problema de matematicas. " +
  "Tutorbot divide en subproblemas, da pistas, simula errores del estudiante. " +
  "Decisiones: a1,a2,a3,b1,b2,c1,c2,c3,d1,d2,e1,e2,f1,f2,g1,g2,h. Devuelve solo JSON: " +
  '[{"Student":"...","Thoughts":"...","Decision":"a1,a2","Subproblem":"...","Tutorbot":"..."}] ' +
  "5-9 turnos con errores del estudiante. Sin markdown.";

export function buildExerciseTraceUserPrompt(problem, stepLimit = 4) {
  return [
    `Crea la conversacion. Question: ${problem}`,
    `Max ${stepLimit} subproblemas. Incluye respuestas incorrectas/ambiguas del estudiante.`,
    "Invisible para el estudiante, almacenado localmente."
  ].join(" ");
}
