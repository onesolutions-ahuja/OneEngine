const RIBBON_STYLES = `
.jarvis-ribbon-orb {
  position: absolute;
  inset: -8px;
  display: grid;
  place-items: center;
  pointer-events: none;
  isolation: isolate;
  transform: translateZ(0);
}

.jarvis-ribbon-orb::before {
  content: "";
  position: absolute;
  inset: 12%;
  border-radius: 50%;
  background:
    radial-gradient(circle at 40% 34%, rgba(255,255,255,.98) 0 3%, rgba(138,247,255,.78) 8%, transparent 21%),
    radial-gradient(circle at 54% 50%, rgba(31,112,255,.42), rgba(38,18,118,.18) 48%, transparent 68%);
  filter: blur(3px);
  animation: jarves-ribbon-core-breathe 3.8s ease-in-out infinite;
}

.jarvis-ribbon-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  filter:
    drop-shadow(0 0 5px rgba(48,211,255,.78))
    drop-shadow(0 0 11px rgba(80,73,255,.42));
  animation: jarves-ribbon-spectrum 8s linear infinite;
}

.jarvis-ribbon-track {
  transform-box: fill-box;
  transform-origin: center;
  will-change: transform, opacity;
}

.jarvis-ribbon-track--a {
  animation: jarves-ribbon-spin-a 7.5s linear infinite;
}

.jarvis-ribbon-track--b {
  animation: jarves-ribbon-spin-b 9.2s linear infinite reverse;
}

.jarvis-ribbon-track--c {
  animation: jarves-ribbon-spin-c 6.6s linear infinite;
}

.jarvis-ribbon-orb__core {
  position: absolute;
  width: 31%;
  aspect-ratio: 1;
  border-radius: 50%;
  background:
    radial-gradient(circle at 36% 28%, #ffffff 0 8%, #a9f7ff 12%, #39d8ff 24%, #315cff 48%, #4020a8 72%, #120a45 100%);
  box-shadow:
    0 0 12px rgba(77,226,255,.9),
    0 0 26px rgba(75,70,255,.55),
    inset 0 0 8px rgba(255,255,255,.7);
  animation:
    jarves-ribbon-core-breathe 2.9s ease-in-out infinite,
    jarves-ribbon-spectrum 10s linear infinite;
}

.jarvis-ribbon-orb__core::after {
  content: "";
  position: absolute;
  inset: 14%;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,.55);
  box-shadow: inset 0 0 9px rgba(255,255,255,.3);
}

.jarvis-ribbon-orb__particle {
  position: absolute;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #dffcff;
  box-shadow: 0 0 7px #68e8ff;
  opacity: .85;
}

.jarvis-ribbon-orb__particle--1 { animation: jarves-ribbon-particle-1 4.6s linear infinite; }
.jarvis-ribbon-orb__particle--2 { animation: jarves-ribbon-particle-2 5.8s linear infinite; }
.jarvis-ribbon-orb__particle--3 { animation: jarves-ribbon-particle-3 4.9s linear infinite reverse; }

.jarvis-orb--listening .jarvis-ribbon-svg {
  animation-duration: 4.2s;
  filter:
    drop-shadow(0 0 7px rgba(54,236,255,.95))
    drop-shadow(0 0 15px rgba(90,84,255,.55));
}
.jarvis-orb--listening .jarvis-ribbon-track--a { animation-duration: 4.3s; }
.jarvis-orb--listening .jarvis-ribbon-track--b { animation-duration: 5.2s; }
.jarvis-orb--listening .jarvis-ribbon-track--c { animation-duration: 3.8s; }

.jarvis-orb--thinking .jarvis-ribbon-svg {
  animation-duration: 2.8s;
  filter:
    drop-shadow(0 0 8px rgba(72,232,255,1))
    drop-shadow(0 0 19px rgba(121,70,255,.82))
    drop-shadow(0 0 26px rgba(240,77,255,.30));
}
.jarvis-orb--thinking .jarvis-ribbon-track--a { animation-duration: 2.5s; }
.jarvis-orb--thinking .jarvis-ribbon-track--b { animation-duration: 3.4s; }
.jarvis-orb--thinking .jarvis-ribbon-track--c { animation-duration: 2.1s; }
.jarvis-orb--thinking .jarvis-ribbon-orb__core { animation-duration: 1.25s, 3.8s; }

.jarvis-orb--response .jarvis-ribbon-svg {
  animation-duration: 1.9s;
  filter:
    drop-shadow(0 0 10px rgba(104,241,255,1))
    drop-shadow(0 0 22px rgba(159,83,255,.86))
    drop-shadow(0 0 28px rgba(255,92,210,.38));
}
.jarvis-orb--response .jarvis-ribbon-orb__core {
  animation: jarves-ribbon-response 1.2s ease-out 1, jarves-ribbon-spectrum 3s linear infinite;
}

@keyframes jarves-ribbon-spin-a {
  0% { transform: rotate(0deg) scaleX(1) scaleY(.78); }
  50% { transform: rotate(180deg) scaleX(.92) scaleY(.86); }
  100% { transform: rotate(360deg) scaleX(1) scaleY(.78); }
}
@keyframes jarves-ribbon-spin-b {
  0% { transform: rotate(58deg) scaleX(.96) scaleY(.72); }
  50% { transform: rotate(238deg) scaleX(1.05) scaleY(.82); }
  100% { transform: rotate(418deg) scaleX(.96) scaleY(.72); }
}
@keyframes jarves-ribbon-spin-c {
  0% { transform: rotate(118deg) scaleX(1.03) scaleY(.69); }
  50% { transform: rotate(298deg) scaleX(.94) scaleY(.8); }
  100% { transform: rotate(478deg) scaleX(1.03) scaleY(.69); }
}
@keyframes jarves-ribbon-spectrum {
  0% { filter: hue-rotate(0deg) saturate(1.05); }
  50% { filter: hue-rotate(42deg) saturate(1.35); }
  100% { filter: hue-rotate(0deg) saturate(1.05); }
}
@keyframes jarves-ribbon-core-breathe {
  0%,100% { transform: scale(.92); opacity: .8; }
  50% { transform: scale(1.08); opacity: 1; }
}
@keyframes jarves-ribbon-response {
  0% { transform: scale(.9); }
  42% { transform: scale(1.3); }
  100% { transform: scale(1); }
}
@keyframes jarves-ribbon-particle-1 {
  0% { transform: rotate(0deg) translateX(37px) scale(.7); opacity: .1; }
  40% { opacity: 1; }
  100% { transform: rotate(360deg) translateX(37px) scale(1.1); opacity: .1; }
}
@keyframes jarves-ribbon-particle-2 {
  0% { transform: rotate(120deg) translateX(31px) scale(.8); opacity: .15; }
  50% { opacity: .9; }
  100% { transform: rotate(480deg) translateX(31px) scale(.6); opacity: .15; }
}
@keyframes jarves-ribbon-particle-3 {
  0% { transform: rotate(240deg) translateX(41px) scale(.65); opacity: .12; }
  55% { opacity: 1; }
  100% { transform: rotate(600deg) translateX(41px) scale(1); opacity: .12; }
}

@media (prefers-reduced-motion: reduce) {
  .jarvis-ribbon-orb *,
  .jarvis-ribbon-orb::before {
    animation: none !important;
  }
}
`;

export default function JarvisRibbonOrb() {
  return (
    <span className="jarvis-ribbon-orb" aria-hidden="true">
      <style>{RIBBON_STYLES}</style>

      <svg className="jarvis-ribbon-svg" viewBox="0 0 100 100" focusable="false">
        <defs>
          <linearGradient id="jarves-ribbon-gradient-a" x1="8%" y1="12%" x2="92%" y2="88%">
            <stop offset="0%" stopColor="#5ff4ff" />
            <stop offset="30%" stopColor="#2278ff" />
            <stop offset="58%" stopColor="#2d2fd1" />
            <stop offset="80%" stopColor="#9b4dff" />
            <stop offset="100%" stopColor="#fb62d3" />
          </linearGradient>
          <linearGradient id="jarves-ribbon-gradient-b" x1="90%" y1="14%" x2="10%" y2="86%">
            <stop offset="0%" stopColor="#d7fbff" />
            <stop offset="20%" stopColor="#21d8ff" />
            <stop offset="48%" stopColor="#3155f4" />
            <stop offset="72%" stopColor="#7446ef" />
            <stop offset="100%" stopColor="#ff73c9" />
          </linearGradient>
          <linearGradient id="jarves-ribbon-gradient-c" x1="20%" y1="90%" x2="80%" y2="10%">
            <stop offset="0%" stopColor="#1675ff" />
            <stop offset="32%" stopColor="#47edff" />
            <stop offset="55%" stopColor="#ffffff" />
            <stop offset="76%" stopColor="#6551ff" />
            <stop offset="100%" stopColor="#ef63ff" />
          </linearGradient>
        </defs>

        <g className="jarvis-ribbon-track jarvis-ribbon-track--a">
          <ellipse cx="50" cy="50" rx="36" ry="18" fill="none" stroke="url(#jarves-ribbon-gradient-a)" strokeWidth="10" strokeLinecap="round" />
        </g>
        <g className="jarvis-ribbon-track jarvis-ribbon-track--b">
          <ellipse cx="50" cy="50" rx="34" ry="17" fill="none" stroke="url(#jarves-ribbon-gradient-b)" strokeWidth="9" strokeLinecap="round" />
        </g>
        <g className="jarvis-ribbon-track jarvis-ribbon-track--c">
          <ellipse cx="50" cy="50" rx="32" ry="16" fill="none" stroke="url(#jarves-ribbon-gradient-c)" strokeWidth="8" strokeLinecap="round" />
        </g>
      </svg>

      <span className="jarvis-ribbon-orb__core" />
      <span className="jarvis-ribbon-orb__particle jarvis-ribbon-orb__particle--1" />
      <span className="jarvis-ribbon-orb__particle jarvis-ribbon-orb__particle--2" />
      <span className="jarvis-ribbon-orb__particle jarvis-ribbon-orb__particle--3" />
    </span>
  );
}
