// LLM paraphrase adapter: an interface only. v1 of the receptionist is deterministic and NO language model is called anywhere.
//
// If an owner later approves a model, it plugs in here and nowhere else: the engine composes every reply from rules and database facts first,
// then (optionally) asks the adapter to re-word it. The wording may change, the facts may not, so a candidate is accepted only when
// preservesFacts() says every number, date-like token and URL of the original is still present. Anything else falls back to the original text.
// Data sent to a model would be a processing activity that needs its own PDPL review: the customer's message text, never the number.

export interface ParaphraseRequest {
  text: string
  locale: "ar" | "en"
  intent: string
}

export interface ReplyParaphraser {
  /** A re-worded text, or null to keep the original. Must not throw for ordinary failures; the caller also guards with try/catch. */
  paraphrase(request: ParaphraseRequest): Promise<string | null>
}

/** The default: no model. */
export const noParaphrase: ReplyParaphraser = { paraphrase: () => Promise.resolve(null) }

const FACT = /https?:\/\/[^\s)]+|\d+(?:[:.,/]\d+)*/g

/** True when every number, time and link in `original` also appears, unchanged, in `candidate`. */
export function preservesFacts(original: string, candidate: string): boolean {
  const wanted = original.match(FACT) ?? []
  return wanted.every((fact) => candidate.includes(fact))
}

export async function applyParaphrase(adapter: ReplyParaphraser, request: ParaphraseRequest): Promise<string> {
  try {
    const candidate = await adapter.paraphrase(request)
    if (typeof candidate === "string" && candidate.trim().length > 0 && candidate.length <= 1500 && preservesFacts(request.text, candidate)) {
      return candidate
    }
  } catch {
    // A failing model never blocks a reply.
  }
  return request.text
}
