// EMBERFALL's rules and state, with no drawing and no browser in it: the
// player, the ember enemies, bullets, pickups, waves, upgrades, particles and
// score. step() advances one fixed step and returns what happened as bit
// flags, so the caller can react (sounds, screens) without the world knowing
// about them. Pools are allocated once, at boot; nothing here allocates in
// the hot loop.
import {
  ELITE, ENEMY, FIELD, HP_PER_WAVE, MAX_WAVE, PICKUP, PLAYER, POOLS, SCORE, UPGRADES, WAVE, waveMix,
} from './config.js';
import { pickWeighted } from './random.js';

export const EVENT_HIT = 1;
export const EVENT_KILL = 2;
export const EVENT_PICKUP = 4;
export const EVENT_WAVE_CLEAR = 8;
export const EVENT_OVER = 16;
export const EVENT_VICTORY = 32;
export const EVENT_UPGRADE = 64;
export const EVENT_HEART = 128;
export const EVENT_OVERDRIVE = 256;

const AURA_TICK = 0.25;
const TAU = Math.PI * 2;

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function createWorld(random) {
  const player = {
    x: FIELD.width / 2, y: FIELD.height / 2, vx: 0, vy: 0, aim: -Math.PI / 2,
    hp: PLAYER.maxHp, maxHp: PLAYER.maxHp, fireTimer: 0, invuln: 0,
    overdrive: 0, auraTimer: 0,
    levels: { rapid: 0, heavy: 0, swift: 0, split: 0, pierce: 0, magnet: 0, plating: 0, aura: 0 },
  };
  const enemies = [];
  for (let i = 0; i < POOLS.enemies; i += 1) {
    enemies.push({ active: false, kind: 'emberling', x: 0, y: 0, vx: 0, vy: 0, hp: 1, maxHp: 1, radius: 10, speed: 0, dmg: 0, elite: false, state: 'chase', stateTimer: 0, spitTimer: 0, dashX: 0, dashY: 0, flash: 0 });
  }
  const bullets = [];
  for (let i = 0; i < POOLS.bullets; i += 1) {
    bullets.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, dmg: 0, pierce: 0, life: 0, radius: PLAYER.bulletRadius });
  }
  const ebullets = [];
  for (let i = 0; i < POOLS.ebullets; i += 1) {
    ebullets.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, dmg: 0, life: 0, radius: 6 });
  }
  const pickups = [];
  for (let i = 0; i < POOLS.pickups; i += 1) {
    pickups.push({ active: false, kind: 'gem', x: 0, y: 0, vx: 0, vy: 0, value: 0 });
  }
  const particles = [];
  for (let i = 0; i < POOLS.particles; i += 1) {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: '#fff', drag: 0.9 });
  }
  const floaters = [];
  for (let i = 0; i < POOLS.floaters; i += 1) {
    floaters.push({ active: false, x: 0, y: 0, life: 0, text: '', color: '#fff' });
  }

  const state = {
    player, enemies, bullets, ebullets, pickups, particles, floaters,
    phase: 'demo', wave: 0, waveState: 'idle', spawnQueue: [], spawnTimer: 0,
    score: 0, kills: 0, gems: 0, elapsed: 0, shake: 0, hitStop: 0,
    endless: false, choices: [], overdriveLeft: 0,
  };

  function free(pool) {
    for (let i = 0; i < pool.length; i += 1) if (!pool[i].active) return pool[i];
    return null;
  }

  function burst(x, y, color, count, speed, size) {
    for (let i = 0; i < count; i += 1) {
      const p = free(particles);
      if (!p) return;
      const angle = random() * TAU;
      const v = speed * (0.3 + random() * 0.7);
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * v;
      p.vy = Math.sin(angle) * v;
      p.maxLife = 0.35 + random() * 0.45;
      p.life = p.maxLife;
      p.size = size * (0.6 + random() * 0.8);
      p.color = color;
      p.drag = 0.88;
    }
  }

  function floater(x, y, text, color) {
    const f = free(floaters);
    if (!f) return;
    f.active = true;
    f.x = x;
    f.y = y;
    f.life = 1.1;
    f.text = text;
    f.color = color;
  }

  function reset() {
    player.x = FIELD.width / 2;
    player.y = FIELD.height / 2;
    player.vx = 0;
    player.vy = 0;
    player.aim = -Math.PI / 2;
    player.hp = PLAYER.maxHp;
    player.maxHp = PLAYER.maxHp;
    player.fireTimer = 0;
    player.invuln = 0;
    player.overdrive = 0;
    player.auraTimer = 0;
    for (const key of Object.keys(player.levels)) player.levels[key] = 0;
    for (const pool of [enemies, bullets, ebullets, pickups, particles, floaters]) {
      for (const item of pool) item.active = false;
    }
    state.phase = 'demo';
    state.wave = 0;
    state.waveState = 'idle';
    state.spawnQueue = [];
    state.spawnTimer = 0;
    state.score = 0;
    state.kills = 0;
    state.gems = 0;
    state.elapsed = 0;
    state.shake = 0;
    state.hitStop = 0;
    state.endless = false;
    state.choices = [];
    state.overdriveLeft = 0;
  }

  /** Derived combat numbers from the upgrade levels. */
  function stats() {
    const l = player.levels;
    return {
      fireInterval: PLAYER.fireInterval * 0.8 ** l.rapid * (player.overdrive > 0 ? 0.5 : 1),
      damage: PLAYER.bulletDamage * 1.3 ** l.heavy,
      speed: PLAYER.speed * 1.12 ** l.swift * (player.overdrive > 0 ? 1.2 : 1),
      shots: 1 + l.split,
      pierce: l.pierce,
      magnet: PLAYER.magnet * 1.7 ** l.magnet,
      auraRadius: l.aura > 0 ? 70 + 15 * l.aura : 0,
      auraDps: l.aura > 0 ? 10 + 8 * l.aura : 0,
    };
  }

  function spawnPoint() {
    for (let tries = 0; tries < 8; tries += 1) {
      const side = Math.floor(random() * 4);
      let x;
      let y;
      if (side === 0) { x = FIELD.margin + random() * (FIELD.width - FIELD.margin * 2); y = FIELD.margin; }
      else if (side === 1) { x = FIELD.margin + random() * (FIELD.width - FIELD.margin * 2); y = FIELD.height - FIELD.margin; }
      else if (side === 2) { x = FIELD.margin; y = FIELD.margin + random() * (FIELD.height - FIELD.margin * 2); }
      else { x = FIELD.width - FIELD.margin; y = FIELD.margin + random() * (FIELD.height - FIELD.margin * 2); }
      if (dist2(x, y, player.x, player.y) > 260 * 260) return { x, y };
    }
    return { x: FIELD.margin, y: FIELD.margin };
  }

  function spawnEnemy(kind) {
    const e = free(enemies);
    if (!e) return;
    const def = ENEMY[kind];
    const hpScale = 1 + HP_PER_WAVE * (state.wave - 1);
    const elite = state.wave >= ELITE.fromWave && random() < ELITE.chance;
    const at = spawnPoint();
    e.active = true;
    e.kind = kind;
    e.x = at.x;
    e.y = at.y;
    e.vx = 0;
    e.vy = 0;
    e.maxHp = def.hp * hpScale * (elite ? ELITE.hpMult : 1);
    e.hp = e.maxHp;
    e.radius = def.radius * (elite ? ELITE.radiusMult : 1);
    e.speed = def.speed * (elite ? ELITE.speedMult : 1);
    e.dmg = def.dmg;
    e.elite = elite;
    e.state = 'chase';
    e.stateTimer = 0;
    e.spitTimer = def.spitEvery ? def.spitEvery * (0.6 + random() * 0.8) : 0;
    e.dashX = 0;
    e.dashY = 0;
    e.flash = 0;
  }

  function startWave(n) {
    state.wave = n;
    state.waveState = 'spawning';
    state.spawnQueue = [];
    const mix = waveMix(n);
    const total = WAVE.count(n);
    for (let i = 0; i < total; i += 1) state.spawnQueue.push(pickWeighted(random, mix));
    // Shuffle the queue so kinds arrive mixed, not grouped.
    for (let i = state.spawnQueue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      const tmp = state.spawnQueue[i];
      state.spawnQueue[i] = state.spawnQueue[j];
      state.spawnQueue[j] = tmp;
    }
    state.spawnTimer = 0.4;
  }

  function aliveCount() {
    let n = 0;
    for (const e of enemies) if (e.active) n += 1;
    return n;
  }

  function enemiesLeft() {
    return state.spawnQueue.length + aliveCount();
  }

  function offerUpgrades() {
    const keys = Object.keys(UPGRADES).filter((k) => player.levels[k] < UPGRADES[k].max);
    const picks = [];
    while (picks.length < 3 && keys.length > 0) {
      const i = Math.floor(random() * keys.length);
      picks.push(keys.splice(i, 1)[0]);
    }
    state.choices = picks;
    state.phase = 'upgrade';
    return picks;
  }

  function chooseUpgrade(index) {
    const key = state.choices[index];
    if (!key) return null;
    player.levels[key] += 1;
    if (key === 'plating') {
      player.maxHp += 30;
      player.hp = Math.min(player.maxHp, player.hp + 30);
    }
    state.choices = [];
    state.phase = 'play';
    startWave(state.wave + 1);
    return key;
  }

  function startRun() {
    reset();
    state.phase = 'play';
    startWave(1);
  }

  function continueEndless() {
    state.endless = true;
    state.phase = 'play';
    startWave(MAX_WAVE + 1);
  }

  function hurtPlayer(dmg, fromX, fromY) {
    if (player.invuln > 0 || state.phase !== 'play') return 0;
    player.hp -= dmg;
    player.invuln = PLAYER.invuln;
    state.shake = Math.max(state.shake, 10);
    const dx = player.x - fromX;
    const dy = player.y - fromY;
    const len = Math.hypot(dx, dy) || 1;
    player.vx += (dx / len) * PLAYER.knockback;
    player.vy += (dy / len) * PLAYER.knockback;
    burst(player.x, player.y, '#ff5d73', 14, 260, 3);
    if (player.hp <= 0) {
      player.hp = 0;
      state.phase = 'over';
      burst(player.x, player.y, '#ffb347', 60, 420, 4);
      state.shake = 18;
      return EVENT_HIT | EVENT_OVER;
    }
    return EVENT_HIT;
  }

  const KIND_COLOR = { emberling: '#ff7a2f', spitter: '#c77dff', dasher: '#ffd23f', brute: '#e5484d' };

  function damageEnemy(e, dmg) {
    e.hp -= dmg;
    e.flash = 0.09;
    burst(e.x, e.y, KIND_COLOR[e.kind], 4, 160, 2.5);
    if (e.hp > 0) return 0;
    e.active = false;
    const def = ENEMY[e.kind];
    const scoreMult = e.elite ? ELITE.scoreMult : 1;
    if (state.phase !== 'demo') {
      state.score += def.score * scoreMult;
      state.kills += 1;
    }
    const gemCount = def.gems * (e.elite ? ELITE.gemMult : 1);
    for (let i = 0; i < gemCount; i += 1) dropPickup('gem', e.x, e.y);
    if (random() < PICKUP.heartDrop) dropPickup('heart', e.x, e.y);
    if (random() < PICKUP.overdriveDrop) dropPickup('overdrive', e.x, e.y);
    burst(e.x, e.y, '#ff9a3d', e.kind === 'brute' ? 26 : 12, 300, 3.5);
    floater(e.x, e.y - 10, `+${def.score * scoreMult}`, '#ffc53d');
    if (e.kind === 'brute' || e.elite) {
      state.hitStop = Math.max(state.hitStop, 0.06);
      state.shake = Math.max(state.shake, 7);
    }
    return EVENT_KILL;
  }

  function dropPickup(kind, x, y) {
    const p = free(pickups);
    if (!p) return;
    const angle = random() * TAU;
    const speed = 60 + random() * 120;
    p.active = true;
    p.kind = kind;
    p.x = Math.min(FIELD.width - 20, Math.max(20, x));
    p.y = Math.min(FIELD.height - 20, Math.max(20, y));
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.value = kind === 'gem' ? 1 : 0;
  }

  function fireBullets(st) {
    const spreadStep = 0.11;
    const count = st.shots;
    const base = player.aim - ((count - 1) * spreadStep) / 2;
    for (let i = 0; i < count; i += 1) {
      const b = free(bullets);
      if (!b) return;
      const angle = base + i * spreadStep;
      b.active = true;
      b.x = player.x + Math.cos(angle) * (PLAYER.radius + 8);
      b.y = player.y + Math.sin(angle) * (PLAYER.radius + 8);
      b.vx = Math.cos(angle) * PLAYER.bulletSpeed;
      b.vy = Math.sin(angle) * PLAYER.bulletSpeed;
      b.dmg = st.damage;
      b.pierce = st.pierce;
      b.life = PLAYER.bulletLife;
      b.radius = PLAYER.bulletRadius;
    }
  }

  function updateParticles(dt) {
    for (const p of particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
    }
    for (const f of floaters) {
      if (!f.active) continue;
      f.life -= dt;
      f.y -= 34 * dt;
      if (f.life <= 0) f.active = false;
    }
  }

  /**
   * One fixed step. `ctrl` is {mx, my, aimX, aimY} from input or the
   * autopilot; the game auto-fires toward the aim. `demo` runs the title
   * backdrop: enemies mill about, the player cannot be hurt, nothing scores.
   */
  function step(dt, ctrl, demo = false) {
    let events = 0;
    if (state.hitStop > 0) {
      state.hitStop -= dt;
      updateParticles(dt);
      return 0;
    }
    if (state.shake > 0) state.shake = Math.max(0, state.shake - 30 * dt);
    if (player.invuln > 0) player.invuln = Math.max(0, player.invuln - dt);
    if (player.overdrive > 0) {
      player.overdrive = Math.max(0, player.overdrive - dt);
      state.overdriveLeft = player.overdrive;
    }
    if (state.phase === 'play') state.elapsed += dt;

    const st = stats();

    // --- player movement ---
    const mx = ctrl.mx || 0;
    const my = ctrl.my || 0;
    const targetVx = mx * st.speed;
    const targetVy = my * st.speed;
    player.vx += (targetVx - player.vx) * Math.min(1, 14 * dt);
    player.vy += (targetVy - player.vy) * Math.min(1, 14 * dt);
    player.x = Math.min(FIELD.width - FIELD.margin, Math.max(FIELD.margin, player.x + player.vx * dt));
    player.y = Math.min(FIELD.height - FIELD.margin, Math.max(FIELD.margin, player.y + player.vy * dt));
    player.aim = Math.atan2(ctrl.aimY - player.y, ctrl.aimX - player.x);

    // --- auto-fire ---
    if (state.phase === 'play' || demo) {
      player.fireTimer -= dt;
      if (player.fireTimer <= 0) {
        fireBullets(st);
        player.fireTimer = st.fireInterval;
      }
    }

    // --- ember aura ---
    if (st.auraRadius > 0 && state.phase === 'play') {
      player.auraTimer += dt;
      if (player.auraTimer >= AURA_TICK) {
        player.auraTimer -= AURA_TICK;
        for (const e of enemies) {
          if (!e.active) continue;
          if (dist2(e.x, e.y, player.x, player.y) < (st.auraRadius + e.radius) ** 2) {
            events |= damageEnemy(e, st.auraDps * AURA_TICK);
          }
        }
      }
    }

    // --- spawning ---
    if (state.phase === 'play' && state.waveState !== 'done') {
      state.spawnTimer -= dt;
      if (state.spawnQueue.length > 0 && state.spawnTimer <= 0 && aliveCount() < WAVE.maxAlive(state.wave)) {
        spawnEnemy(state.spawnQueue.shift());
        state.spawnTimer = WAVE.spawnEvery(state.wave);
      }
      if (state.spawnQueue.length === 0) state.waveState = 'fighting';
    }
    if (demo) {
      if (aliveCount() < 6) spawnEnemy(random() < 0.7 ? 'emberling' : 'spitter');
    }

    // --- enemies ---
    for (const e of enemies) {
      if (!e.active) continue;
      if (e.flash > 0) e.flash -= dt;
      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const nx = dx / d;
      const ny = dy / d;
      if (e.kind === 'dasher') {
        if (e.state === 'chase') {
          e.x += nx * e.speed * dt;
          e.y += ny * e.speed * dt;
          e.stateTimer -= dt;
          if (d < 280 && e.stateTimer <= 0) {
            e.state = 'telegraph';
            e.stateTimer = ENEMY.dasher.telegraph;
            e.dashX = nx;
            e.dashY = ny;
          }
        } else if (e.state === 'telegraph') {
          e.stateTimer -= dt;
          if (e.stateTimer <= 0) {
            e.state = 'dash';
            e.stateTimer = ENEMY.dasher.dashTime;
          }
        } else {
          e.x += e.dashX * ENEMY.dasher.dashSpeed * dt;
          e.y += e.dashY * ENEMY.dasher.dashSpeed * dt;
          e.stateTimer -= dt;
          if (e.stateTimer <= 0) {
            e.state = 'chase';
            e.stateTimer = ENEMY.dasher.dashCooldown;
          }
        }
      } else if (e.kind === 'spitter') {
        if (d < 200) { e.x -= nx * e.speed * dt; e.y -= ny * e.speed * dt; }
        else if (d > 320) { e.x += nx * e.speed * dt; e.y += ny * e.speed * dt; }
        e.spitTimer -= dt;
        if (e.spitTimer <= 0 && d < 560 && state.phase === 'play') {
          e.spitTimer = ENEMY.spitter.spitEvery * (0.85 + random() * 0.3);
          const eb = free(ebullets);
          if (eb) {
            eb.active = true;
            eb.x = e.x;
            eb.y = e.y;
            eb.vx = nx * ENEMY.spitter.spitSpeed;
            eb.vy = ny * ENEMY.spitter.spitSpeed;
            eb.dmg = ENEMY.spitter.dmg;
            eb.life = 3;
            eb.radius = ENEMY.spitter.spitRadius;
          }
        }
      } else {
        e.x += nx * e.speed * dt;
        e.y += ny * e.speed * dt;
      }
      e.x = Math.min(FIELD.width - 10, Math.max(10, e.x));
      e.y = Math.min(FIELD.height - 10, Math.max(10, e.y));
      // Contact damage.
      if (!demo && state.phase === 'play') {
        const rr = e.radius + PLAYER.radius;
        if (dist2(e.x, e.y, player.x, player.y) < rr * rr) {
          events |= hurtPlayer(e.dmg, e.x, e.y);
          if (state.phase === 'over') return events | EVENT_OVER;
        }
      }
    }
    // Enemy separation so they do not stack into one blob.
    for (let i = 0; i < enemies.length; i += 1) {
      const a = enemies[i];
      if (!a.active) continue;
      for (let j = i + 1; j < enemies.length; j += 1) {
        const b = enemies[j];
        if (!b.active) continue;
        const rr = a.radius + b.radius;
        const d2 = dist2(a.x, a.y, b.x, b.y);
        if (d2 > 0.01 && d2 < rr * rr) {
          const d = Math.sqrt(d2);
          const push = (rr - d) / 2;
          const ux = (b.x - a.x) / d;
          const uy = (b.y - a.y) / d;
          a.x -= ux * push;
          a.y -= uy * push;
          b.x += ux * push;
          b.y += uy * push;
        }
      }
    }

    // --- player bullets ---
    for (const b of bullets) {
      if (!b.active) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < 0 || b.x > FIELD.width || b.y < 0 || b.y > FIELD.height) {
        b.active = false;
        continue;
      }
      for (const e of enemies) {
        if (!e.active) continue;
        const rr = e.radius + b.radius;
        if (dist2(b.x, b.y, e.x, e.y) < rr * rr) {
          events |= damageEnemy(e, b.dmg);
          if (b.pierce > 0) {
            b.pierce -= 1;
          } else {
            b.active = false;
            break;
          }
        }
      }
    }

    // --- enemy bullets ---
    for (const eb of ebullets) {
      if (!eb.active) continue;
      eb.x += eb.vx * dt;
      eb.y += eb.vy * dt;
      eb.life -= dt;
      if (eb.life <= 0 || eb.x < 0 || eb.x > FIELD.width || eb.y < 0 || eb.y > FIELD.height) {
        eb.active = false;
        continue;
      }
      if (!demo && state.phase === 'play') {
        const rr = eb.radius + PLAYER.radius;
        if (dist2(eb.x, eb.y, player.x, player.y) < rr * rr) {
          eb.active = false;
          events |= hurtPlayer(eb.dmg, eb.x - eb.vx, eb.y - eb.vy);
          if (state.phase === 'over') return events | EVENT_OVER;
        }
      }
    }

    // --- pickups ---
    for (const p of pickups) {
      if (!p.active) continue;
      p.vx *= 0.92;
      p.vy *= 0.92;
      const d2 = dist2(p.x, p.y, player.x, player.y);
      if (d2 < st.magnet * st.magnet) {
        const d = Math.sqrt(d2) || 1;
        p.vx += ((player.x - p.x) / d) * 1400 * dt;
        p.vy += ((player.y - p.y) / d) * 1400 * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (d2 < PLAYER.pickupRadius * PLAYER.pickupRadius) {
        p.active = false;
        if (p.kind === 'gem') {
          if (state.phase !== 'demo') {
            state.gems += 1;
            state.score += PICKUP.gemScore;
          }
          events |= EVENT_PICKUP;
        } else if (p.kind === 'heart') {
          player.hp = Math.min(player.maxHp, player.hp + PICKUP.heartHeal);
          floater(player.x, player.y - 24, `+${PICKUP.heartHeal} HP`, '#ff5d73');
          events |= EVENT_HEART;
        } else if (p.kind === 'overdrive') {
          player.overdrive = PICKUP.overdriveTime;
          state.overdriveLeft = PICKUP.overdriveTime;
          floater(player.x, player.y - 24, 'OVERDRIVE!', '#b8ff5d');
          events |= EVENT_OVERDRIVE;
        }
      }
    }

    updateParticles(dt);

    // --- wave clear ---
    if (!demo && state.phase === 'play' && state.waveState === 'fighting' && enemiesLeft() === 0) {
      state.waveState = 'done';
      const bonus = SCORE.clearBase + SCORE.clearPerWave * state.wave;
      state.score += bonus;
      floater(player.x, player.y - 30, `WAVE ${state.wave} CLEAR  +${bonus}`, '#ffc53d');
      events |= EVENT_WAVE_CLEAR;
      if (state.wave >= MAX_WAVE && !state.endless) {
        state.phase = 'victory';
        events |= EVENT_VICTORY;
      } else {
        offerUpgrades();
        events |= EVENT_UPGRADE;
      }
    }
    return events;
  }

  function summary() {
    return {
      score: state.score,
      kills: state.kills,
      gems: state.gems,
      wave: state.wave,
      time: state.elapsed,
      endless: state.endless,
      hp: Math.ceil(player.hp),
      maxHp: player.maxHp,
    };
  }

  reset();
  return { state, reset, startRun, startWave, chooseUpgrade, continueEndless, step, stats, aliveCount, enemiesLeft, summary, hurtPlayer };
}
