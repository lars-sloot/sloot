import { SignUpForm } from "@/components/sign-up-form";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page() {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true });

  if (error) throw new Error("De registratiestatus kon niet worden gecontroleerd.");
  if ((count ?? 0) > 0) redirect("/auth/login");

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <SignUpForm />
      </div>
    </div>
  );
}
