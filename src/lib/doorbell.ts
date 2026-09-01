// Timbre "ding-dong" para /comanda, generado con la Web Audio API.
// Sin assets ni red: se sintetizan dos notas de campana. Client-only.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

// Un golpe de timbre: una nota sinusoidal con ataque corto y caída larga,
// para que suene a campana y no a "beep".
function chime(c: AudioContext, at: number, freq: number) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.3, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.1);
  osc.connect(gain).connect(c.destination);
  osc.start(at);
  osc.stop(at + 1.2);
}

// "ding-dong": dos notas descendentes (E5 -> C5), como un timbre de casa.
export function playDoorbell() {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
  const t = c.currentTime;
  chime(c, t, 659.25); // ding (E5)
  chime(c, t + 0.55, 523.25); // dong (C5)
}

// Llamar desde un gesto del usuario (click) para destrabar el audio en
// navegadores con política de autoplay: el AudioContext arranca "suspended".
export function unlockDoorbell() {
  const c = getCtx();
  if (c && c.state === "suspended") void c.resume();
}
