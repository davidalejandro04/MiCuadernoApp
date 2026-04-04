import { safeParseAgentJson } from "./agent-utils.mjs";

const SYSTEM_PROMPT = `Eres un tutor de matematicas infantiles en español.
Evalua la respuesta del alumno y responde con JSON valido, sin texto adicional.

Formato exacto:
{"t":"correct|incorrect|partial","a":"confirm_and_advance|give_hint_1|corrective_feedback|give_solution","r":"respuesta del tutor","reason":"breve"}

Reglas de evaluacion: compara el SIGNIFICADO, no el texto literal. "siete" y "7" son iguales.
Reglas de accion:
- correct → "confirm_and_advance"
- incorrect con <2 fallos previos → "give_hint_1"
- incorrect con 2+ fallos → "give_solution" (empieza r con "La respuesta es:")
Respuesta: max 2 oraciones, español, tono amigable.

Ejemplo — P:"¿Cuanto es 3+4?" R_esperada:"7" Alumno:"siete" Fallos:0
{"t":"correct","a":"confirm_and_advance","r":"¡Muy bien! Siete es correcto. Pasamos al siguiente paso.","reason":"Respuesta semanticamente correcta"}`;

export async function turnAgent(
  { studentMessage, currentSubproblem, retryCount = 0, frustrationRisk = 0 },
  { askFn, maxTokens = 150 }
) {
  const userPrompt = `P:"${currentSubproblem.prompt}" R_esperada:"${currentSubproblem.expected_answer || ""}" Alumno:"${studentMessage}" Fallos:${retryCount}${frustrationRisk > 0.6 ? " FRUSTRADO" : ""}`;

  const raw = await askFn(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt }
    ],
    { maxTokens, temperature: 0.2 }
  );

  const parsed = safeParseAgentJson(raw, {});

  let turnType = String(parsed.t || parsed.student_turn_type || "unclear");
  let action = String(parsed.a || parsed.pedagogical_action || "give_hint_1");

  if (turnType === "correct") {
    action = "confirm_and_advance";
  } else if (retryCount >= 2 && turnType !== "correct" && turnType !== "student_inquiry") {
    action = "give_solution";
  }

  let response = String(parsed.r || parsed.response || "").trim();
  if (!response) {
    response = turnType === "correct"
      ? "¡Muy bien! Pasamos al siguiente paso."
      : "Sigue intentando, vas muy bien.";
  }

  return {
    student_turn_type: turnType,
    pedagogical_action: action,
    response,
    reason: String(parsed.reason || "")
  };
}
