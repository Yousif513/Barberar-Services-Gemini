// Supabase/PostgREST errors are plain objects with a `message`, not Error instances, so
// `String(error)` would show "[object Object]". Use this wherever an error is shown to a person.
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return String(error);
}
