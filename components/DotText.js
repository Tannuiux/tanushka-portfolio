"use client";
// DotText: any line of text, redrawn as dots that scatter around your cursor and spring back.
// The real text stays in the page (for Google, screen readers and copy-paste), it's just made invisible
// once the dots are ready. If WebGL isn't available, people simply see the normal text.
//
// How it works:
//  1. Ask the browser exactly where each letter of the real text sits on screen.
//  2. Draw those letters on a hidden canvas in the same font, and read which pixels are filled.
//  3. Put one dot on a small grid over the filled pixels. That's each dot's "home".
//  4. Every frame, dots near the cursor get pushed away and a spring pulls them home.
//     Three.js (WebGL) draws them all at once on the graphics card.
//  5. GSAP ScrollTrigger: as you scroll past, the dots drift apart like dust, and come back together
//     when you scroll up. GSAP only animates one number, "scatter" (0 = together, 1 = drifted away),
//     tied to the scroll position. The physics above moves each dot toward home + scatter x its own drift.
// When nothing is moving, it stops working so it doesn't drain batteries.
import { useEffect, useRef } from "react";

const PAD = 160; // room around the text so pushed dots can fly outside it

function letterBoxes(el) {
  const out = [];
  const walk = (node) => {
    if (node.nodeType === 3) {
      const t = node.textContent;
      for (let i = 0; i < t.length; i++) {
        if (!t[i].trim()) continue;
        const r = document.createRange();
        r.setStart(node, i); r.setEnd(node, i + 1);
        const rect = r.getBoundingClientRect();
        if (rect.width) out.push([t[i], rect]);
      }
    } else node.childNodes.forEach(walk);
  };
  walk(el);
  return out;
}

export default function DotText({ as: Tag = "span", text, className = "", gap = 2.5, size = 2.4, reach = 70 }) {
  const el = useRef(null);

  useEffect(() => {
    const host = el.current;
    if (!host) return;
    let cleanup = () => {};
    let alive = true;

    // Only load three.js and GSAP when the text is close to the screen, so the first view stays fast.
    const start = async () => {
      let THREE;
      let gsap, ScrollTrigger;
      try {
        [THREE, { gsap }, { ScrollTrigger }] = await Promise.all([import("three"), import("gsap"), import("gsap/ScrollTrigger")]);
        await document.fonts.ready;
      } catch { return; }
      gsap.registerPlugin(ScrollTrigger);
      if (!alive) return;

      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      let renderer;
      try { renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, premultipliedAlpha: false, powerPreference: "low-power" }); }
      catch { return; } // no WebGL: keep the normal text

      const cv = renderer.domElement;
      cv.className = "dt-canvas";
      cv.setAttribute("aria-hidden", "true");
      host.appendChild(cv);
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

      const scene = new THREE.Scene();
      const cam = new THREE.OrthographicCamera(0, 1, 0, 1, -1, 1);
      const geo = new THREE.BufferGeometry();
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { uSize: { value: size }, uDpr: { value: renderer.getPixelRatio() }, uCalm: { value: new THREE.Color() }, uFade: { value: 0 } },
        vertexShader: `
          attribute float aHeat; uniform float uSize; uniform float uDpr; varying float vHeat;
          void main(){ vHeat = aHeat; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
            gl_PointSize = (uSize + aHeat * uSize * 0.8) * uDpr; }`,
        fragmentShader: `
          uniform vec3 uCalm; uniform float uFade; varying float vHeat;
          void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
            vec3 hot = vec3(0.165, 0.231, 1.0); // your blue #2A3BFF while moving
            gl_FragColor = vec4(mix(uCalm, hot, clamp(vHeat,0.0,1.0)), smoothstep(0.5, 0.2, d) * (1.0 - uFade * 0.85)); }`,
      });
      scene.add(new THREE.Points(geo, mat));

      let W = 0, H = 0, home, drift, pos, vel, heat, n = 0, moving = true;
      const scroll = { scatter: 0 }; // GSAP animates this between 0 and 1
      const mouse = { x: -1e4, y: -1e4 };

      const build = () => {
        const box = host.getBoundingClientRect();
        if (!box.width) return;
        W = Math.ceil(box.width + PAD * 2); H = Math.ceil(box.height + PAD * 2);
        renderer.setSize(W, H, false);
        cv.style.width = W + "px"; cv.style.height = H + "px";
        cam.right = W; cam.bottom = H; cam.updateProjectionMatrix();

        const cs = getComputedStyle(host);
        mat.uniforms.uCalm.value.set(cs.color.startsWith("rgba(0, 0, 0, 0)") ? "#111111" : host.dataset.color || cs.color);

        // draw each letter where the browser put it, at 2x for crisp sampling
        const S = 2, c = document.createElement("canvas");
        c.width = W * S; c.height = H * S;
        const x = c.getContext("2d", { willReadFrequently: true });
        x.scale(S, S);
        x.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        x.textBaseline = "alphabetic"; x.fillStyle = "#000";
        const m = x.measureText("Hg");
        const asc = m.fontBoundingBoxAscent ?? parseFloat(cs.fontSize) * 0.8;
        const desc = m.fontBoundingBoxDescent ?? parseFloat(cs.fontSize) * 0.2;
        for (const [ch, r] of letterBoxes(host.querySelector(".dt-real"))) {
          const top = r.top - box.top + PAD + (r.height - (asc + desc)) / 2;
          x.fillText(ch, r.left - box.left + PAD, top + asc);
        }
        const data = x.getImageData(0, 0, c.width, c.height).data;
        // smaller text gets a tighter grid and smaller dots, so it stays readable on phones
        const fs = parseFloat(cs.fontSize);
        const g = Math.max(gap * 0.7, Math.min(gap, fs * 0.045));
        mat.uniforms.uSize.value = Math.max(1.8, size * (g / gap));
        const pts = [];
        for (let y = PAD; y < H - PAD; y += g)
          for (let xx = PAD; xx < W - PAD; xx += g) {
            const jx = xx + (Math.random() - 0.5) * g * 0.25, jy = y + (Math.random() - 0.5) * g * 0.25;
            if (data[((Math.round(jy * S)) * c.width + Math.round(jx * S)) * 4 + 3] > 120) pts.push(jx, jy);
          }

        n = pts.length / 2;
        home = new Float32Array(pts); drift = new Float32Array(n * 2);
        // each dot gets its own drift: mostly up and outward from the middle, a little random, like dust
        for (let i = 0; i < n; i++) {
          const fromMid = (home[i * 2] - W / 2) / (W / 2);
          drift[i * 2] = fromMid * (30 + Math.random() * 90) + (Math.random() - 0.5) * 60;
          drift[i * 2 + 1] = -(30 + Math.random() * 110) * (0.5 + Math.random());
        }
        pos = new Float32Array(n * 3); vel = new Float32Array(n * 2); heat = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          pos[i * 3] = reduce ? home[i * 2] : home[i * 2] + (Math.random() - 0.5) * W * 0.6;
          pos[i * 3 + 1] = reduce ? home[i * 2 + 1] : home[i * 2 + 1] + (Math.random() - 0.5) * H * 1.2;
        }
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        geo.setAttribute("aHeat", new THREE.BufferAttribute(heat, 1));
        host.classList.add("dt-on"); // hide the real letters now the dots are there
        moving = true;
      };
      build();

      const step = () => {
        const r2 = reach * reach; let energy = 0;
        for (let i = 0; i < n; i++) {
          const ix = i * 3, iv = i * 2;
          let px = pos[ix], py = pos[ix + 1], vx = vel[iv], vy = vel[iv + 1];
          const dx = px - mouse.x, dy = py - mouse.y, d2 = dx * dx + dy * dy;
          if (d2 < r2) { const d = Math.sqrt(d2) || 1, f = (1 - d / reach) * 2.6; vx += (dx / d) * f; vy += (dy / d) * f; }
          const tx = home[iv] + drift[iv] * scroll.scatter, ty = home[iv + 1] + drift[iv + 1] * scroll.scatter;
          vx = (vx + (tx - px) * 0.05) * 0.85; vy = (vy + (ty - py) * 0.05) * 0.85;
          pos[ix] = px + vx; pos[ix + 1] = py + vy; vel[iv] = vx; vel[iv + 1] = vy;
          const sp = Math.abs(vx) + Math.abs(vy);
          heat[i] = Math.min(1, heat[i] * 0.93 + sp * 0.06);
          energy += sp + heat[i];
        }
        geo.attributes.position.needsUpdate = true; geo.attributes.aHeat.needsUpdate = true;
        return energy / (n || 1);
      };

      let raf = 0, visible = true;
      const loop = () => {
        raf = requestAnimationFrame(loop);
        if (!visible || !moving) return;
        if (reduce) { renderer.render(scene, cam); moving = false; return; }
        mat.uniforms.uFade.value = scroll.scatter; // dots fade as they drift away
        const e = step();
        renderer.render(scene, cam);
        if (e < 0.004) moving = false; // settled: rest until the cursor comes back
      };
      loop();

      const near = (cx, cy) => {
        const r = cv.getBoundingClientRect();
        mouse.x = cx - r.left; mouse.y = cy - r.top;
        if (mouse.x > -reach && mouse.y > -reach && mouse.x < W + reach && mouse.y < H + reach) moving = true;
      };
      const onMove = (e) => near(e.clientX, e.clientY);
      const onTouch = (e) => { const t = e.touches[0]; if (t) near(t.clientX, t.clientY); };
      const onLeave = () => { mouse.x = mouse.y = -1e4; moving = true; };
      addEventListener("pointermove", onMove, { passive: true });
      addEventListener("touchmove", onTouch, { passive: true });
      addEventListener("touchend", onLeave);
      document.addEventListener("pointerleave", onLeave);

      const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) moving = true; });
      io.observe(host);

      // GSAP: scrub "scatter" from 0 to 1 over the first 500px of scrolling once its section reaches the top.
      // scrub: 0.8 means it lags the scrollbar by a moment, which makes it feel smooth, not jumpy.
      const tween = reduce ? null : gsap.to(scroll, {
        scatter: 1, ease: "power1.in",
        scrollTrigger: { trigger: host.closest("section") || host, start: "top top", end: "+=500", scrub: 0.8 },
        onUpdate: () => { moving = true; },
      });
      let rt, lastW = host.offsetWidth;
      const ro = new ResizeObserver(() => {
        clearTimeout(rt);
        rt = setTimeout(() => { if (host.offsetWidth !== lastW) { lastW = host.offsetWidth; build(); } }, 200);
      });
      ro.observe(host);

      cleanup = () => {
        tween?.scrollTrigger?.kill(); tween?.kill();
        cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); clearTimeout(rt);
        removeEventListener("pointermove", onMove); removeEventListener("touchmove", onTouch);
        removeEventListener("touchend", onLeave); document.removeEventListener("pointerleave", onLeave);
        geo.dispose(); mat.dispose(); renderer.dispose(); cv.remove(); host.classList.remove("dt-on");
      };
    };
    const near = new IntersectionObserver(([e]) => { if (e.isIntersecting) { near.disconnect(); start(); } }, { rootMargin: "0px" });
    near.observe(host);

    return () => { alive = false; near.disconnect(); cleanup(); };
  }, [text, gap, size, reach]);

  return (
    <Tag ref={el} className={`dottext ${className}`}>
      <span className="dt-real">{text}</span>
    </Tag>
  );
}
