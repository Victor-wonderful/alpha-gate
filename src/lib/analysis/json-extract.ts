/** Robust JSON object extraction from possibly-noisy LLM output.
 *  - Strips markdown code fences (```json ... ```)
 *  - Locates the largest balanced JSON object substring
 *  - Tolerates leading/trailing prose
 */
export function extractJsonObject(text: string): string | null {
  if (!text) return null;
  let s = text.trim();

  // Remove markdown fences if present
  s = s.replace(/^```(?:json|JSON)?\s*/i, "").replace(/```\s*$/i, "");

  // Fast path
  if (s.startsWith("{") && s.endsWith("}")) return s;

  // Find first { and walk forward tracking braces (ignoring those inside strings)
  const start = s.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

export function parseJsonLoose<T>(text: string): { data: T } | { error: string; raw: string } {
  const candidate = extractJsonObject(text);
  if (!candidate) {
    return { error: "JSON 객체를 찾지 못했습니다.", raw: text.slice(0, 800) };
  }
  try {
    return { data: JSON.parse(candidate) as T };
  } catch (e) {
    return {
      error: `JSON.parse 실패: ${e instanceof Error ? e.message : "unknown"}`,
      raw: candidate.slice(0, 800),
    };
  }
}
