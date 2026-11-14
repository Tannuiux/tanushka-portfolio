"use client";
// Soft background music with an on/off switch (bottom-left).
// The music is generated live in the browser with the Web Audio API: warm pad chords plus a gentle
// twinkling melody. No audio file to download and no copyright worries. It is OFF until the visitor
// turns it on (browsers block sound before a click anyway), and the choice is remembered.
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";

// Cmaj7 → Am7 → Fmaj7 → G6, in Hz. A calm, looping progression.
const CHORDS = [
  [130.81, 164.81, 196.0, 246.94],
  [110.0, 130.81, 164.81, 196.0],
  [87.31, 130.81, 174.61, 220.0],
  [98.0, 146.83, 196.0, 246.94],
];
const SCALE = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5]; // C major pentatonic, high
const BAR = 4.8; // seconds per chord

function startMusic() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const master = ctx.createGain();
  master.gain.value = 0;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = 1800;
  // a little echo for space
  const delay = ctx.createDelay(); delay.delayTime.value = 0.38;
  const fb = ctx.createGain(); fb.gain.value = 0.32;
  delay.connect(fb); fb.connect(delay);
  const analyser = ctx.createAnalyser(); analyser.fftSize = 128; analyser.smoothingTimeConstant = 0.8;
  lp.connect(master); delay.connect(master); master.connect(analyser); analyser.connect(ctx.destination);
  master.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 2.5); // fade in

  let bar = 0, next = ctx.currentTime + 0.1, alive = true;
  const pad = (f, t) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "triangle"; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 8;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.11, t + 1.2);
    g.gain.linearRampToValueAtTime(0.0, t + BAR + 0.6);
    o.connect(g); g.connect(lp); o.start(t); o.stop(t + BAR + 0.8);
  };
  const bell = (f, t) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.value = f;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    o.connect(g); g.connect(lp); g.connect(delay); o.start(t); o.stop(t + 1.7);
  };
  const tick = () => {
    if (!alive) return;
    while (next < ctx.currentTime + 1) {
      CHORDS[bar % CHORDS.length].forEach((f) => pad(f, next));
      for (let k = 0; k < 4; k++) if (Math.random() < 0.6) bell(SCALE[(Math.random() * SCALE.length) | 0], next + k * (BAR / 4) + Math.random() * 0.2);
      next += BAR; bar++;
    }
    setTimeout(tick, 300);
  };
  tick();
  return {
    analyser,
    stop() {
      alive = false;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8); // fade out
      setTimeout(() => ctx.close(), 1000);
    },
  };
}

const N = 22; // number of bars in the waveform

export default function Music() {
  const [on, setOn] = useState(false);
  const player = useRef(null);
  const bars = useRef([]);

  const start = () => { player.current = startMusic(); setOn(true); };
  const stop = () => { player.current?.stop(); player.current = null; setOn(false); };
  const toggle = () => {
    if (on) { stop(); try { localStorage.setItem("music", "off"); } catch {} }
    else { start(); try { localStorage.setItem("music", "on"); } catch {} }
  };

  // If they turned it on before, it starts again on their first click anywhere (browsers need a click).
  useEffect(() => {
    let wanted = false;
    try { wanted = localStorage.getItem("music") === "on"; } catch {}
    if (!wanted) return;
    const first = () => { if (!player.current) start(); };
    addEventListener("pointerdown", first, { once: true });
    return () => { removeEventListener("pointerdown", first); player.current?.stop(); };
  }, []);

  // Live waveform: bar heights follow the music.
  useEffect(() => {
    if (!on) return;
    let raf;
    const data = new Uint8Array(64);
    const draw = (t) => {
      const a = player.current?.analyser;
      if (a) a.getByteFrequencyData(data);
      bars.current.forEach((el, i) => {
        if (!el) return;
        const d = Math.abs(i - (N - 1) / 2);            // centre bars = low notes, edges = high notes
        const v = Math.min(1, ((data[Math.min(30, Math.round(d * 0.9) + 1)] || 0) / 255) * (1 + d * 0.22));
        const wobble = 0.5 + 0.5 * Math.sin(t / 220 + i * 1.3) * Math.cos(t / 410 + i * 0.4);
        el.style.transform = `scaleY(${Math.max(0.12, Math.min(1, (0.15 + v) * (0.45 + wobble * 0.7)))})`;
      });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [on]);

  return (
    <motion.button type="button" className={`music ${on ? "on" : ""}`} onClick={toggle}
      aria-pressed={on} aria-label={on ? "Turn background music off" : "Turn background music on"}
      title={on ? "Music on. Click to turn off" : "Click to play music"}
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.2 }} whileTap={{ scale: 0.94 }}>
      <span className="music-wave" aria-hidden="true">
        {Array.from({ length: N }, (_, i) => <i key={i} ref={(el) => (bars.current[i] = el)} />)}
      </span>
      <span className="music-label">{on ? "Sound on" : "Play music"}</span>
    </motion.button>
  );
}
