import { useEffect, useRef, useState } from "react";

type WidgetOptions = {
  sitekey: string;
  action: string;
  theme: "light";
  size: "compact" | "flexible";
  appearance: "interaction-only";
  retry: "never";
  "response-field": false;
  callback: (token: string) => void;
  "error-callback": () => boolean;
  "expired-callback": () => void;
  "timeout-callback": () => void;
};
type TurnstileApi = {
  render: (container: HTMLElement, options: WidgetOptions) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window { turnstile?: TurnstileApi }
}
let scriptPromise: Promise<TurnstileApi> | undefined;
function loadScript() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      const fail = () => {
        clearTimeout(timer);
        script.remove();
        reject(new Error("Verification could not load. Check your connection and try again."));
      };
      const timer = window.setTimeout(fail, 15000);
      script.onerror = fail;
      script.onload = () => {
        if (!window.turnstile) return fail();
        clearTimeout(timer);
        resolve(window.turnstile);
      };
      document.head.appendChild(script);
    }).catch((error) => {
      scriptPromise = undefined;
      throw error;
    });
  }
  return scriptPromise;
}

export default function Turnstile({ action, onToken, busy }: {
  action: "submit_bottle" | "report_bottle";
  onToken: (value: string) => void;
  busy: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState("Checking your browser…");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false, widget: string | undefined, api: TurnstileApi | undefined;
    onToken("");
    setFailed(false);
    setStatus("Checking your browser…");
    const fail = (message: string) => {
      if (cancelled) return;
      onToken("");
      setFailed(true);
      setStatus(message);
    };
    void Promise.all([
      loadScript(),
      fetch("/api/turnstile", { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(10000) })
        .then(async (response) => {
          if (!response.ok) throw Error("Verification is unavailable. Please try again shortly.");
          const config: { siteKey?: string } = await response.json();
          if (!config.siteKey) throw Error("Verification is unavailable. Please try again shortly.");
          return config.siteKey;
        }),
    ]).then(([loaded, sitekey]) => {
      if (cancelled || !container.current) return;
      api = loaded;
      widget = api.render(container.current, {
        sitekey, action, theme: "light",
        size: container.current.clientWidth < 300 ? "compact" : "flexible",
        appearance: "interaction-only", retry: "never", "response-field": false,
        callback: (token) => {
          if (cancelled) return;
          onToken(token);
          setFailed(false);
          setStatus("Verification complete.");
        },
        "error-callback": () => { fail("Verification could not finish. Please try again."); return true; },
        "expired-callback": () => fail("Verification expired. Please verify again."),
        "timeout-callback": () => fail("Verification timed out. Please try again."),
      });
    }).catch(() => fail("Verification could not load. Check your connection and try again."));
    return () => {
      cancelled = true;
      if (widget !== undefined) api?.remove(widget);
    };
  }, [action, onToken, attempt]);
  return <div className="verification">
    <div ref={container} className="verification-widget" />
    <p className="form-note" role="status">{status}</p>
    {failed ? <button type="button" className="text-button" disabled={busy}
      onClick={() => setAttempt((value) => value + 1)}>Retry verification</button> : null}
  </div>;
}
