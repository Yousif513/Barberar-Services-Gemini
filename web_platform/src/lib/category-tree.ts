import { supabase } from "@/lib/supabase";

export type CategoryNode = { id: string; slug: string; parent_id: string | null };

// search_marketplace_providers matches p_category against the exact category of a provider's services (slug or id), so a
// parent such as "Grooming & Barbering" never matches providers whose services sit in its children ("Men's Haircut").
// This returns the slug plus every descendant slug, so a caller can run one search per slug and merge the answers.
export function expandCategorySlugs(nodes: CategoryNode[], rootSlugs: string[]): string[] {
  const slugs = new Set<string>();
  const queue = nodes.filter((node) => rootSlugs.includes(node.slug)).map((node) => node.id);
  const seen = new Set<string>(queue);
  for (const root of rootSlugs) slugs.add(root);
  while (queue.length > 0) {
    const parentId = queue.shift() as string;
    for (const node of nodes) {
      if (node.parent_id === parentId && !seen.has(node.id)) {
        seen.add(node.id);
        slugs.add(node.slug);
        queue.push(node.id);
      }
    }
  }
  return [...slugs];
}

// Loads the active category tree and expands the given roots. A failed read is returned as an error, never hidden.
export async function loadExpandedCategorySlugs(rootSlugs: string[]): Promise<{ slugs: string[]; error: string }> {
  const { data, error } = await supabase.from("categories").select("id, slug, parent_id").eq("is_active", true);
  if (error) return { slugs: rootSlugs, error: error.message };
  return { slugs: expandCategorySlugs((data ?? []) as CategoryNode[], rootSlugs), error: "" };
}
