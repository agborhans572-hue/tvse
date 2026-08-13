"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { usePublicContactLinks } from "./usePublicContactLinks";

type TawkApi = {
  hideWidget?: () => void;
  maximize?: () => void;
  showWidget?: () => void;
  getStatus?: () => string;
  onBeforeLoad?: () => void;
  onLoad?: () => void;
  onStatusChange?: (status: string) => void;
  onChatMaximized?: () => void;
  onChatMinimized?: () => void;
  onChatHidden?: () => void;
};

declare global {
  interface Window {
    Tawk_API?: TawkApi;
    Tawk_LoadStart?: Date;
  }
}

const SCRIPT_ID = "tvse-tawk-widget";
export const OPEN_LIVE_CHAT_EVENT = "tvse:open-live-chat";

export function LiveChatButton({ className = "pill white" }: { className?: string }) {
  return (
    <button
      className={className}
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_LIVE_CHAT_EVENT))}
    >
      Start live chat <b aria-hidden="true">&rarr;</b>
    </button>
  );
}

export function TawkLiveChat() {
  const { tawkEmbedUrl } = usePublicContactLinks();
  const pathname=usePathname();
  const protectedWorkspace=/^\/(?:staff|portal|business|partner)(?:\/|$)/u.test(pathname);
  const [chatOpen, setChatOpen] = useState(false);
  const [loadRequested,setLoadRequested]=useState(false);
  const [agentStatus, setAgentStatus] = useState("connecting");
  const openWhenReady = useRef(false);

  const maximizeChat = useCallback(() => {
    const api = window.Tawk_API;
    if (api?.maximize) {
      api.showWidget?.();
      api.maximize();
      setChatOpen(true);
      return;
    }

    openWhenReady.current = true;
    setAgentStatus("connecting");
    if(tawkEmbedUrl&&!protectedWorkspace)setLoadRequested(true);
  }, [protectedWorkspace,tawkEmbedUrl]);

  useEffect(() => {
    window.addEventListener(OPEN_LIVE_CHAT_EVENT, maximizeChat);
    return () => window.removeEventListener(OPEN_LIVE_CHAT_EVENT, maximizeChat);
  }, [maximizeChat]);

  useEffect(() => {
    if(!loadRequested||!tawkEmbedUrl||protectedWorkspace)return;
    const api = window.Tawk_API ?? {};
    window.Tawk_API = api;
    window.Tawk_LoadStart = new Date();

    api.onBeforeLoad = () => api.hideWidget?.();
    api.onLoad = () => {
      setAgentStatus(api.getStatus?.() ?? "online");
      api.hideWidget?.();
      if (openWhenReady.current) {
        openWhenReady.current = false;
        api.showWidget?.();
        api.maximize?.();
        setChatOpen(true);
      }
    };
    api.onStatusChange = setAgentStatus;
    api.onChatMaximized = () => setChatOpen(true);
    api.onChatMinimized = () => {
      api.hideWidget?.();
      setChatOpen(false);
    };
    api.onChatHidden = () => setChatOpen(false);

    if (!document.getElementById(SCRIPT_ID)) {
      const script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.async = true;
      script.src = tawkEmbedUrl;
      script.charset = "UTF-8";
      script.setAttribute("crossorigin", "*");
      document.head.appendChild(script);
    }
    return()=>{document.getElementById(SCRIPT_ID)?.remove();document.querySelectorAll('iframe[src*="tawk.to"],iframe[src*="tawk.link"]').forEach((node)=>node.remove());delete window.Tawk_API;delete window.Tawk_LoadStart;};
  }, [loadRequested,protectedWorkspace,tawkEmbedUrl]);

  const statusText = agentStatus === "online" ? "Team online" : "Travel support";

  if(!tawkEmbedUrl||protectedWorkspace)return null;
  return (
    <button
      className={`live-chat-launcher${chatOpen ? " is-open" : ""}`}
      type="button"
      onClick={maximizeChat}
      aria-label="Open live chat with TVSE travel support"
      aria-haspopup="dialog"
    >
      <span className="live-chat-icon" aria-hidden="true"><i /><i /><i /></span>
      <span className="live-chat-copy"><small>{statusText}</small><strong>Chat with us</strong></span>
      <span className={`live-chat-status${agentStatus === "online" ? " is-online" : ""}`} aria-hidden="true" />
    </button>
  );
}
