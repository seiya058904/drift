import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { api, ApiError } from "./api";
import RitualBoundary from "./RitualBoundary";
import Turnstile from "./Turnstile";
import Bottle from "./Bottle";
import { useScene, type View } from "./useScene";
import type { RitualOrigin } from "./Ritual";
const loadRitual = () => import("./Ritual");
const Ritual = lazy(loadRitual);
type Bottle = { id: string; body: string };
function Icon({
  name,
}: {
  name: "sound" | "mute" | "moon" | "sun" | "close" | "arrow";
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "close" ? (
        <path d="m6 6 12 12M18 6 6 18" />
      ) : name === "moon" ? (
        <path d="M20 15.2A8.5 8.5 0 0 1 8.8 4a8.5 8.5 0 1 0 11.2 11.2Z" />
      ) : name === "sun" ? (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
        </>
      ) : name === "arrow" ? (
        <path d="M4 12h15m-5-5 5 5-5 5" />
      ) : (
        <>
          <path d="m11 5-5 4H3v6h3l5 4V5Z" />
          {name === "sound" ? (
            <path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
          ) : (
            <path d="m16 9 5 6m0-6-5 6" />
          )}
        </>
      )}
    </svg>
  );
}
export default function App() {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [token, setToken] = useState(""),
    [bottle, setBottle] = useState<Bottle | null>(null),
    [reported, setReported] = useState(false);
  const [sound, setSoundState] = useState(false),
    [atmosphere, setAtmosphere] = useState(true);
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [confirmReport, setConfirmReport] = useState(false);
  const [sendProof, setSendProof] = useState(""),
    [reportProof, setReportProof] = useState("");
  const [sendAttempt, setSendAttempt] = useState(0),
    [reportAttempt, setReportAttempt] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null),
    submitKey = useRef(crypto.randomUUID()),
    drawKey = useRef(crypto.randomUUID()),
    pending = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null),
    audioModule = useRef<typeof import("./audio") | null>(null);
  const count = Array.from(message).length,
    motion = atmosphere && !reduced;
  const { view, navigate, sheet, leaving, closing } = useScene(motion);
  const [origin, setOrigin] = useState<RitualOrigin | null>(null);
  const go = useCallback((next: View) => {
    setError("");
    setConfirmReport(false);
    navigate(next);
  }, [navigate]);
  const captureOrigin = (selector: string) => {
    const element = dialog.current?.querySelector(selector);
    if (!element) return;
    const { x, y, width, height } = element.getBoundingClientRect();
    setOrigin({ x, y, width, height });
  };
  useEffect(() => {
    if (motion && (view === "write" || view === "found")) {
      // Optional preloading never blocks the form or swallows the lazy boundary.
      void loadRitual().catch(() => {});
    }
  }, [view, motion]);
  useEffect(() => {
    performance.mark("drift-interactive");
    const query = matchMedia("(prefers-reduced-motion: reduce)"),
      change = () => setReduced(query.matches);
    query.addEventListener("change", change);
    const hidden = () => {
      document.documentElement.classList.toggle("is-hidden", document.hidden);
      void audioModule.current?.suspendWhenHidden();
    };
    document.addEventListener("visibilitychange", hidden);
    hidden();
    return () => {
      query.removeEventListener("change", change);
      document.removeEventListener("visibilitychange", hidden);
      void audioModule.current?.setSound(false);
    };
  }, []);
  useEffect(() => {
    const element = dialog.current;
    if (view !== "home" && element && !element.open) {
      if (!returnFocus.current?.isConnected)
        returnFocus.current = document.activeElement as HTMLElement;
      element.showModal();
    }
    if (view === "home" && element?.open) {
      element.close();
      returnFocus.current?.focus();
    }
  }, [view]);
  useEffect(() => {
    if (view !== "home")
      dialog.current?.querySelector<HTMLElement>("[data-heading]")?.focus({ preventScroll: true });
  }, [view]);
  useEffect(() => {
    if (!motion && view === "ritual-send") go("sent");
    if (!motion && view === "ritual-open") go("read");
  }, [motion, view, go]);
  async function perform(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "The tide is unsettled. Please try again.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function send() {
    if (!sendProof) return;
    await perform(async () => {
      try {
        const result = await api<{ status: string }>("bottles", {
          body: message,
          requestKey: submitKey.current,
          turnstileToken: sendProof,
        });
        if (result.status !== "approved") {
          go("held");
          return;
        }
        captureOrigin("textarea");
        setMessage("");
        submitKey.current = crypto.randomUUID();
        go(motion ? "ritual-send" : "sent");
      } finally {
        setSendProof("");
        setSendAttempt((value) => value + 1);
      }
    });
  }
  async function find() {
    await perform(async () => {
      const result = await api<{ token?: string; empty?: boolean }>("draw", {
        requestKey: drawKey.current,
      }).catch((err: unknown) => {
        if (err instanceof ApiError && err.code === "expired")
          drawKey.current = crypto.randomUUID();
        throw err;
      });
      if (result.empty) {
        drawKey.current = crypto.randomUUID();
        go("empty");
      } else if (result.token) {
        setToken(result.token);
        setReported(false);
        go("found");
      }
    });
  }
  async function open() {
    await perform(async () => {
      const found = await api<Bottle>("open", { token });
      setBottle(found);
      captureOrigin(".found-bottle .bottle");
      drawKey.current = crypto.randomUUID();
      go(motion ? "ritual-open" : "read");
    });
  }
  async function report() {
    if (!reportProof) return;
    await perform(async () => {
      try {
        await api("report", { id: bottle?.id, turnstileToken: reportProof });
        setReported(true);
        setConfirmReport(false);
      } finally {
        setReportProof("");
        setReportAttempt((value) => value + 1);
      }
    });
  }
  async function toggleSound() {
    try {
      audioModule.current ||= await import("./audio");
      await audioModule.current.setSound(!sound);
      setSoundState(!sound);
    } catch {
      setError(
        "Sound could not start in this browser. You can still enjoy the sea.",
      );
    }
  }
  const close = () => {
    if (!busy) go("home");
  };
  return (
    <div
      className={`app ${motion ? "motion" : "still"} ${atmosphere ? "" : "quiet"}`}
      data-scene={view}
    >
      <div className="seascape" aria-hidden="true" />
      <div className="sea-sheen" aria-hidden="true" />
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="Drift home">
          drift
        </a>
        <div className="settings">
          <button
            className="icon-button"
            aria-label={sound ? "Mute ocean sound" : "Enable ocean sound"}
            aria-pressed={sound}
            title={sound ? "Sound on" : "Sound off"}
            onClick={toggleSound}
          >
            <Icon name={sound ? "sound" : "mute"} />
          </button>
          <button
            className="icon-button"
            aria-label={
              atmosphere ? "Turn atmosphere off" : "Turn atmosphere on"
            }
            aria-pressed={atmosphere}
            title="Atmosphere"
            onClick={() => setAtmosphere(!atmosphere)}
          >
            <Icon name={atmosphere ? "moon" : "sun"} />
          </button>
        </div>
      </header>
      <main id="main">
        <section className="welcome" aria-labelledby="home-heading">
          <h1 id="home-heading">
            Some words
            <br />
            <em>are meant to drift.</em>
          </h1>
          <p className="intro">
            A thought, a secret, a little hope.
            <br />
            Send it out. See what finds you.
          </p>
          <div className="home-actions">
            <button
              className="button primary"
              onClick={(event) => {
                returnFocus.current = event.currentTarget;
                go("write");
              }}
              disabled={busy}
            >
              Cast a bottle
            </button>
            <button
              className="button secondary"
              onClick={(event) => {
                returnFocus.current = event.currentTarget;
                void find();
              }}
              disabled={busy}
              aria-busy={busy && view === "home"}
            >
              {busy && view === "home"
                ? "Listening to the sea…"
                : "Find a bottle"}
            </button>
          </div>
          {view === "home" && error ? (
            <p role="alert" className="home-error">
              {error}
            </p>
          ) : null}
        </section>
        <div className="floating-bottle" aria-hidden="true">
          <div className="bottle-bob"><div className="bottle-tilt"><Bottle /></div></div>
          <span className="water-shadow" />
          <span className="ripple ripple-near" />
          <span className="ripple ripple-far" />
        </div>
      </main>
      <footer className="site-footer">
        <span>
          No names. No replies.
          <span className="mobile-break" /> Just a moment shared.
        </span>
        <button
          className="text-button"
          onClick={(event) => {
            returnFocus.current = event.currentTarget;
            go("about");
          }}
        >
          About &amp; privacy
        </button>
      </footer>
      <dialog
        ref={dialog}
        className={`sheet-dialog ${view.startsWith("ritual") ? "ritual-dialog" : ""} ${closing ? "is-leaving" : ""}`}
        aria-labelledby="dialog-heading"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
      >
        <div className="paper" ref={sheet} inert={leaving || view.startsWith("ritual")} aria-hidden={view.startsWith("ritual") || undefined}>
          {!view.startsWith("ritual") ? (
            <button
              className="close-button"
              aria-label="Back to the sea"
              disabled={busy}
              onClick={close}
            >
              <Icon name="close" />
            </button>
          ) : null}
          {view === "write" ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              <h2 id="dialog-heading" data-heading tabIndex={-1}>
                What would you send
                <br className="desktop-break" /> into the sea?
              </h2>
              <label htmlFor="message">Your message</label>
              <textarea
                id="message"
                placeholder="Somewhere, someone might need your words."
                value={message}
                onChange={(event) => {
                  setMessage(event.target.value);
                  submitKey.current = crypto.randomUUID();
                  setError("");
                }}
                disabled={busy}
                aria-describedby="message-help message-count"
                aria-invalid={count > 500}
                spellCheck
              />
              <div className="writing-meta">
                <span id="message-help">A little kindness travels far.</span>
                <span
                  id="message-count"
                  className={count > 500 ? "over-limit" : ""}
                >
                  {count} / 500
                </span>
              </div>
              <p className="form-note">
                Keep names, contact details and links ashore.
              </p>
              <Turnstile key={`send-${sendAttempt}`} action="submit_bottle" onToken={setSendProof} busy={busy} />
              <button
                className="button ink full"
                disabled={busy || !message.trim() || count > 500 || !sendProof}
                type="submit"
                aria-busy={busy}
              >
                {busy ? "Entrusting your words…" : "Seal & send"}
                <Icon name="arrow" />
              </button>
              <p className="paper-footnote">
                No names. No replies. Just a moment shared.
              </p>
            </form>
          ) : null}
          {view === "found" ? (
            <div className="centered">
              <h2 id="dialog-heading" data-heading tabIndex={-1}>
                A bottle found you.
              </h2>
              <p>Someone, somewhere, left a little of their world.</p>
              <div className="found-bottle" role="img" aria-label="A glass bottle holding a rolled letter"><Bottle /></div>
              <button
                className="button ink full"
                onClick={open}
                disabled={busy}
                aria-busy={busy}
              >
                {busy ? "Opening your bottle…" : "Open the bottle"}
                <Icon name="arrow" />
              </button>
              <p className="paper-footnote">
                A moment of connection. Nothing more is asked.
              </p>
            </div>
          ) : null}
          {(view === "read" || view === "ritual-open") && bottle ? (
            <>
              <h2 id={view === "read" ? "dialog-heading" : undefined} data-heading={view === "read" ? "" : undefined} tabIndex={-1}>
                A message found
                <br /> its way to you.
              </h2>
              <div className="ornament" aria-hidden="true">
                <span />✧<span />
              </div>
              <blockquote
                className="message-body"
                dir="auto"
                tabIndex={0}
                aria-label="Bottle message"
              >
                {bottle.body}
              </blockquote>
              <div className="message-meta">
                <span>From a stranger, somewhere.</span>
                <button
                  className="text-button"
                  onClick={() => setConfirmReport(!confirmReport)}
                  disabled={reported || busy}
                >
                  {reported ? "Reported" : "Report"}
                </button>
              </div>
              <div className="report-disclosure" data-open={confirmReport} inert={!confirmReport} aria-hidden={!confirmReport}>
                <div>
                <div className="report-confirm">
                  <p>Does this message feel harmful or unwanted?</p>
                  {confirmReport ? <Turnstile key={`report-${reportAttempt}`} action="report_bottle" onToken={setReportProof} busy={busy} /> : null}
                  <button
                    className="text-button"
                    onClick={report}
                    disabled={busy || !reportProof}
                  >
                    {busy ? "Reporting…" : "Report this bottle"}
                  </button>
                  <button
                    className="text-button"
                    onClick={() => setConfirmReport(false)}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                </div>
                </div>
              </div>
              {reported ? (
                <p className="form-note" role="status">
                  Thank you. Your report has been received.
                </p>
              ) : null}
              <button className="button paper-outline full" onClick={close}>
                Back to the sea
              </button>
            </>
          ) : null}
          {view === "empty" ? (
            <div className="centered">
              <h2 id="dialog-heading" data-heading tabIndex={-1}>
                The sea is quiet
                <br /> for now.
              </h2>
              <div className="empty-wave" aria-hidden="true">
                〰
              </div>
              <p>
                Every bottle has its own tide.
                <br />
                Come back a little later, or send a thought of your own.
              </p>
              <button className="button ink full" onClick={() => go("write")}>
                Cast a bottle
              </button>
              <button className="text-button" onClick={close}>
                Stay by the sea
              </button>
            </div>
          ) : null}
          {view === "sent" ? (
            <div className="centered">
              <h2 id="dialog-heading" data-heading tabIndex={-1}>
                Your words are
                <br />
                <em>on their way.</em>
              </h2>
              <div className="ornament" aria-hidden="true">
                <span />✧<span />
              </div>
              <p>
                Somewhere beyond the horizon,
                <br />
                they may be just what someone needs.
              </p>
              <button className="button ink full" onClick={close}>
                Back to the sea
              </button>
            </div>
          ) : null}
          {view === "held" ? (
            <div className="centered">
              <h2 id="dialog-heading" data-heading tabIndex={-1}>
                Let’s keep the sea kind.
              </h2>
              <p>
                This message hasn’t been released. It may need a review or a
                little editing.
              </p>
              <p className="form-note">
                Avoid contact details, links, repeated text and harmful words.
                Your draft is still here.
              </p>
              <button
                className="button ink full"
                onClick={() => {
                  submitKey.current = crypto.randomUUID();
                  go("write");
                }}
              >
                Return to your words
              </button>
            </div>
          ) : null}
          {view === "about" ? (
            <>
              <h2 id="dialog-heading" data-heading tabIndex={-1}>
                A small sea.
                <br />A shared humanity.
              </h2>
              <div className="about-copy">
                <p>
                  Drift is a place for words without an audience. Leave a
                  thought for a stranger. Find a thought left for you. There are
                  no accounts, replies, followers or read receipts.
                </p>
                <h3>Be gentle with what you share.</h3>
                <p>
                  Messages are public, plain text, up to 500 Unicode characters.
                  Please leave out names, private information, links and contact
                  details. Automated rules check messages; they can miss harmful
                  content. Use Report when something does not belong here. Three
                  different visitors’ reports pause a bottle for review.
                </p>
                <h3>A visit, not a profile.</h3>
                <p>
                  A secure, essential cookie lasts 24 hours. It helps prevent
                  repeats and abuse. Session links, reading and report
                  deduplication records are removed after 24 hours, at the next
                  hourly cleanup. We never show reading counts. Drift does not
                  use audience analytics, advertising trackers or a persistent
                  visitor profile.
                </p>
                <p>
                  We do not store raw IP addresses. A daily rotating keyed hash
                  is used for rate limits. Messages and aggregate counts remain
                  until moderated or removed. Closing the page does not delete a
                  message already sent.
                </p>
                <h3>Beyond the shoreline.</h3>
                <p>
                  Cloudflare Turnstile checks your browser when you open the
                  writing or report form to help prevent automated abuse. It
                  processes browser and network signals under Cloudflare’s{" "}
                  <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">privacy policy</a>.
                  Home, finding and reading do not require this check. Tokens
                  are short-lived; Drift does not store them. Verification
                  never receives your message text.
                </p>
                <p>
                  Cloudflare handles requests and may retain infrastructure or
                  security logs under its own policies. Application request
                  logging is disabled. Encrypted operational backups are
                  retained for 7 days; platform recovery copies have their own
                  retention. A restore is followed by expiry cleanup.
                </p>
                <h3>Make yourself comfortable.</h3>
                <p>
                  Sound is off until you choose it. The moon button turns the
                  atmosphere off. Your device’s reduced-motion preference is
                  respected, and sound and movement pause when this tab is
                  hidden.
                </p>
              </div>
              <button className="button ink full" onClick={close}>
                Back to the sea
              </button>
            </>
          ) : null}
          {view !== "home" && error ? (
            <div role="alert" className="error-message">
              <p>{error}</p>
              {view === "found" ? (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    drawKey.current = crypto.randomUUID();
                    void find();
                  }}
                >Find another bottle</button>
              ) : null}
            </div>
          ) : null}
        </div>
          {view === "ritual-send" || view === "ritual-open" ? (
            <>
              <h2
                className="sr-only"
                id="dialog-heading"
                data-heading
                tabIndex={-1}
              >
                {view === "ritual-send"
                  ? "Your bottle is on its way"
                  : "Your bottle is opening"}
              </h2>
              <RitualBoundary
                key={view}
                fallback={
                  <button
                    className="button primary"
                    onClick={() => go(view === "ritual-send" ? "sent" : "read")}
                  >
                    Continue
                  </button>
                }
              >
                <Suspense
                  fallback={
                    <div className="centered">
                      <p>A small moment, just for you.</p>
                      <button
                        className="button primary"
                        onClick={() =>
                          go(view === "ritual-send" ? "sent" : "read")
                        }
                      >
                        Continue
                      </button>
                    </div>
                  }
                >
                  <Ritual
                    kind={view === "ritual-send" ? "send" : "open"}
                    origin={origin}
                    sheet={sheet}
                    onDone={() => go(view === "ritual-send" ? "sent" : "read")}
                  />
                </Suspense>
              </RitualBoundary>
            </>
          ) : null}
      </dialog>
    </div>
  );
}
