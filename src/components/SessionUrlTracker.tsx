"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { recordSessionUrl } from "../utils/sessionAnalytics";

/** Invisible, app-wide route observer. Search changes matter because all four
 * related-post filter types are encoded in the URL. */
export default function SessionUrlTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useEffect(() => {
    if (!pathname) return;
    recordSessionUrl(`${pathname}${search ? `?${search}` : ""}`);
  }, [pathname, search]);

  return null;
}
