import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
export default function Ritual({
  kind,
  onDone,
}: {
  kind: "send" | "open";
  onDone: () => void;
}) {
  const root = useRef<HTMLDivElement>(null),
    done = useRef(onDone);
  const [caption, setCaption] = useState(
    kind === "send"
      ? "A little piece of you, folded gently."
      : "Something has found its way to you.",
  );
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);
  useEffect(() => {
    let timeline: gsap.core.Timeline;
    const context = gsap.context(() => {
      timeline = gsap.timeline({
        defaults: { duration: 0.65, ease: "power2.inOut" },
        onComplete: () => done.current(),
      });
      if (kind === "send") {
        timeline
          .set(".ritual-glass", { opacity: 0 })
          .set(".ritual-cork", { y: -35, opacity: 0 })
          .to(".ritual-paper", { scaleY: 0.15, rotate: -5, duration: 0.8 })
          .to(".ritual-paper", { scaleX: 0.22, y: 48, opacity: 0 })
          .to(".ritual-glass", { opacity: 1 }, "<")
          .to(".ritual-cork", { y: 0, opacity: 1 })
          .call(() => setCaption("Sealed with a little hope."))
          .to(".ritual-object", { y: 50, rotate: 14, duration: 0.7 })
          .call(() => setCaption("The sea will take it from here."))
          .to(".ritual-object", {
            x: 110,
            y: -40,
            scale: 0.15,
            opacity: 0,
            duration: 1.4,
          });
      } else {
        timeline
          .set(".ritual-paper", { opacity: 0, scaleX: 0.2, scaleY: 0.1, y: 50 })
          .from(".ritual-object", {
            x: 110,
            y: -40,
            scale: 0.15,
            opacity: 0,
            duration: 1.2,
          })
          .to(".ritual-cork", { y: -50, rotate: 20, opacity: 0 })
          .call(() => setCaption("A small world, unfolding."))
          .to(".ritual-glass", { opacity: 0 })
          .to(
            ".ritual-paper",
            { opacity: 1, y: 0, scaleX: 1, scaleY: 1, duration: 0.9 },
            "<",
          );
      }
    }, root);
    const visibility = () => {
      if (document.hidden) timeline.pause();
      else timeline.resume();
    };
    document.addEventListener("visibilitychange", visibility);
    visibility();
    return () => {
      context.revert();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [kind]);
  return (
    <div className="ritual" ref={root}>
      <div className="ritual-object" aria-hidden="true">
        <div className="ritual-glass">
          <div className="rolled-note" />
        </div>
        <div className="ritual-cork" />
        <div className="ritual-paper">
          To someone,
          <br />
          somewhere.<span>〰</span>
        </div>
      </div>
      <p role="status">{caption}</p>
      <button className="text-button" onClick={onDone}>
        Skip the moment <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}
