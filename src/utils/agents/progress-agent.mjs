import { safeParseAgentJson } from "./agent-utils.mjs";

const SYSTEM_PROMPT = `Resume sesion de tutoria de mates. JSON sin texto extra:
{"memory_update":{"concept":"nombre","status":"introducing|improving|mastered","misconceptions":[]},"session_summary":"resumen breve"}`;

export async function progressAgent(
  { tutorState, sessionEvents = [] },
  { askFn, maxTokens = 120 }
) {
  const completedSps = tutorState.subproblems.filter((sp) => sp.status === "done").length;
  const totalSps = tutorState.subproblems.length;

  const userPrompt = `Tema:${tutorState.topic} Completados:${completedSps}/${totalSps} Dominio:${tutorState.student_mastery_estimate}`;

  const raw = await askFn(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt }
    ],
    { maxTokens, temperature: 0.1 }
  );

  const parsed = safeParseAgentJson(raw, {});
  return {
    memory_update: parsed.memory_update || {
      concept: tutorState.topic,
      status: "improving",
      misconceptions: []
    },
    session_summary: String(parsed.session_summary || "")
  };
}
