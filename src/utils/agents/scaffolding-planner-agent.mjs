import { safeParseAgentJson } from "./agent-utils.mjs";

const SYSTEM_PROMPT = `Eres un planificador de tutoria de matematicas infantiles en español.
Tu tarea: descomponer la pregunta del estudiante en 2-3 subproblemas ordenados de facil a dificil.

Responde SOLO con JSON valido, sin texto adicional. Formato exacto:
{"learning_objective":"objetivo","main_problem":"problema","subproblems":[{"id":"sp1","prompt":"pregunta","expected_answer":"respuesta corta","hint_ladder":["pista general","pista especifica","La respuesta es: X"],"common_misconceptions":["error"]}]}

Reglas:
- 2-3 subproblemas maximo
- Respuestas esperadas cortas (1 frase o numero)
- 3 pistas por subproblema: general, especifica, y la respuesta completa
- La tercera pista SIEMPRE empieza con "La respuesta es:"

Ejemplo para "¿Es 7 un numero primo?":
{"learning_objective":"Numeros primos","main_problem":"¿Es 7 primo?","subproblems":[{"id":"sp1","prompt":"¿Entre cuantos numeros se puede dividir exactamente un numero primo?","expected_answer":"Solo entre 1 y el mismo numero","hint_ladder":["Piensa en que hace especial a un primo","Un primo no se puede dividir entre otros numeros","La respuesta es: Solo entre 1 y el mismo numero"],"common_misconceptions":["Confundir primo con impar"]},{"id":"sp2","prompt":"¿7 se puede dividir exactamente entre algun numero que no sea 1 o 7?","expected_answer":"No, solo entre 1 y 7","hint_ladder":["Prueba dividiendo 7 entre 2, 3, 4, 5, 6","Ninguna de esas divisiones da un resultado exacto","La respuesta es: No, 7 solo se divide entre 1 y 7, asi que es primo"],"common_misconceptions":["Pensar que 7/2=3 es exacto"]}]}`;

export async function scaffoldingPlannerAgent(
  { question, learnerModel = null },
  { askFn, maxTokens = 600 }
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
