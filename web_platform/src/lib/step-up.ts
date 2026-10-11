// Step-up (GOV-1 / Q6): the database refuses a sensitive command unless the session verified an authenticator code in the last
// 5 minutes, and answers with the hint "step_up_required". The Supabase client's fetch (lib/supabase.ts) hands such a refusal to
// the handler registered here (the StepUpDialog mounted by the admin console), waits for a fresh code, and repeats the request
// once with the new session. Nothing here decides access: the database does.

export type StepUpPrompt = { resolve: (verified: boolean) => void };
type Handler = (prompt: StepUpPrompt) => void;

let handler: Handler | null = null;
let pending: Promise<boolean> | null = null;

export function registerStepUpHandler(next: Handler): () => void {
  handler = next;
  return () => {
    if (handler === next) handler = null;
  };
}

// Several refused requests at once share one prompt.
export function requestStepUp(): Promise<boolean> {
  if (!handler) return Promise.resolve(false);
  if (pending) return pending;
  const current = handler;
  pending = new Promise<boolean>((resolve) => current({ resolve })).finally(() => {
    pending = null;
  });
  return pending;
}

type HintedError = { hint?: unknown; message?: unknown } | null | undefined;

export function errorHint(error: unknown): string {
  const hint = (error as HintedError)?.hint;
  return typeof hint === "string" ? hint : "";
}

export const isStepUpRequired = (error: unknown) => errorHint(error) === "step_up_required";
export const isReauthRequired = (error: unknown) => errorHint(error) === "reauth_required";
export const isApprovalRequired = (error: unknown) => errorHint(error) === "approval_required";

// Reads the hint of a refused PostgREST call from the raw response, without consuming the body the client will read.
export async function responseHint(response: Response): Promise<string> {
  if (response.ok) return "";
  try {
    const body = (await response.clone().json()) as { hint?: unknown };
    return typeof body?.hint === "string" ? body.hint : "";
  } catch {
    return "";
  }
}
