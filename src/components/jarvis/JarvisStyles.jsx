/*

 * JARVES assistant - self-contained visual styles.

 *

 * Rendered once by the assistant (an inline <style>), so the feature adds NO

 * changes to index.css, tailwind.config.js or the marketing stylesheet, and

 * every class is namespaced \`jarvis-\` to avoid touching existing markup.

 *

 * Orb design language: a MULTI-COLOUR living energy core - teal, cyan, blue,

 * emerald, violet and soft pink plasma layers orbit, drift and bleed through

 * each other while a slow hue drift continuously reshuffles the whole

 * spectrum. Nothing reads as a static circular gradient: at idle the light

 * visibly circles, glints glide and the aura breathes, so JARVES reads as

 * alive and thinking. Performance: every continuous animation is

 * transform/opacity only (compositor-friendly; the single hue-rotate runs on

 * the small core), so an all-day POS terminal runs it at negligible cost.

 *

 * onePOS teal ramp (tailwind.config.js) remains the base:

 *   #0d3b39 900 | #104744 800 | #125a56 700 | #176F6A 600

 *   #2f8a82 500 | #4fa69e 400 | #82c1bb 300 | #d7ecea 100 | #eef7f6 50

 * Accent spectrum: cyan #22d3ee, emerald #34d399, violet #a855f7,

 * pink/magenta #ec4899.

 */



export const JARVIS_STYLES = `

:root {

  --dock-height: var(--app-dock-height, 60px);

  --dock-center-zone: 120px;

  --jarvis-orb-size: 65px;

}



.admin-nav-dock {

  height: var(--app-dock-height, var(--dock-height));

}



/* ------------------------------------------------------------ dock metrics */



/* Single source of truth for the dock bar's dimensions: the dock JSX and the

   panel overlay below both consume these variables, so the CSS and the JSX

   can never quote different numbers. The orb is intentionally taller than the

   bar (65px in 60px): it rises \~2.5px above the top edge of the bar. */





/* -------------------------------------------------------- corner pocket */



.jarvis-corner {

  position: fixed;

  z-index: 40;

  left: 50%;

  bottom: clamp(4px, 1vw, 10px);

  transform: translateX(-50%);

  width: max-content;

  height: auto;

  pointer-events: none;

}

.jarvis-corner > [data-testid="jarvis-orb-host"] {

  position: fixed;

  left: 50%;

  bottom: max(40px, calc(env(safe-area-inset-bottom) + 40px));

  transform: translateX(-50%);

  pointer-events: none;

}

.jarvis-corner.jarvis-dock-anchor {

  /* In-flow member of the dock's flex row: the dock reserves the centre zone

     (w-[var(--dock-center-zone)] in AdminNavDock.jsx — same number as the

     variable above) and this anchor fills exactly that box, so the orb can

     never overlap the quick-access icons on either side. */

  width: 100%;

  position: relative;

  left: auto;

  bottom: auto;

  transform: none;

  display: grid;

  /* The orb (65px) is taller than the bar (60px): bottom-align it so the

     overflow rises above the bar's top edge instead of past its flush bottom. */

  place-items: end center;

  z-index: 2;

}

html[data-platform-theme="theme3"] .jarvis-corner:not(.jarvis-dock-anchor) {
  left: auto;
  right: calc(env(safe-area-inset-right, 0px) + 12px);
  bottom: calc(env(safe-area-inset-bottom, 0px) + 12px);
  transform: none;
  z-index: 940;
}

html[data-platform-theme="theme3"] .jarvis-corner:not(.jarvis-dock-anchor) > [data-testid="jarvis-orb-host"] {
  left: auto;
  right: calc(env(safe-area-inset-right, 0px) + 12px);
  bottom: calc(env(safe-area-inset-bottom, 0px) + 12px);
  transform: none;
}

html[data-platform-theme="theme4"] .jarvis-corner:not(.jarvis-dock-anchor) {
  left: auto;
  right: calc(env(safe-area-inset-right, 0px) + 18px);
  top: 0;
  bottom: auto;
  transform: none;
  z-index: 940;
}

html[data-platform-theme="theme4"] .jarvis-corner:not(.jarvis-dock-anchor) > [data-testid="jarvis-orb-host"] {
  left: auto;
  right: calc(env(safe-area-inset-right, 0px) + 18px);
  top: 0;
  bottom: auto;
  transform: none;
}

html[data-platform-theme="theme4"] .onepos-shell-header .jarvis-corner {
  position: relative;
  left: auto;
  right: auto;
  top: auto;
  bottom: auto;
  transform: none;
  z-index: auto;
  display: flex;
  align-items: center;
  margin-right: 24px;
}

html[data-platform-theme="theme4"] .onepos-shell-header .jarvis-corner > [data-testid="jarvis-orb-host"] {
  position: relative;
  left: auto;
  right: auto;
  top: auto;
  bottom: auto;
  transform: none;
}

.jarvis-corner.jarvis-dock-anchor > [data-testid="jarvis-orb-host"] {

  position: relative;

  left: auto;

  bottom: auto;

  transform: none;

}

/* Orb state copy ("Listening…") must not add height inside the dock bar. */

.jarvis-corner.jarvis-dock-anchor [data-testid="jarvis-orb-state"] {

  display: none;

}

/* Dock-embedded orb (admin AND till): the glass cradle rises above the bar

   while the orb remains optically centred in the reserved middle zone. */

.jarvis-corner.jarvis-dock-anchor {

  --jarvis-circle-size: calc(var(--jarvis-orb-size) * 1.2);

}

.jarvis-corner.jarvis-dock-anchor .jarvis-orb-halo { inset: -5px; }

.jarvis-corner [data-testid="jarvis-orb"],

.jarvis-corner [data-testid="jarvis-orb-label"],

.jarvis-corner [data-testid="jarvis-orb-state"] {

  pointer-events: auto;

}



/* The dock owns the embedded launcher. Its panel is a sibling overlay rather

   than a child of the dock, so it can rise above the dock without being clipped

   by the dock's scroll/overflow context. */

.jarvis-panel-overlay {

  z-index: 960;

  pointer-events: none;

}

.jarvis-panel-overlay--dock {

  align-items: flex-end;

  justify-content: center;

  /* Reserve the real dock height (--dock-height, same variable the dock bar

     uses) plus breathing room, so the prompt/input row is never occluded. */

  padding: 0.75rem 0.75rem calc(var(--dock-height) + var(--dock-offset-bottom, var(--dock-bottom, 12px)) + 16px);

}

.jarvis-panel-overlay--dock > .jarvis-panel-backdrop {

  bottom: calc(var(--dock-height) + var(--dock-offset-bottom, var(--dock-bottom, 12px)) + 16px);

  pointer-events: auto;

}

.jarvis-panel-overlay--dock > [data-testid="jarvis-panel"] {

  width: min(400px, calc(100vw - 1.5rem));

  max-height: min(78dvh, calc(100dvh - var(--dock-height) - 5.5rem - var(--dock-offset-bottom, var(--dock-bottom, 12px))));

  pointer-events: auto;

}



/* ---------------------------------------------------- dock bar geometry */



/* The bar is a floating pill: its height is fixed to --dock-height (the 65px

   orb rises above it), while the gap under the bar and the full 32px rounding

   live in AdminNavDock.jsx / index.css. */





/* ------------------------------------------------------------- orb base */



.jarvis-orb {

  position: relative;

  z-index: 1;

  width: var(--jarvis-orb-size);

  height: var(--jarvis-orb-size);

  border-radius: 50%;

  background: radial-gradient(circle at 35% 24%, #effdff 0%, #83efff 12%, #29c9f3 28%, #3478e8 48%, #9253e9 72%, #182765 100%);

  box-shadow:

    0 4px 14px rgba(12, 36, 83, 0.35),

    0 0 24px rgba(77, 218, 255, 0.4),

    inset 0 0 0 1px rgba(235, 253, 255, 0.6);

  transition: transform 180ms ease, box-shadow 180ms ease;

}

.jarvis-orb-container {

  --jarvis-orb-size: 65px;

  --jarvis-circle-size: calc(var(--jarvis-orb-size) * 1.2);

  width: var(--jarvis-circle-size);

  height: var(--jarvis-circle-size);

  display: grid;

  place-items: center;

  flex: 0 0 var(--jarvis-circle-size);

  border-radius: 50%;

  position: relative;

  background: transparent;

  border: 0;

  box-shadow: none;

}

.jarvis-orb-container::before {
  content: "";
  position: absolute;
  inset: -7px;
  border-radius: 50%;
  background: radial-gradient(circle at 32% 24%, rgba(255,255,255,0.52) 0%, rgba(255,255,255,0.28) 38%, rgba(255,255,255,0.14) 73%, rgba(255,255,255,0.08) 100%);
  border: 1px solid rgba(255,255,255,0.82);
  box-shadow: 0 8px 20px rgba(46,89,120,0.16), 0 0 18px rgba(90,215,255,0.24), inset 0 1px 2px rgba(255,255,255,0.85), inset 0 -2px 8px rgba(111,130,180,0.1);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 0;
  pointer-events: none;
}

.jarvis-orb:hover {

  transform: translateY(-1px) scale(1.05);

  box-shadow:

    0 10px 26px rgba(13, 59, 57, 0.45),

    0 0 30px rgba(34, 211, 238, 0.3),

    inset 0 0 0 1px rgba(215, 236, 234, 0.28);

}

.jarvis-orb:active { transform: scale(0.97); }



/* Hover/touch: the whole aurora brightens (opacity transitions are cheap). */

.jarvis-orb-flow, .jarvis-orb-flow2, .jarvis-orb-flow3, .jarvis-orb-flow4,

.jarvis-orb-sheen, .jarvis-orb-glint, .jarvis-orb-glint2 {

  transition: opacity 200ms ease;

}

.jarvis-orb:hover .jarvis-orb-flow { opacity: 1; }

.jarvis-orb:hover .jarvis-orb-flow2 { opacity: 0.95; }

.jarvis-orb:hover .jarvis-orb-flow3 { opacity: 0.95; }

.jarvis-orb:hover .jarvis-orb-flow4 { opacity: 0.9; }

.jarvis-orb:hover .jarvis-orb-sheen { opacity: 0.6; }



/* Outer breathing halo (aura) - always alive, subtly scaling. */

.jarvis-orb-halo {

  position: absolute;

  inset: -5px;

  border-radius: 9999px;

  border: 1px solid rgba(34, 211, 238, 0.5);

  opacity: 0.5;

  animation: jarvis-orb-halo 6.5s ease-in-out infinite;

}



/* Secondary ring: near-invisible at idle, becomes the listening ripple. */

.jarvis-orb-ring {

  position: absolute;

  inset: -6px;

  border-radius: 9999px;

  border: 1.5px solid rgba(52, 211, 153, 0.75);

  opacity: 0;

}



/* Core: clipped viewport for the internal energy layers. The slow hue drift

   continuously reshuffles every colour through the spectrum even at idle -

   this is the "JARVES is alive" heartbeat, never a static gradient. */

.jarvis-orb-core {

  position: absolute;

  inset: 3px;

  border-radius: 9999px;

  overflow: hidden;

  background:

    radial-gradient(circle at 34% 22%, rgba(255, 255, 255, 0.95) 0 4%, rgba(142, 245, 255, 0.75) 15%, transparent 35%),

    radial-gradient(circle at 70% 76%, rgba(255, 74, 221, 0.78), transparent 48%),

    radial-gradient(circle at 30% 72%, rgba(29, 178, 255, 0.84), transparent 54%),

    #243b9b;

  box-shadow: inset 0 0 14px rgba(238, 247, 246, 0.45);

  animation: jarvis-orb-crystal 12s ease-in-out infinite alternate;

}



/* Flow layer 1 - the big teal plasma blob, orbiting an off-centre pivot so

   the light visibly circles inside the core rather than pulsing in place. */

.jarvis-orb-flow {

  position: absolute;

  width: 150%;

  height: 150%;

  left: -25%;

  top: -25%;

  border-radius: 50%;

  background: linear-gradient(168deg, transparent 28%, rgba(232, 255, 255, 0.96) 39%, rgba(36, 224, 255, 0.95) 46%, rgba(255, 92, 227, 0.92) 53%, rgba(131, 75, 255, 0.78) 61%, transparent 72%);

  filter: blur(2px);

  opacity: 0.92;

  transform-origin: 62% 58%;

  animation: jarvis-orb-orbit 16s linear infinite;

}



/* Flow layer 2 - emerald lobe, counter-drifting; different periods mean the

   combined motion never visibly repeats. */

.jarvis-orb-flow2 {

  position: absolute;

  width: 120%;

  height: 120%;

  left: -10%;

  top: -10%;

  border-radius: 50%;

  background: linear-gradient(12deg, transparent 28%, rgba(34, 203, 255, 0.82) 41%, rgba(255, 67, 212, 0.88) 49%, rgba(255, 239, 255, 0.82) 55%, transparent 69%);

  filter: blur(3px);

  opacity: 0.84;

  animation: jarvis-orb-drift 11s ease-in-out infinite alternate;

}



/* Flow layer 3 - violet/purple energy, counter-orbiting the teal blob so

   distinct hues visibly pass through each other. */

.jarvis-orb-flow3 {

  position: absolute;

  width: 115%;

  height: 115%;

  left: -8%;

  top: -14%;

  border-radius: 50%;

  background: radial-gradient(circle at 60% 32%, rgba(168, 85, 247, 0.6) 0%, rgba(124, 58, 237, 0.35) 42%, rgba(124, 58, 237, 0) 70%);

  filter: blur(8px);

  opacity: 0.7;

  transform-origin: 38% 62%;

  animation: jarvis-orb-orbit-slow 19s linear infinite;

}



/* Flow layer 4 - cyan/blue current, drifting against layer 2. */

.jarvis-orb-flow4 {

  position: absolute;

  width: 130%;

  height: 130%;

  left: -15%;

  top: -15%;

  border-radius: 50%;

  background: radial-gradient(circle at 30% 70%, rgba(34, 211, 238, 0.55) 0%, rgba(14, 116, 144, 0.3) 46%, rgba(14, 116, 144, 0) 74%);

  filter: blur(9px);

  opacity: 0.65;

  animation: jarvis-orb-drift-alt 14s ease-in-out infinite alternate;

}



.jarvis-orb-core::before,

.jarvis-orb-core::after {

  content: "";

  position: absolute;

  inset: -35%;

  border-radius: 50%;

  pointer-events: none;

}

.jarvis-orb-core::before {

  background: conic-gradient(

    from 20deg,

    transparent 0 28%,

    rgba(63, 229, 255, 0.75) 34%,

    rgba(255, 78, 221, 0.88) 40%,

    transparent 48% 68%,

    rgba(155, 93, 255, 0.7) 75%,

    transparent 82%

  );

  filter: blur(4px);

  animation: jarvis-orb-ribbon 7s linear infinite;

}

.jarvis-orb-core::after {

  inset: 5%;

  border: 1px solid rgba(232, 255, 255, 0.4);

  box-shadow: inset 0 0 9px rgba(214, 250, 255, 0.35);

}



/* Rotating conic light sweep over the plasma. */

.jarvis-orb-sheen {

  position: absolute;

  inset: 0;

  border-radius: 9999px;

  background: conic-gradient(

    from 0deg,

    rgba(238, 247, 246, 0) 0deg,

    rgba(34, 211, 238, 0.45) 70deg,

    rgba(238, 247, 246, 0) 150deg,

    rgba(168, 85, 247, 0.4) 250deg,

    rgba(238, 247, 246, 0) 360deg

  );

  opacity: 0.4;

  animation: jarvis-orb-sheen 9s linear infinite;

}



/* Small highlight gliding across the surface, like light on liquid. */

.jarvis-orb-glint {

  position: absolute;

  top: 12%;

  left: 8%;

  width: 34%;

  height: 26%;

  border-radius: 50%;

  background: radial-gradient(ellipse at center, rgba(238, 247, 246, 0.55) 0%, rgba(238, 247, 246, 0) 70%);

  filter: blur(2px);

  animation: jarvis-orb-glint 7.5s ease-in-out infinite alternate;

}



/* Second glint in soft pink/magenta, offset path and period, so warm and cool

   highlights cross the surface at different times. */

.jarvis-orb-glint2 {

  position: absolute;

  bottom: 10%;

  right: 6%;

  width: 30%;

  height: 24%;

  border-radius: 50%;

  background: radial-gradient(ellipse at center, rgba(236, 72, 153, 0.5) 0%, rgba(236, 72, 153, 0) 70%);

  filter: blur(2.5px);

  animation: jarvis-orb-glint-alt 9.5s ease-in-out infinite alternate;

}



/* The spark rides a slowly orbiting carrier; the spark itself only

   occasionally flares, so idle life stays subtle and never strobe-like. */

.jarvis-orb-spark-orbit {

  position: absolute;

  inset: 0;

  border-radius: 9999px;

  animation: jarvis-orb-orbit-slow 13s linear infinite;

}

.jarvis-orb-spark {

  position: absolute;

  top: 5px;

  left: 50%;

  margin-left: -3px;

  width: 6px;

  height: 6px;

  border-radius: 9999px;

  background: #eef7f6;

  box-shadow: 0 0 6px rgba(34, 211, 238, 0.9);

  animation: jarvis-orb-spark 5s ease-in-out infinite;

}



/* ------------------------------------------------------------- states */



/* Listening: brighter multi-colour flow, faster orbiting and an outward

   emerald ripple - visually obvious that JARVES is listening. */

.jarvis-orb--listening { animation: jarvis-orb-listen 1.7s ease-out infinite; }

.jarvis-orb--listening .jarvis-orb-ring { animation: jarvis-orb-ring 1.8s ease-out infinite; }

.jarvis-orb--listening .jarvis-orb-flow { animation-duration: 6s; opacity: 1; }

.jarvis-orb--listening .jarvis-orb-flow2 { animation-duration: 5s; opacity: 0.95; }

.jarvis-orb--listening .jarvis-orb-flow3 { animation-duration: 7s; opacity: 0.9; }

.jarvis-orb--listening .jarvis-orb-flow4 { animation-duration: 5.5s; opacity: 0.9; }

.jarvis-orb--listening .jarvis-orb-core {

  background: radial-gradient(circle at 38% 32%, #0f766e 0%, #0d5c58 45%, #0d3b39 100%);

  animation: jarvis-orb-hue 12s linear infinite;

}

.jarvis-orb--listening .jarvis-orb-halo { border-color: rgba(52, 211, 153, 0.75); }



/* Thinking: faster, more complex motion - the sweep, the counter-orbits and

   the hue drift all accelerate while an answer is in flight. No flashing. */

.jarvis-orb--thinking .jarvis-orb-sheen { opacity: 0.8; animation-duration: 2.4s; }

.jarvis-orb--thinking .jarvis-orb-flow { animation-duration: 5.5s; }

.jarvis-orb--thinking .jarvis-orb-flow2 { animation-duration: 4.5s; }

.jarvis-orb--thinking .jarvis-orb-flow3 { animation-duration: 6s; }

.jarvis-orb--thinking .jarvis-orb-flow4 { animation-duration: 4.8s; }

.jarvis-orb--thinking .jarvis-orb-core { animation: jarvis-orb-hue 10s linear infinite; }

.jarvis-orb--thinking .jarvis-orb-spark { animation-duration: 2.2s; }

.jarvis-orb--thinking .jarvis-orb-halo { border-color: rgba(168, 85, 247, 0.7); animation-duration: 2.6s; }



/* Response: one short energetic flare when an answer lands, then the orb

   settles smoothly back to idle (this is a moment, not a resting state). */

.jarvis-orb--response { animation: jarvis-orb-response 1.6s ease-out 1 both; }

.jarvis-orb--response .jarvis-orb-core { animation: jarvis-orb-hue 4s linear infinite; }

.jarvis-orb--response .jarvis-orb-sheen { opacity: 0.9; animation-duration: 1.4s; }

.jarvis-orb--response .jarvis-orb-flow { animation-duration: 3.5s; }

.jarvis-orb--response .jarvis-orb-flow2 { animation-duration: 3s; }

.jarvis-orb--response .jarvis-orb-flow3 { animation-duration: 3.8s; }

.jarvis-orb--response .jarvis-orb-flow4 { animation-duration: 3.2s; }

.jarvis-orb--response .jarvis-orb-spark { animation: jarvis-orb-spark 1.2s ease-in-out infinite; }



/* ------------------------------------------------------ WebGL orb surface */



/* The button remains the interaction surface; the transparent canvas carries

   the dimensional knot so it can sit over any POS background. */

.jarvis-orb {

  background: transparent;

  border: 0;

  box-shadow: none;

  overflow: visible;

}

.jarvis-orb-video {

  position: absolute;

  inset: 0;

  width: var(--jarvis-orb-size);

  height: var(--jarvis-orb-size);

  display: block;

  pointer-events: none;

  transform: none;

  border-radius: 50%;

  object-fit: cover;

  clip-path: circle(50% at 50% 50%);

  /* Restore the original black video field inside the centre circle while
     keeping the supplied video, mask, glow and animation unchanged. */
  background: #000;

  mix-blend-mode: normal;

  filter:

    drop-shadow(0 0 3px rgba(114, 221, 255, 0.55))

    drop-shadow(0 3px 8px rgba(52, 24, 117, 0.28));

}

.jarvis-orb:hover {

  box-shadow: none;

}



/* --------------------------------------------------------- keyframes */



@keyframes jarvis-orb-sheen { to { transform: rotate(360deg); } }

@keyframes jarvis-orb-orbit { to { transform: rotate(360deg); } }

@keyframes jarvis-orb-orbit-slow { to { transform: rotate(-360deg); } }

@keyframes jarvis-orb-drift {

  0% { transform: translate3d(-12%, -8%, 0) scale(1); }

  50% { transform: translate3d(10%, 6%, 0) scale(1.12); }

  100% { transform: translate3d(6%, 12%, 0) scale(0.94); }

}

@keyframes jarvis-orb-drift-alt {

  0% { transform: translate3d(10%, 8%, 0) scale(1.08); }

  50% { transform: translate3d(-8%, -6%, 0) scale(0.95); }

  100% { transform: translate3d(-4%, 10%, 0) scale(1.1); }

}

@keyframes jarvis-orb-glint {

  0% { transform: translate3d(0, 0, 0); opacity: 0.35; }

  100% { transform: translate3d(110%, 60%, 0); opacity: 0.8; }

}

@keyframes jarvis-orb-glint-alt {

  0% { transform: translate3d(0, 0, 0); opacity: 0.3; }

  100% { transform: translate3d(-105%, -55%, 0); opacity: 0.75; }

}

/* The continuous colour drift of the whole aurora (idle -> full spectrum). */

@keyframes jarvis-orb-hue { to { filter: hue-rotate(360deg); } }

@keyframes jarvis-orb-crystal {

  0% { transform: scale(0.98); filter: saturate(0.95) brightness(0.95); }

  50% { transform: scale(1.03); filter: saturate(1.3) brightness(1.12); }

  100% { transform: scale(1); filter: saturate(1.08) brightness(1); }

}

@keyframes jarvis-orb-ribbon {

  from { transform: rotate(0deg) scale(0.9); }

  to { transform: rotate(360deg) scale(1.08); }

}

@keyframes jarvis-orb-halo { 0%, 100% { opacity: 0.28; transform: scale(0.99); } 50% { opacity: 0.6; transform: scale(1.04); } }

@keyframes jarvis-orb-ring { 0% { opacity: 0.7; transform: scale(1); } 70% { opacity: 0; transform: scale(1.4); } 100% { opacity: 0; } }

@keyframes jarvis-orb-listen { 0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.45), 0 8px 22px rgba(13, 59, 57, 0.35); } 100% { box-shadow: 0 0 0 18px rgba(16, 185, 129, 0), 0 8px 22px rgba(13, 59, 57, 0.35); } }

@keyframes jarvis-orb-spark { 0%, 62%, 100% { opacity: 0.18; transform: scale(0.8); } 72% { opacity: 1; transform: scale(1.25); } 82% { opacity: 0.35; transform: scale(0.9); } }

/* Response flare: one cyan/violet pulse + brief lift, then back to rest. */

@keyframes jarvis-orb-response {

  0% { box-shadow: 0 6px 18px rgba(13, 59, 57, 0.35), 0 0 0 0 rgba(34, 211, 238, 0.55); transform: scale(1); }

  35% { box-shadow: 0 10px 30px rgba(13, 59, 57, 0.4), 0 0 26px rgba(34, 211, 238, 0.5); transform: scale(1.08); }

  70% { box-shadow: 0 6px 18px rgba(13, 59, 57, 0.35), 0 0 14px rgba(168, 85, 247, 0.35); transform: scale(1.02); }

  100% { box-shadow: 0 6px 18px rgba(13, 59, 57, 0.35), 0 0 0 0 rgba(34, 211, 238, 0); transform: scale(1); }

}




/* ------------------------------------------------------ panel base layout */
/* Smart Theme intentionally has no Tailwind runtime. The original JARVES
   panel used Tailwind utilities, so these namespaced rules reproduce that
   existing surface without adding a second CSS framework. */
.jarvis-panel-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 12px;
}
.jarvis-panel-backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(0,0,0,.4);
}
[data-testid="jarvis-panel"] {
  position: relative;
  width: min(420px, calc(100vw - 24px));
  max-height: 78dvh;
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,.15);
  background: rgba(8,13,17,.92);
  color: #f1f5f9;
  box-shadow: 0 24px 70px rgba(2,6,16,.6);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  overflow: hidden;
}
[data-testid="jarvis-panel"] > header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255,255,255,.1);
  background: rgba(10,20,26,.95);
  color: #fff;
}
[data-testid="jarvis-panel"] > header > span {
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  border-radius: 999px;
  background: radial-gradient(circle at 34% 28%,#eef7f6 0%,#b0d9d5 18%,#4fa69e 42%,#176F6A 68%,#104744 100%);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.25);
}
[data-testid="jarvis-panel"] > header > div { flex: 1; min-width: 0; }
[data-testid="jarvis-panel"] > header h2 { margin: 0; font-size: 14px; font-weight: 700; letter-spacing: .2em; }
[data-testid="jarvis-panel"] > header p { margin: 2px 0 0; font-size: 11px; color: rgba(204,251,241,.9); line-height: 1.2; }
[data-testid="jarvis-panel-close"] {
  border: 0;
  padding: 6px;
  border-radius: 8px;
  color: rgba(204,251,241,.8);
  background: transparent;
  cursor: pointer;
}
[data-testid="jarvis-panel-close"]:hover { background: rgba(255,255,255,.1); color: #fff; }

[data-testid="jarvis-messages"] {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  background:
    radial-gradient(circle at 50% 0%,rgba(23,111,106,.24),rgba(8,13,17,0) 58%),
    rgba(8,13,17,.55);
}
[data-testid="jarvis-empty"] { text-align: center; padding: 12px 0; }
[data-testid="jarvis-empty"] > svg { margin: 0 auto; color: #6ee7b7; }
[data-testid="jarvis-empty"] > p { margin: 4px 0 0; font-size: 14px; font-weight: 600; color: #fff; }
[data-testid="jarvis-empty"] > div { margin-top: 12px; display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; }
[data-testid="jarvis-suggestion"] {
  border: 1px solid rgba(94,234,212,.3);
  border-radius: 999px;
  padding: 4px 10px;
  background: rgba(45,212,191,.1);
  color: #f0fdfa;
  font-size: 12px;
  cursor: pointer;
}
[data-testid="jarvis-suggestion"]:hover { background: rgba(45,212,191,.2); border-color: rgba(153,246,228,.4); }

.jarvis-message { display: flex; margin-top: 12px; }
[data-testid="jarvis-message-user"] { justify-content: flex-end; }
[data-testid="jarvis-message-assistant"], [data-testid="jarvis-thinking"] { justify-content: flex-start; }
.jarvis-message > div {
  max-width: 85%;
  white-space: pre-wrap;
  border-radius: 16px;
  padding: 8px 12px;
  font-size: 14px;
  line-height: 1.55;
}
[data-testid="jarvis-message-user"] > div {
  background: rgba(13,148,136,.35);
  color: #f0fdfa;
  border: 1px solid rgba(94,234,212,.25);
  border-bottom-right-radius: 4px;
}
[data-testid="jarvis-message-assistant"] > div,
[data-testid="jarvis-thinking"] > div {
  background: rgba(255,255,255,.07);
  color: #f1f5f9;
  border: 1px solid rgba(255,255,255,.12);
  border-bottom-left-radius: 4px;
}
[data-testid="jarvis-thinking"] > div { display: flex; align-items: center; gap: 4px; padding: 12px 16px; }

[data-testid="jarvis-notice"] { padding: 8px 16px; }
[data-testid="jarvis-notice"] > div {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
}
[data-testid="jarvis-notice"] > div:first-child { color: #b91c1c; background: #fef2f2; border: 1px solid #fecaca; }
[data-testid="jarvis-notice"] button { margin-left: auto; border: 0; background: transparent; color: inherit; font-weight: 600; text-decoration: underline; cursor: pointer; }

[data-testid="jarvis-form"] {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid rgba(255,255,255,.1);
  background: rgba(7,12,16,.95);
}
[data-testid="jarvis-mic"], [data-testid="jarvis-ask"] {
  flex: 0 0 40px;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  cursor: pointer;
}
[data-testid="jarvis-mic"] { border: 1px solid rgba(255,255,255,.15); background: rgba(255,255,255,.08); color: #f0fdfa; }
[data-testid="jarvis-mic"][data-listening="true"] { background: #10b981; border-color: rgba(110,231,183,.6); color: #fff; }
[data-testid="jarvis-input"] {
  flex: 1;
  min-width: 0;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,.15);
  background: rgba(255,255,255,.08);
  color: #fff;
  font-size: 14px;
  padding: 10px 12px;
  outline: none;
}
[data-testid="jarvis-input"]::placeholder { color: rgba(203,213,225,.8); }
[data-testid="jarvis-input"]:focus { border-color: rgba(110,231,183,.6); box-shadow: 0 0 0 2px rgba(52,211,153,.45); }
[data-testid="jarvis-ask"] { border: 0; background: #34d399; color: #07130f; box-shadow: 0 2px 10px rgba(52,211,153,.45); }
[data-testid="jarvis-ask"]:disabled { opacity: .4; cursor: not-allowed; box-shadow: none; }

@media (min-width: 640px) {
  .jarvis-panel-overlay { padding: 20px; }
}


/* ------------------------------------------------- panel messages + mic */



/* A new answer enters with a brief emerald settle glow that fades back to the

   normal message style - a short "active" moment, then calm. */

.jarvis-message { animation: jarvis-message-in 220ms ease-out both; }

.jarvis-message:last-child { animation: jarvis-message-in 220ms ease-out both, jarvis-message-settle 900ms ease-out 120ms both; }

@keyframes jarvis-message-settle {

  0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }

  30% { box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.35); }

  100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }

}

@keyframes jarvis-message-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

.jarvis-dot { animation: jarvis-dot 1.1s ease-in-out infinite; }

.jarvis-dot:nth-child(2) { animation-delay: 160ms; }

.jarvis-dot:nth-child(3) { animation-delay: 320ms; }

@keyframes jarvis-dot { 0%, 100% { opacity: 0.3; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-2px); } }/* Microphone control: teal idle, clear listening state. */
.jarvis-mic { transition: background-color 150ms ease, color 150ms ease, box-shadow 150ms ease; }
.jarvis-mic--listening { animation: jarvis-mic-pulse 1.4s ease-out infinite; }
@keyframes jarvis-mic-pulse { 0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.55); } 100% { box-shadow: 0 0 0 14px rgba(16, 185, 129, 0); } }

/* Mic ACCESS indicator: a tiny status chip riding the corner pocket —
   Windows-style available/blocked glyph with a status dot. It is status
   only: no click target, no capture, no toggling. */
.jarvis-mic-status {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 5px;
  border-radius: 9999px;
  background: rgba(6, 24, 22, 0.55);
  border: 1px solid rgba(82, 201, 191, 0.35);
  color: #7ce0d6;
  line-height: 0;
  pointer-events: auto;
  box-shadow: 0 1px 4px rgba(3, 15, 14, 0.4);
}
.jarvis-mic-status-dot {
  width: 4px;
  height: 4px;
  border-radius: 9999px;
  background: #34d399;
  box-shadow: 0 0 5px rgba(52, 211, 153, 0.85);
}
.jarvis-mic-status--blocked {
  border-color: rgba(248, 113, 113, 0.45);
  color: #fda4af;
}
.jarvis-mic-status--blocked .jarvis-mic-status-dot {
  background: #f87171;
  box-shadow: 0 0 5px rgba(248, 113, 113, 0.8);
}
/* In the dock's centre pocket the chip floats at the orb's right shoulder;
   the standalone corner gets the same placement relative to the orb, so both
   surfaces read identically (and the mobile 46px orb shifts the chip too). */
.jarvis-mic-status--corner {
  position: absolute;
  left: calc(50% + var(--jarvis-orb-size, 65px) * 0.25);
  bottom: calc(50% + 2px);
  z-index: 3;
}

.jarvis-corner.jarvis-dock-anchor .jarvis-mic-status--corner {
  display: grid;
  place-items: center;
  width: 10px;
  height: 10px;
  padding: 0;
}

.jarvis-corner.jarvis-dock-anchor .jarvis-mic-status--corner > svg {
  display: none;
}

.jarvis-corner.jarvis-dock-anchor .jarvis-mic-status--corner .jarvis-mic-status-dot {
  width: 5px;
  height: 5px;
}


/* Respect the operator's motion preference: presence stays, motion stops. */

@media (prefers-reduced-motion: reduce) {

  .jarvis-orb,

  .jarvis-orb *,

  .jarvis-message,

  .jarvis-dot,

  .jarvis-mic {

    animation: none !important;

    transition: none !important;

  }

}



@media (max-width: 640px) {

  .jarvis-orb-container {

    --jarvis-orb-size: 46px; /* 40px + 15% (unchanged) */

  }

  .jarvis-corner:not(.jarvis-dock-anchor) { bottom: max(4px, env(safe-area-inset-bottom)); }

}

@media (max-width: 900px) {
  html[data-platform-theme="theme3"] .jarvis-corner:not(.jarvis-dock-anchor),
  html[data-platform-theme="theme4"] .jarvis-corner:not(.jarvis-dock-anchor) {
    top: auto;
    right: calc(env(safe-area-inset-right, 0px) + 12px);
    bottom: calc(var(--app-dock-height, 48px) + env(safe-area-inset-bottom, 0px) + 4px);
  }

  html[data-platform-theme="theme3"] .jarvis-corner:not(.jarvis-dock-anchor) > [data-testid="jarvis-orb-host"],
  html[data-platform-theme="theme4"] .jarvis-corner:not(.jarvis-dock-anchor) > [data-testid="jarvis-orb-host"] {
    top: auto;
    right: calc(env(safe-area-inset-right, 0px) + 12px);
    bottom: calc(var(--app-dock-height, 48px) + env(safe-area-inset-bottom, 0px) + 4px);
  }
}

`;



/*\* Renders the shared JARVES stylesheet once per mounted surface. */

export default function JarvisStyles() {

  return <style data-jarvis-styles="true">{JARVIS_STYLES}</style>;

}
