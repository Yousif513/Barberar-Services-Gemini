// Which consents a sign-in has to record. Pure so a node test can check it.
export type ConsentRow = { purpose: string; status: string; created_at?: string | null };

/** The newest row per purpose decides the current state; "granted" means the purpose needs no new row. */
export function grantedPurposes(rows: ConsentRow[]): Set<string> {
  const newest = new Map<string, ConsentRow>();
  for (const row of rows) {
    const seen = newest.get(row.purpose);
    if (!seen || String(row.created_at ?? "") > String(seen.created_at ?? "")) newest.set(row.purpose, row);
  }
  return new Set([...newest.values()].filter((row) => row.status === "granted").map((row) => row.purpose));
}

/** Terms and privacy are always required to sign in; WhatsApp only when the customer ticked it. Nothing already granted is repeated. */
export function consentsToRecord(existing: ConsentRow[], whatsappChosen: boolean): string[] {
  const granted = grantedPurposes(existing);
  const wanted = ["terms_privacy"];
  if (whatsappChosen) wanted.push("whatsapp");
  return wanted.filter((purpose) => !granted.has(purpose));
}
