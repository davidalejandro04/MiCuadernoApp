import { safeParseAgentJson } from "./agent-utils.mjs";

const SYSTEM_PROMPT = `Planificador de tutoria matematica. Descompone preguntas en 2-3 subproblemas (facil→dificil).
Solo JSON valido:
{"learning_objective":"...","main_problem":"...","subproblems":[{"id":"sp1","prompt":"...","expected_answer":"corta","hint_ladder":["general","especifica","La respuesta es: X"],"common_misconceptions":["error"]}]}
Reglas: 2-3 subproblemas, respuestas cortas, 3 pistas (la 3a empieza con "La respuesta es:").`;

export async function scaffoldingPlannerAgent(
  { question, learnerModel = null },
  { askFn, maxTokens = 450 }
) {
  const supportLevel = learnerModel?.recommended_support_level || "medium";

  const userPrompt = `Pregunta del estudiante: "${question}"
Nivel de apoyo: ${supportLevel}
Crea 2-3 subproblemas con pistas para esta pregunta.`;

  const raw = await askFn(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt }
    ],
    { maxTokens, temperature: 0.2 }
  );

  const parsed = safeParseAgentJson(raw, {});
  const subproblems = Array.isArray(parsed.subproblems) ? parsed.subproblems : [];

  if (!subproblems.length) {
    return {
      learning_objective: question,
      main_problem: question,
      subproblems: [{
        id: "sp1",
        prompt: question,
        expected_answer: "",
        hint_ladder: [
          "Piensa en lo que ya sabes sobre este tema.",
          "Intenta pensar paso a paso.",
          "La respuesta es: revisa la pregunta e intenta de nuevo."
        ],
        common_misconceptions: []
      }]
    };
  }

  return {
    learning_objective: String(parsed.learning_objective || question),
    main_problem: String(parsed.main_problem || question),
    subproblems: subproblems.slice(0, 4).map((sp, i) => {
      const hintLadder = Array.isArray(sp.hint_ladder) ? sp.hint_ladder : [];
      const expectedAnswer = String(sp.expected_answer || "");
      while (hintLadder.length < 2) {
        hintLadder.push(
          hintLadder.length === 0 ? "Piensa en lo que ya sabes."
          : "Aplica lo que acabas de pensar."
        );
      }
      if (hintLadder.length < 3) {
        hintLadder.push(expectedAnswer ? `La respuesta es: ${expectedAnswer}` : "La respuesta es: revisa la pregunta.");
      } else if (hintLadder[2] && !String(hintLadder[2]).toLowerCase().startsWith("la respuesta es")) {
        hintLadder[2] = expectedAnswer ? `La respuesta es: ${expectedAnswer}` : hintLadder[2];
      }
      return {
        id: String(sp.id || `sp${i + 1}`),
        prompt: String(sp.prompt || ""),
        expected_answer: expectedAnswer,
        hint_ladder: hintLadder.slice(0, 3),
        common_misconceptions: Array.isArray(sp.common_misconceptions) ? sp.common_misconceptions : []
      };
    })
  };
}
