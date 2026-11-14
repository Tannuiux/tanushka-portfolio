"use client";
// The desk scene (your hero). You sit at your desk, seen from behind, with your AI mate by the screen.
// A spinning ring invites people to say "Hey!". When they click, you turn around and wave, and your intro appears.
// Things on the desk (family photo, graduation photo, ukulele, sticky notes, book) open a short story.
// The stories live in data/content.js (deskStories).
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MeFigure, MeBack, MateBot } from "@/components/Characters";
import Magnetic from "@/components/Magnetic";
import { site, hero, desk, deskStories } from "@/data/content";
import { useTwin } from "@/components/Twin";

function Room() {
  // The 3D room (public/characters/room.webp). Swap it for your own render or a looping video later.
  return <img className="room" src="/characters/room.webp" alt="" aria-hidden="true" draggable={false} />;
}

const storyOf = (id) => { const s = deskStories.find((x) => x.id === id); return s?.same ? deskStories.find((x) => x.id === s.same) : s; };

// A pulsing dot on top of each object. Click it (or the object) to read its story.
function Spots({ onOpen }) {
  return deskStories.map((s) => (
    <button
      key={s.id} type="button" className={`spot spot-${s.id}`}
      style={{ left: s.box[0] + "%", top: s.box[1] + "%", width: s.box[2] + "%", height: s.box[3] + "%" }}
      onClick={() => onOpen(s.same || s.id)} aria-label={`Story: ${s.label}`}
    >
      {!s.same && <span className="spot-dot" aria-hidden="true" />}
      <span className="spot-tip" aria-hidden="true">{s.label}</span>
    </button>
  ));
}

function Story({ id, onClose }) {
  const s = storyOf(id);
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, [onClose]);
  if (!s) return null;
  return (
    <motion.div className="story-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        className="story" role="dialog" aria-modal="true" aria-labelledby="story-t"
        initial={{ y: 30, scale: 0.96, rotate: -1.5 }} animate={{ y: 0, scale: 1, rotate: 0 }} exit={{ y: 20, opacity: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="story-x" onClick={onClose} aria-label="Close story" autoFocus>×</button>
        {s.img && <img src={s.img} alt={s.title} className="story-img" />}
        <span className="story-k">{s.label}</span>
        <h3 id="story-t">{s.title}</h3>
        <p>{s.text}</p>
        {s.link && <a className="story-link" href={s.link[0]}>{s.link[1]} →</a>}
      </motion.div>
    </motion.div>
  );
}

export default function Desk() {
  const [said, setSaid] = useState(false);
  const [turned, setTurned] = useState(false); // you turn round and wave on your own, once the wall has gone
  const [card, setCard] = useState(true);
  const [story, setStory] = useState(null);
  const { open } = useTwin();

  // Turn round and wave: right after the wall opening ends, or a moment after the page loads if it didn't play.
  useEffect(() => {
    let t;
    const turn = () => { t = setTimeout(() => setTurned(true), 350); };
    if (window.__tpIntroPlaying) addEventListener("tp-intro-done", turn, { once: true });
    else t = setTimeout(() => setTurned(true), 900);
    return () => { clearTimeout(t); removeEventListener("tp-intro-done", turn); };
  }, []);
  const facing = turned || said;

  return (
    <header className={`desk ${said ? "said" : ""}`} id="top">
      {/* The scene keeps the room and characters lined up at any screen size. */}
      <div className="scene">
      <Room />
      <Spots onOpen={setStory} />

      {/* you, at the desk */}
      <div className="desk-me">
        <AnimatePresence mode="wait">
          {!facing ? (
            <motion.div key="back" className="me-back" exit={{ rotateY: 90, opacity: 0.6 }} transition={{ duration: 0.22, ease: "easeIn" }}>
              <MeBack />
            </motion.div>
          ) : (
            // a twist round, a little hop, then a wave (a small rock side to side)
            <motion.div
              key="front" className="me-front"
              initial={{ rotateY: -90, y: 0, rotate: 0 }}
              animate={{ rotateY: 0, y: [0, -22, 0], rotate: [0, 0, -3, 3, -2, 0] }}
              transition={{ rotateY: { duration: 0.3, ease: "easeOut" }, y: { duration: 0.55, times: [0, 0.4, 1], ease: "easeOut" }, rotate: { delay: 0.55, duration: 1.2 } }}
              style={{ transformOrigin: "bottom center" }}
            >
              <MeFigure pose="wave" alt="Tanushka waving hello" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* your AI mate by the screen */}
      <motion.button
        type="button" className="desk-mate" onClick={open} aria-label="Ask my AI mate about my work"
        animate={said ? { y: [0, -40, 0], rotate: [0, -10, 0] } : { y: 0 }}
        transition={{ duration: 0.7 }}
        whileHover={{ scale: 1.08 }}
      >
        <MateBot pose={said ? "point" : "wave"} />
        {said && <motion.span className="bubble" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}>Ask me about her work!</motion.span>}
      </motion.button>
      </div>

      {/* the "say hey" ring */}
      <AnimatePresence>
        {!said && (
          <motion.button
            type="button" className="hey" onClick={() => setSaid(true)}
            initial={{ opacity: 0, scale: 0.6 }} animate={turned ? { opacity: 1, scale: 0.72, y: "-38%" } : { opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.6 }} transition={{ type: "spring", stiffness: 160, damping: 16, delay: 0.2 }}
            whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
            aria-label='Say "Hey!" to Tanushka'
          >
            <svg viewBox="0 0 200 200" className="ring" aria-hidden="true">
              <defs><path id="ringpath" d="M100,100 m-82,0 a82,82 0 1,1 164,0 a82,82 0 1,1 -164,0" /></defs>
              <text><textPath href="#ringpath" textLength="508" lengthAdjust="spacing">{desk.ring}</textPath></text>
            </svg>
            <span className="hey-in"><small>{desk.prompt}</small><b>“{desk.hey}”</b></span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* your intro, after hey */}
      <AnimatePresence>
        {said && card && (
          <motion.div className="desk-card" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 140, damping: 18, delay: 0.35 }}>
            <button type="button" className="card-x" onClick={() => setCard(false)}>Look around my desk</button>
            <p className="reply">{desk.reply}</p>
            <h2>{hero.title}</h2>
            <p className="quote">“{hero.quote}”</p>
            <div className="ctas">
              <Magnetic><a className="btn solid" href="#hello">Meet me properly</a></Magnetic>
              <Magnetic><a className="btn" href="#work">See my projects</a></Magnetic>
              <Magnetic><a className="btn" href={site.resume} target="_blank" rel="noopener">Resume</a></Magnetic>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* every story as a chip too: the only way in on phones, where the sides of the room are cropped */}
      {(!said || !card) && (
        <div className="desk-chips" aria-label="Stories on my desk">
          <span>Click things on my desk</span>
          {deskStories.filter((s) => !s.same).map((s) => (
            <button key={s.id} type="button" onClick={() => setStory(s.id)}>{s.label}</button>
          ))}
          {said && <button type="button" className="back" onClick={() => setCard(true)}>Back to my intro</button>}
        </div>
      )}

      <AnimatePresence>{story && <Story id={story} onClose={() => setStory(null)} />}</AnimatePresence>

      {/* name stays visible for anyone who doesn't click */}
      {!said && <p className="desk-name"><b>{site.name}</b> · {hero.title}, Dublin</p>}
    </header>
  );
}
