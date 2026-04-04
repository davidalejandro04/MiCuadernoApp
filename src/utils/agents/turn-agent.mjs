import { safeParseAgentJson } from "./agent-utils.mjs";

const SYSTEM_PROMPT = `Tutor de mates infantil. Evalua respuesta del alumno. Solo JSON:
{"t":"correct|incorrect|partial","a":"confirm_and_advance|give_hint_1|corrective_feedback|give_solution","r":"respuesta","reason":"breve"}
Compara SIGNIFICADO, no texto. correct→confirm_and_advance. incorrect <2 fallos→give_hint_1. incorrect 2+ fallos→give_solution (r empieza "La respuesta es:"). Max 2 oraciones, tono amigable.`;

export async function turnAgent(
  { studentMessage, currentSubproblem, retryCount = 0, frustrationRisk = 0 },
  { askFn, maxTokens = 100 }
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
