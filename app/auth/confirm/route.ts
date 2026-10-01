import { createClient } from "@/lib/supabase/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

function safeNextPath(value: string | null, type: EmailOtpType | null) {
  const fallback = type === "invite" || type === "recovery"
    ? "/auth/update-password"
    : "/protected";
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(searchParams.get("next"), type);
  const supabase = await createClient();
  let error: Error | null = null;

  if (code) {
    const result = await supabase.auth.exchangeCodeForSession(code);
    error = result.error;
  } else if (token_hash && type) {
    const result = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });
    error = result.error;
  } else {
    error = new Error("De link bevat geen geldige authenticatiecode.");
  }

  if (!error) return NextResponse.redirect(new URL(next, request.url));

  const errorUrl = new URL("/auth/error", request.url);
  errorUrl.searchParams.set("error", error.message);
  return NextResponse.redirect(errorUrl);
}
