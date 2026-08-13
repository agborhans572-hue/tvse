"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { usePublicContactLinks } from "./usePublicContactLinks";

type TurnstileApi = {
  render(element: HTMLElement, options: { sitekey: string; theme: "auto"; action: "magic-link"|"contact"|"trip-request" }): string;
  remove(widgetId: string): void;
};

declare global { interface Window { turnstile?: TurnstileApi } }

export function TurnstileField({action}:{action?:"magic-link"|"contact"|"trip-request"}={}) {
  const { turnstileSiteKey } = usePublicContactLinks();
  const pathname=usePathname();
  const element = useRef<HTMLDivElement>(null); const widgetId = useRef<string | null>(null);
  const render = useCallback(() => {
    if (!turnstileSiteKey || !element.current || !window.turnstile || widgetId.current) return;
    const resolvedAction=action??(element.current.closest("form")?.classList.contains("trip-planner")?"trip-request":pathname.startsWith("/login/")?"magic-link":"contact");
    widgetId.current = window.turnstile.render(element.current, { sitekey: turnstileSiteKey, theme: "auto", action:resolvedAction });
  }, [action,pathname,turnstileSiteKey]);
  useEffect(() => { render(); return () => { if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current); widgetId.current = null; }; }, [render]);
  if (!turnstileSiteKey) return null;
  return <div className="turnstile-field"><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={render} /><div ref={element} /></div>;
}

export function readTurnstileToken(form: HTMLFormElement): string {
  return String(new FormData(form).get("cf-turnstile-response") ?? "");
}
