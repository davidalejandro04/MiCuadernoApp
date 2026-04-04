/**
 * Extract and parse the first JSON object (or array) from a raw LLM response.
 * Handles:
 *   - Markdown code fences (```json ... ```)
 *   - Gemma4 / Ollama envelope: {"response": "<actual json string>"}
 *   - Top-level arrays: [...]
 */
export function parseAgentJson(raw) {
  const trimmed = String(raw || "").trim();

  // Strip markdown code fences
  const stripped = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // Try to find the outermost JSON object or array
  const objStart = stripped.indexOf("{");
  const arrStart = stripped.indexOf("[");

  let candidate = "";
  if (objStart !== -1 && (arrStart === -1 || objStart < arrStart)) {
    // Object comes first
    const end = stripped.lastIndexOf("}");
    if (end === -1) throw new SyntaxError("No JSON object found");
    candidate = stripped.slice(objStart, end + 1);
  } else if (arrStart !== -1) {
    // Array comes first
    const end = stripped.lastIndexOf("]");
    if (end === -1) throw new SyntaxError("No JSON array found");
    return JSON.parse(stripped.slice(arrStart, end + 1));
  } else {
    throw new SyntaxError("No JSON found in response");
  }

  const parsed = JSON.parse(candidate);

  // Unwrap Gemma4-style {"response": "<embedded json>"} envelopes
  if (
    parsed !== null &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    Object.keys(parsed).length === 1 &&
    typeof parsed.response === "string"
  ) {
    try {
      const inner = parseAgentJson(parsed.response);
      return inner;
    } catch {
      // The response field is plain text, not embedded JSON — return as-is
      return parsed;
    }
  }

  return parsed;
}

export function safeParseAgentJson(raw, fallback) {
  try {
    return parseAgentJson(raw);
  } catch {
    return fallback;
  }
}
