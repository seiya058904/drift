import { useEffect, useRef, useState } from "react";

type WidgetOptions = {
  sitekey: string;
  action: string;
  theme: "light";
  size: "compact" | "flexible";
  appearance: "interaction-only";
  retry: "never";
  "refresh-expired": "manual";
  "refresh-timeout": "manual";
  "response-field": false;
  callback: (token: string) => void;
  "error-callback": (code: string) => boolean;
  "before-interactive-callback": () => void;
  "after-interactive-callback": () => void;
  "unsupported-callback": () => void;
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
function failureMessage(code: string) {
  if (["110100", "110110", "110200", "400020", "400021", "400070"].includes(code))
    return "Verification is not configured for this site. Please try again later.";
  if (code === "200100" || code === "110600")
    return "Verification timed out. Check your device’s date and time, then retry.";
  if (code === "200500")
    return "The verification service could not load. Check your connection or try another browser.";
  if (/^(300|600)/.test(code))
    return "Cloudflare could not verify this browser. Retry, or try another browser or network.";
  return "Verification could not finish. Please try again.";
}
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
  const [errorCode, setErrorCode] = useState("");
  useEffect(() => {
    let cancelled = false, widget: string | undefined, api: TurnstileApi | undefined;
    let waiting: number | undefined;
    onToken("");
    setFailed(false);
    setErrorCode("");
    setStatus("Checking your browser…");
    const fail = (message: string) => {
      if (cancelled) return;
      clearTimeout(waiting);
      onToken("");
      setFailed(true);
      setStatus(message);
    };
    const watchProgress = () => {
      clearTimeout(waiting);
      waiting = window.setTimeout(() => fail("Verification is taking too long. Check your connection and retry."), 45000);
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
      watchProgress();
      widget = api.render(container.current, {
        sitekey, action, theme: "light",
        size: container.current.clientWidth < 300 ? "compact" : "flexible",
        appearance: "interaction-only", retry: "never", "response-field": false,
        "refresh-expired": "manual", "refresh-timeout": "manual",
        callback: (token) => {
          if (cancelled) return;
          clearTimeout(waiting);
          onToken(token);
          setFailed(false);
          setErrorCode("");
          setStatus("Verification complete.");
        },
        "error-callback": (code) => {
          if (cancelled) return true;
          const safeCode = typeof code === "string" && /^\d{6}$/.test(code) ? code : "";
          setErrorCode(safeCode);
          fail(failureMessage(safeCode));
          return true;
        },
        "before-interactive-callback": () => {
          if (cancelled) return;
          clearTimeout(waiting);
          setStatus("Please complete the verification below.");
        },
        "after-interactive-callback": () => {
          if (cancelled) return;
          setStatus("Checking your browser…");
          watchProgress();
        },
        "unsupported-callback": () => fail("This browser does not support verification. Please try an up-to-date browser."),
        "expired-callback": () => fail("Verification expired. Please verify again."),
        "timeout-callback": () => fail("Verification timed out. Please try again."),
      });
    }).catch(() => fail("Verification could not load. Check your connection and try again."));
    return () => {
      cancelled = true;
      clearTimeout(waiting);
      if (widget !== undefined) api?.remove(widget);
    };
  }, [action, onToken, attempt]);
  return <div className="verification">
    <div ref={container} className="verification-widget" />
    <p className="form-note" role="status">{status}</p>
    {failed && errorCode ? <p className="form-note">Verification code: {errorCode}</p> : null}
    {failed ? <button type="button" className="text-button" disabled={busy}
      onClick={() => setAttempt((value) => value + 1)}>Retry verification</button> : null}
  </div>;
}
