"use client";

import Link, { useLinkStatus } from "next/link";
import { createPortal } from "react-dom";
import type { ComponentProps } from "react";
import { LoadingProgress } from "@/components/loading-progress";

function NavigationProgress() {
  const { pending } = useLinkStatus();
  // A portal keeps the bar above mobile menus, panels and clipped tables.
  return pending ? createPortal(<LoadingProgress />, document.body) : null;
}

export default function NavigationLink({ children, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link {...props}>
      {children}
      <NavigationProgress />
    </Link>
  );
}
