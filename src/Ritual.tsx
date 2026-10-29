import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";
import gsap from "gsap";
import Bottle from "./Bottle";

export type RitualOrigin = { x: number; y: number; width: number; height: number };

export default function Ritual({ kind, origin, sheet, onDone }: {
  kind: "send" | "open";
  origin: RitualOrigin | null;
  sheet: RefObject<HTMLDivElement | null>;
  onDone: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  const completed = useRef(false);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  useLayoutEffect(() => { done.current = onDone; }, [onDone]);
  const finish = useCallback(() => {
    if (completed.current) return;
    completed.current = true;
    timeline.current?.pause();
    done.current();
  }, []);

  useLayoutEffect(() => {
    completed.current = false;
    const context = gsap.context(() => {
      const paper = root.current!.querySelector<HTMLElement>(".fold-paper")!;
      const object = root.current!.querySelector<HTMLElement>(".ritual-object")!;
      const target = sheet.current?.getBoundingClientRect();
      // Batch geometry reads; subsequent frames only transform existing layers.
      const p = paper.getBoundingClientRect();
      const b = object.getBoundingClientRect();
      const tl = gsap.timeline({ defaults: { ease: "power2.inOut" }, onComplete: finish });
      timeline.current = tl;
      gsap.set(".ritual-caption span", { opacity: 0 });
      gsap.set(".ritual-impact", { scale: 0.35, opacity: 0 });
      const caption = (index: number, at: number) => {
        if (index > 0) tl.to(".ritual-caption span:nth-child(" + index + ")", { opacity: 0, y: -3, duration: 0.16 }, at);
        tl.fromTo(".ritual-caption span:nth-child(" + (index + 1) + ")", { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.25 }, at + 0.1);
      };
      caption(0, 0);
      if (kind === "send") {
        if (origin) gsap.set(paper, {
          x: origin.x + origin.width / 2 - (p.x + p.width / 2),
          y: origin.y + origin.height / 2 - (p.y + p.height / 2),
          scaleX: origin.width / p.width, scaleY: origin.height / p.height,
        });
        gsap.set(object, { opacity: 0, y: 55, rotation: -8 });
        gsap.set(".bottle-cork", { yPercent: -110, opacity: 0 });
        gsap.set(".bottle-note", { opacity: 0, yPercent: -50 });
        tl.addLabel("fold", 0.3)
          .to(paper, { x: 0, y: -60, scaleX: 1, scaleY: 1, duration: 0.55 }, 0)
          .to(".fold-ink", { opacity: 0, duration: 0.25 }, 0.2)
          .to(".fold-top", { rotationX: -179, duration: 0.55 }, "fold")
          .to(".fold-bottom", { rotationX: 179, duration: 0.55 }, "fold+=0.22")
          .to(".fold-shade", { opacity: 0.35, duration: 0.5 }, "fold")
          .addLabel("bottle", 1.02)
          .to(object, { opacity: 1, y: 0, rotation: 0, duration: 0.5 }, "bottle")
          .to(paper, { scale: 0.18, y: -128, rotation: 90, duration: 0.48 }, "bottle")
          .to(paper, { y: 12, opacity: 0, duration: 0.38 }, "bottle+=0.4")
          .to(".bottle-note", { opacity: 0.86, yPercent: 0, duration: 0.38 }, "bottle+=0.5")
          .to(".bottle-cork", { yPercent: 0, opacity: 1, duration: 0.32, ease: "power3.in" }, 1.8)
          .to(object, { y: 5, duration: 0.1 }, 2.06)
          .to(object, { y: 0, duration: 0.16 }, 2.16)
          .addLabel("cast", 2.24)
          .to(object, { x: 25, y: -42, rotation: 28, duration: 0.24, ease: "power2.out" }, "cast")
          .to(object, { x: 44, y: 65, rotation: 50, duration: 0.3, ease: "power2.in" }, "cast+=0.24")
          .addLabel("water", 2.78)
          .to(".ritual-impact", { opacity: 0.65, scale: 1, duration: 0.18 }, "water")
          .to(".ritual-impact", { opacity: 0, scale: 1.65, duration: 0.64 }, "water+=0.18")
          .to(object, { x: 115, y: 0, scale: 0.32, rotation: 64, opacity: 0, duration: 0.82, ease: "power2.out" }, "water");
        caption(1, 1.65);
        caption(2, 2.72);
      } else {
        gsap.set(paper, { opacity: 0, scale: 0.17, y: -100, rotation: 90 });
        gsap.set(".fold-top", { rotationX: -179 });
        gsap.set(".fold-bottom", { rotationX: 179 });
        gsap.set(".fold-ink", { opacity: 0 });
        if (origin) gsap.set(object, {
          x: origin.x + origin.width / 2 - (b.x + b.width / 2),
          y: origin.y + origin.height / 2 - (b.y + b.height / 2),
          scaleX: origin.width / b.width, scaleY: origin.height / b.height,
        });
        tl.to(object, { x: 0, y: 36, scaleX: 1, scaleY: 1, duration: 0.5 }, 0)
          .to(".bottle-cork", { yPercent: -125, rotation: -12, duration: 0.42, ease: "power3.out" }, 0.45)
          .to(".bottle-cork", { opacity: 0, duration: 0.2 }, 0.7)
          .to(".bottle-note", { yPercent: -155, duration: 0.6 }, 0.85)
          .to(".bottle-note", { opacity: 0, duration: 0.25 }, 1.15)
          .to(paper, { opacity: 1, duration: 0.25 }, 1.2)
          .to(object, { y: 85, opacity: 0, duration: 0.45 }, 1.4)
          .to(paper, { rotation: 0, scale: 1, y: 0, duration: 0.55 }, 1.4)
          .addLabel("unfold", 1.85)
          .to(".fold-bottom", { rotationX: 0, duration: 0.6 }, "unfold")
          .to(".fold-top", { rotationX: 0, duration: 0.65 }, "unfold+=0.22");
        if (target) tl.to(paper, {
          x: target.x + target.width / 2 - (p.x + p.width / 2),
          y: target.y + target.height / 2 - (p.y + p.height / 2),
          scaleX: target.width / p.width, scaleY: target.height / p.height,
          duration: 0.6,
        }, 2.45);
        if (sheet.current) tl.to(sheet.current, { opacity: 1, duration: 0.3 }, 3.05);
        tl.to(paper, { opacity: 0, duration: 0.3 }, 3.05)
          .to(".ritual-caption", { opacity: 0, duration: 0.25 }, 2.9)
          .to(".ritual-skip", { opacity: 0, duration: 0.15 }, 3.25);
        caption(1, 1.35);
      }
    }, root);
    const visibility = () => {
      if (completed.current) return;
      if (document.hidden) timeline.current?.pause();
      else timeline.current?.resume();
    };
    // Rotation/resize completes safely instead of moving toward stale coordinates.
    const resized = () => finish();
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("resize", resized);
    visibility();
    return () => {
      completed.current = true;
      context.revert();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("resize", resized);
    };
  }, [kind, origin, sheet, finish]);

  const captions = kind === "send"
    ? ["A little piece of you, folded gently.", "Sealed with a little hope.", "The sea will take it from here."]
    : ["Something has found its way to you.", "A small world, unfolding."];
  return (
    <div className={`ritual ritual-${kind}`} ref={root}>
      <div className="ritual-stage" aria-hidden="true">
        <div className="ritual-object"><Bottle /></div>
        <div className="fold-paper">
          <div className="fold-panel fold-middle"><span className="fold-ink">To someone,<br />somewhere.</span></div>
          <div className="fold-panel fold-top"><span className="fold-shade" /></div>
          <div className="fold-panel fold-bottom"><span className="fold-shade" /></div>
        </div>
        <div className="ritual-impact"><i /><i /></div>
      </div>
      <p className="sr-only" role="status">{captions[0]}</p>
      <p className="ritual-caption" aria-hidden="true">{captions.map(caption => <span key={caption}>{caption}</span>)}</p>
      <button className="text-button ritual-skip" onClick={finish}>Skip the moment <span aria-hidden="true">→</span></button>
    </div>
  );
}
