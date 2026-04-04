import { safeParseAgentJson } from "./agent-utils.mjs";

const SYSTEM_PROMPT = `Clasifica si el mensaje es sobre matematicas infantiles (grados 1-6).
Responde SOLO con JSON valido, sin texto adicional.

Formato: {"route":"pedagogical|direct_answer|off_topic|chitchat","intent":"new_question|hint_request|answer_check|off_topic|other","confidence":0.9,"requires_planner":true}

pedagogical = necesita tutoria con pasos. direct_answer = respuesta simple. off_topic = no es mates. chitchat = saludo/casual.

Ejemplo — "¿Cuanto es 5x3?" → {"route":"direct_answer","intent":"new_question","confidence":0.95,"requires_planner":false}
Ejemplo — "Hola" → {"route":"chitchat","intent":"other","confidence":0.99,"requires_planner":false}`;

export async function routerAgent({ message }, { askFn, maxTokens = 60 }) {
  const raw = await askFn(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Mensaje: "${message}"` }
    ],
    { maxTokens, temperature: 0 }
  );

  const parsed = safeParseAgentJson(raw, {});
  return {
    route: String(parsed.route || "pedagogical"),
    intent: String(parsed.intent || "new_question"),
    confidence: Number(parsed.confidence ?? 0.7),
    requires_planner: Boolean(parsed.requires_planner !== false),
    rejection_reason: parsed.rejection_reason || null
  };
}
