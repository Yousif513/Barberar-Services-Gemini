import { supabase } from "@/lib/supabase";

export type PublishedAgreement = {
  id: string;
  agreement_key: string;
  version: string;
  title_en: string;
  title_ar: string;
  summary_en?: string | null;
  summary_ar?: string | null;
  content_en?: string;
  content_ar?: string;
};

export type AgreementLookup =
  | { state: "loading" }
  | { state: "ready"; agreement: PublishedAgreement }
  | { state: "unpublished" }
  | { state: "error"; message: string };

/**
 * The agreement version that is currently published for a key ("customer_terms", "provider_agreement", "privacy_notice").
 * A consent or acceptance is only meaningful for a version a person was actually shown, so screens ask for it before they
 * offer the checkbox and refuse to record anything when none is published (the owner publishes it in the admin console).
 * Returns null when nothing is published; throws the Supabase error when the read fails.
 */
export async function fetchPublishedAgreement(agreementKey: string, withText = false): Promise<PublishedAgreement | null> {
  const { data, error } = await supabase
    .from("legal_agreements")
    .select(withText ? "id, agreement_key, version, title_en, title_ar, summary_en, summary_ar, content_en, content_ar" : "id, agreement_key, version, title_en, title_ar")
    .eq("agreement_key", agreementKey)
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as PublishedAgreement | null) ?? null;
}

export async function lookupPublishedAgreement(agreementKey: string, describe: (error: unknown) => string, withText = false): Promise<AgreementLookup> {
  try {
    const agreement = await fetchPublishedAgreement(agreementKey, withText);
    return agreement ? { state: "ready", agreement } : { state: "unpublished" };
  } catch (error) {
    return { state: "error", message: describe(error) };
  }
}
