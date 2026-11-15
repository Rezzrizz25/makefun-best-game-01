// EMBERFALL — every tuning number and colour in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to
// the window, so no rule below depends on the screen size.
export const FIELD = { width: 1280, height: 720, margin: 30 };

/** The simulation's fixed step, in seconds: 60 updates a second. */
export const STEP = 1 / 60;

/** Ten waves, then victory; Endless keeps going past wave 10. */
export const MAX_WAVE = 10;

export const PLAYER = {
  radius: 14,
  speed: 305,
  maxHp: 100,
  /** Seconds between shots at level 0. */
  fireInterval: 0.27,
  bulletSpeed: 660,
  bulletDamage: 12,
  bulletRadius: 5,
  bulletLife: 1.1,
  /** Seconds the player cannot be hurt again after a hit. */
  invuln: 0.7,
  magnet: 95,
  pickupRadius: 24,
  /** Contact hits knock the player this far (px/s impulse). */
  knockback: 260,
};

export const ENEMY = {
  emberling: { hp: 22, speed: 102, radius: 13, dmg: 8, score: 10, gems: 1 },
  spitter: { hp: 34, speed: 74, radius: 14, dmg: 8, score: 20, gems: 2, spitEvery: 2.3, spitSpeed: 235, spitRadius: 6 },
  dasher: { hp: 28, speed: 86, radius: 13, dmg: 10, score: 25, gems: 2, telegraph: 0.55, dashSpeed: 540, dashTime: 0.34, dashCooldown: 2.7 },
  brute: { hp: 135, speed: 57, radius: 25, dmg: 16, score: 50, gems: 4 },
};

/** Elites appear from this wave on: tougher, bigger, worth more. */
export const ELITE = { fromWave: 4, chance: 0.12, hpMult: 2.4, speedMult: 0.92, radiusMult: 1.35, scoreMult: 3, gemMult: 3 };

/** Enemy health grows this much per wave above wave 1. */
export const HP_PER_WAVE = 0.14;

/** How a wave is built: total spawns, trickle rate and the live cap. */
export const WAVE = {
  count: (n) => 6 + 5 * (n - 1),
  spawnEvery: (n) => Math.max(0.32, 1.05 - 0.06 * n),
  maxAlive: (n) => 10 + 2 * n,
};

/** Which kinds may appear in wave n, with their spawn weights. */
export function waveMix(n) {
  const mix = [{ kind: 'emberling', weight: 10 }];
  if (n >= 2) mix.push({ kind: 'spitter', weight: 3 + n });
  if (n >= 3) mix.push({ kind: 'dasher', weight: 2 + n });
  if (n >= 5) mix.push({ kind: 'brute', weight: 1 + Math.floor(n / 2) });
  return mix;
}

export const PICKUP = {
  gemScore: 5,
  heartDrop: 0.07,
  heartHeal: 25,
  overdriveDrop: 0.02,
  /** Seconds of double fire rate + faster feet. */
  overdriveTime: 8,
};

/** The eight upgrades, offered 3 at a time between waves. */
export const UPGRADES = {
  rapid: { name: 'Rapid Chamber', max: 5, desc: '+25% fire rate' },
  heavy: { name: 'Heavy Ember', max: 5, desc: '+30% bullet damage' },
  swift: { name: 'Swift Boots', max: 5, desc: '+12% move speed' },
  split: { name: 'Split Shot', max: 3, desc: '+1 projectile per shot' },
  pierce: { name: 'Piercing Rounds', max: 3, desc: 'Bullets pierce +1 enemy' },
  magnet: { name: 'Magnet Core', max: 4, desc: '+70% pickup radius' },
  plating: { name: 'Reinforced Hull', max: 5, desc: '+30 max HP, heal 30' },
  aura: { name: 'Ember Aura', max: 4, desc: 'Burning ring hurts nearby foes' },
};

export const SCORE = {
  /** Wave-clear bonus: base + per-wave. */
  clearBase: 50,
  clearPerWave: 50,
};

export const POOLS = { enemies: 96, bullets: 160, ebullets: 80, pickups: 128, particles: 320, floaters: 40 };

export const PALETTE = {
  backdrop: '#0b0708',
  arenaTop: '#1c0f12',
  arenaBottom: '#120a0c',
  arenaEdge: '#3a1d16',
  grid: '#241315',
  player: '#ffb347',
  playerCore: '#fff3d6',
  bullet: '#ffe9a3',
  emberling: '#ff7a2f',
  spitter: '#c77dff',
  dasher: '#ffd23f',
  brute: '#e5484d',
  eliteRing: '#ffd700',
  gem: '#4dd8ff',
  heart: '#ff5d73',
  overdrive: '#b8ff5d',
  text: '#f5e9dc',
  muted: '#b99a8a',
  gold: '#ffc53d',
  panel: '#221114',
  panelEdge: '#5a2e22',
  danger: '#ff4d4d',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'emberfall.best';
