import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// React cache is scoped to a server render, never shared between users or requests.
export const getViewerClaims = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims ?? null;
});

export const getViewerProfile = cache(async () => {
  const claims = await getViewerClaims();
  if (!claims) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("role,organization_id").eq("id", claims.sub).maybeSingle();
  return data;
});
