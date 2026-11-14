"use client";
// "My name, in dots": a small Three.js experiment.
// How it works, in 4 steps:
//  1. Draw "TANUSHKA / PADELKAR" on a hidden canvas and read back which pixels are filled.
//  2. Put one dot (a WebGL point) on a grid of those filled pixels. That's each dot's "home".
//  3. Every frame, each dot is pushed away from your cursor and pulled back home by a spring.
//  4. Three.js draws all the dots in one go on the graphics card, so thousands stay smooth.
// It loads three.js only when this section is near the screen, and pauses when it scrolls away.
import { useEffect, useRef, useState } from "react";
import Reveal from "@/components/Reveal";

const LINES = ["TANUSHKA", "PADELKAR"];
let REACH = 90;       // how far the cursor pushes (px)
const PUSH = 3.2;      // how hard it pushes
const SPRING = 0.045;  // how fast dots return home
const DAMP = 0.86;     // how quickly they calm down

// Read the filled pixels of the name and turn them into dot positions (in CSS pixels).
function sampleName(w, h, gap) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const x = c.getContext("2d", { willReadFrequently: true });
  const mono = getComputedStyle(document.documentElement).getPropertyValue("--mono") || "monospace";
  let size = Math.min(w / (LINES[0].length * 0.64), h / (LINES.length * 1.05));
  x.font = `800 ${size}px ${mono}`;
  // shrink until the widest line fits
  while (Math.max(...LINES.map((l) => x.measureText(l).width)) > w * 0.94 && size > 10) {
    size -= 2; x.font = `800 ${size}px ${mono}`;
  }
  x.fillStyle = "#000"; x.textAlign = "center"; x.textBaseline = "middle";
  const lh = size * 1.0;
  LINES.forEach((l, i) => x.fillText(l, w / 2, h / 2 + (i - (LINES.length - 1) / 2) * lh));
  const data = x.getImageData(0, 0, w, h).data;
  const pts = [];
  for (let y = 0; y < h; y += gap)
    for (let xx = 0; xx < w; xx += gap)
      if (data[(y * w + xx) * 4 + 3] > 128) pts.push(xx + (Math.random() - 0.5) * gap * 0.5, y + (Math.random() - 0.5) * gap * 0.5);
  return pts;
}

export default function DotName() {
  const box = useRef(null);
  const [count, setCount] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let cleanup = () => {};
    let started = false;

    const start = async () => {
      started = true;
      let THREE;
      try { THREE = await import("three"); } catch { setFailed(true); return; }
      try { await document.fonts.ready; } catch {}

      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      let renderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, premultipliedAlpha: false, powerPreference: "low-power" });
      } catch { setFailed(true); return; }
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      el.appendChild(renderer.domElement);
      renderer.domElement.setAttribute("aria-hidden", "true");

      const scene = new THREE.Scene();
      const cam = new THREE.OrthographicCamera(0, 1, 0, 1, -1, 1);
      const geo = new THREE.BufferGeometry();
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uSize: { value: 3 }, uDpr: { value: renderer.getPixelRatio() } },
        // each dot gets a "heat" (how disturbed it is): calm dots are white, pushed dots glow coral
        vertexShader: `
          attribute float aHeat;
          uniform float uSize; uniform float uDpr;
          varying float vHeat;
          void main(){
            vHeat = aHeat;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = (uSize + aHeat * 2.5) * uDpr;
          }`,
        fragmentShader: `
          varying float vHeat;
          void main(){
            vec2 p = gl_PointCoord - 0.5;
            float d = length(p);
            if (d > 0.5) discard;
            vec3 calm = vec3(0.165, 0.231, 1.0); // your blue #2A3BFF
            vec3 hot = vec3(1.0, 0.54, 0.48);    // coral when pushed
            gl_FragColor = vec4(mix(calm, hot, clamp(vHeat, 0.0, 1.0)), smoothstep(0.5, 0.35, d));
          }`,
      });
      const points = new THREE.Points(geo, mat);
      scene.add(points);

      let W = 0, H = 0, home, pos, vel, heat, n = 0;
      const mouse = { x: -9999, y: -9999 };

      const build = () => {
        W = el.clientWidth; H = el.clientHeight;
        renderer.setSize(W, H, false);
        cam.right = W; cam.bottom = H; cam.updateProjectionMatrix();
        const gap = W < 600 ? 3 : 4;
        mat.uniforms.uSize.value = W < 600 ? 2.2 : 3.2;
        const pts = sampleName(W, H, gap);
        n = pts.length / 2;
        home = new Float32Array(pts);
        pos = new Float32Array(n * 3);
        vel = new Float32Array(n * 2);
        heat = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          // start scattered (the dots fly in), or already home if motion is reduced
          pos[i * 3] = reduce ? home[i * 2] : Math.random() * W;
          pos[i * 3 + 1] = reduce ? home[i * 2 + 1] : Math.random() * H;
        }
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        geo.setAttribute("aHeat", new THREE.BufferAttribute(heat, 1));
        REACH = W < 600 ? 60 : 90;
        setCount(n);
      };
      build();

      const step = () => {
        const r2 = REACH * REACH;
        for (let i = 0; i < n; i++) {
          const ix = i * 3, iv = i * 2;
          let x = pos[ix], y = pos[ix + 1];
          let vx = vel[iv], vy = vel[iv + 1];
          const dx = x - mouse.x, dy = y - mouse.y, d2 = dx * dx + dy * dy;
          if (d2 < r2) {
            const d = Math.sqrt(d2) || 1, f = (1 - d / REACH) * PUSH;
            vx += (dx / d) * f; vy += (dy / d) * f;
          }
          vx += (home[iv] - x) * SPRING; vy += (home[iv + 1] - y) * SPRING;
          vx *= DAMP; vy *= DAMP;
          pos[ix] = x + vx; pos[ix + 1] = y + vy;
          vel[iv] = vx; vel[iv + 1] = vy;
          heat[i] = Math.min(1, heat[i] * 0.94 + Math.hypot(vx, vy) * 0.08);
        }
        geo.attributes.position.needsUpdate = true;
        geo.attributes.aHeat.needsUpdate = true;
      };

      let raf = 0, visible = true;
      const loop = () => {
        raf = requestAnimationFrame(loop);
        if (!visible) return;
        if (!reduce) step();
        renderer.render(scene, cam);
      };
      loop();

      const setMouse = (cx, cy) => {
        const r = el.getBoundingClientRect();
        mouse.x = cx - r.left; mouse.y = cy - r.top;
      };
      const onMove = (e) => setMouse(e.clientX, e.clientY);
      const onTouch = (e) => { const t = e.touches[0]; if (t) setMouse(t.clientX, t.clientY); };
      const onLeave = () => { mouse.x = mouse.y = -9999; };
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerleave", onLeave);
      el.addEventListener("touchmove", onTouch, { passive: true });
      el.addEventListener("touchend", onLeave);

      const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
      io.observe(el);
      let rt;
      const ro = new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => { if (el.clientWidth !== W) build(); }, 200); });
      ro.observe(el);

      cleanup = () => {
        cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); clearTimeout(rt);
        el.removeEventListener("pointermove", onMove); el.removeEventListener("pointerleave", onLeave);
        el.removeEventListener("touchmove", onTouch); el.removeEventListener("touchend", onLeave);
        geo.dispose(); mat.dispose(); renderer.dispose();
        renderer.domElement.remove();
      };
    };

    // only load three.js when the section is close to the screen
    const near = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started) { near.disconnect(); start(); }
    }, { rootMargin: "400px 0px" });
    near.observe(el);
    return () => { near.disconnect(); cleanup(); };
  }, []);

  return (
    <section className="blk dotname" id="lab">
      <div className="wrap">
        <Reveal>
          <div className="eyebrow">Lab</div>
          <h2 className="sec">My name, in <i>dots.</i></h2>
          <p className="dn-lead">A small Three.js experiment from what I&apos;m learning right now. Move your cursor through it, or drag a finger on your phone.</p>
        </Reveal>
        <div className="dn-stage" ref={box} role="img" aria-label="Tanushka Padelkar written in glowing dots that scatter when you move through them">
          {failed && <p className="dn-fallback">TANUSHKA<br />PADELKAR</p>}
        </div>
        <div className="dn-meta">
          <span>{count ? `${count.toLocaleString()} dots` : "Loading dots"}</span>
          <span>Three.js · WebGL · one spring per dot</span>
        </div>
        <Reveal className="dn-learn">
          <div className="eyebrow">What I&apos;m learning</div>
          <ol>
            <li><b>GSAP and ScrollTrigger</b><span>Animation tied to scrolling, for story-led pages.</span></li>
            <li><b>Three.js</b><span>3D and graphics in the browser. I'm starting with small experiments like this one.</span></li>
            <li><b>Shaders</b><span>Small programs for the graphics card that colour and move each dot.</span></li>
          </ol>
        </Reveal>
      </div>
    </section>
  );
}
