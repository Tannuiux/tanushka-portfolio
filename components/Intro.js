"use client";
// The opening, built with a GSAP timeline.
//  1. The blue wall covers the whole screen, with your name on it.
//  2. The wall gives a little nudge: someone is pushing it from the left.
//  3. You and your AI mate push it, feet on the floor, hands on its edge. You're attached to the wall,
//     so the three of you move together, and your desk appears behind you as it slides away.
//  4. The wall and the two of you leave off the right edge. The desk is the page.
// Plays once per visit (per browser tab), has a Skip button, and is skipped if someone prefers reduced motion.
import { useEffect, useRef, useState } from "react";
import { site } from "@/data/content";

const KEY = "tp-intro-seen";

export default function Intro() {
  const [show, setShow] = useState(true);
  const root = useRef(null);
  const tlRef = useRef(null);

  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem(KEY) === "1"; } catch {}
    if (seen || matchMedia("(prefers-reduced-motion: reduce)").matches) { setShow(false); return; }

    document.documentElement.style.overflow = "hidden";
    window.__tpIntroPlaying = true; // tells the desk to wait before you turn round
    let tl, alive = true;
    const finish = () => {
      try { sessionStorage.setItem(KEY, "1"); } catch {}
      document.documentElement.style.overflow = "";
      window.__tpIntroPlaying = false;
      dispatchEvent(new Event("tp-intro-done"));
      if (alive) setShow(false);
    };

    import("gsap").then(({ gsap }) => {
      if (!alive || !root.current) return;
      const q = gsap.utils.selector(root.current);
      tl = gsap.timeline({ onComplete: finish });
      tlRef.current = tl;

      // 1. your name is already on the closed wall, so people get a moment to read it
      // 2. the nudge: the wall budges a little, then settles back
      tl.to(q(".wl-wall"), { x: 18, duration: 0.18, ease: "power2.out" }, 0.9)
        .to(q(".wl-wall"), { x: 8, duration: 0.22, ease: "power2.inOut" })
        // 3. the push: slow at first (it's heavy), then it gets going and slides off the right edge.
        //    xPercent 135 = the wall's own width plus room for the two of you to leave the screen too.
        .to(q(".wl-wall"), { xPercent: 135, duration: 2.3, ease: "power1.in" }, "+=0.1")
        // walking: small steps while pushing (runs at the same time as the push, "<")
        .to(q(".wl-me"), { y: -7, duration: 0.2, repeat: 9, yoyo: true, ease: "sine.inOut" }, "<")
        .to(q(".wl-mate"), { y: -5, rotate: -3, duration: 0.2, repeat: 11, yoyo: true, ease: "sine.inOut" }, "<");
    }).catch(finish);

    return () => { alive = false; tl?.kill(); document.documentElement.style.overflow = ""; };
  }, []);

  if (!show) return null;
  const [first, ...rest] = site.name.split(" ");

  return (
    <div className="wl" ref={root}>
      <div className="wl-wall" aria-hidden="true">
        <div className="wl-name">
          <span>{first}</span>
          <span>{rest.join(" ")}</span>
          <small>Product Designer · Dublin</small>
        </div>
        {/* you and your mate stand just outside the wall's left edge, so you move with it */}
        <div className="wl-pushers">
          <img className="wl-me" src="/characters/me-push.webp" alt="" draggable={false} />
          <img className="wl-mate" src="/characters/mate-push.webp" alt="" draggable={false} />
        </div>
      </div>
      <button type="button" className="wl-skip" onClick={() => { if (tlRef.current) tlRef.current.progress(1); else { document.documentElement.style.overflow = ""; window.__tpIntroPlaying = false; dispatchEvent(new Event("tp-intro-done")); setShow(false); } }}>Skip intro</button>
    </div>
  );
}
