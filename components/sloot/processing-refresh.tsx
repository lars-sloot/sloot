"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function ProcessingRefresh({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const interval = window.setInterval(() => router.refresh(), 5000);
    return () => window.clearInterval(interval);
  }, [active, router]);

  return null;
}
