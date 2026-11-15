// The screenshot scenes behind ?shot=start|play|victory|end. Each one plays
// the real rules forward from a fresh world for a fixed stretch, steered by a
// simple autopilot (flee the nearest embers, sidestep a dasher's telegraph,
// chase gems when it is safe, aim at the closest foe), so the frame is what a
// real game looks like and the same seed always gives the same frame. The
// victory scene really plays waves 1–10 and picks upgrades by priority;
// the end scene's pilot is reckless and is caught out once the waves scale.
import { FIELD, STEP } from './config.js';
import { EVENT_OVER, EVENT_UPGRADE, EVENT_VICTORY } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_VICTORY } from './render.js';

const START_SECONDS = 5;
const PLAY_TARGET_WAVE = 5;
const PLAY_BUSY_LEFT = 10;
const STEP_CAP = 60 * 900;

/** Upgrade priority for the autopilot's between-wave picks. */
const PICK_ORDER = ['split', 'heavy', 'rapid', 'pierce', 'aura', 'swift', 'magnet', 'plating'];

function pickUpgrade(world) {
  const choices = world.state.choices;
  for (const key of PICK_ORDER) {
    const index = choices.indexOf(key);
    if (index !== -1) {
      world.chooseUpgrade(index);
      return;
    }
  }
  if (choices.length > 0) world.chooseUpgrade(0);
}

/**
 * Steer the player: flee nearby enemies, sidestep telegraphs, chase gems
 * when clear, and always aim at the nearest foe. `bold` walks into the
 * fight instead of away from it, which is how the end scene dies.
 */
export function autopilot(state, bold = false) {
  const p = state.player;
  let fx = 0;
  let fy = 0;
  let nearest = null;
  let nearestD = Infinity;
  for (const e of state.enemies) {
    if (!e.active) continue;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < nearestD) {
      nearestD = d;
      nearest = e;
    }
    if (!bold && d < 230) {
      const w = ((230 - d) / 230) * 1.8;
      fx += (dx / d) * w;
      fy += (dy / d) * w;
    }
    if (!bold && e.kind === 'dasher' && e.state === 'telegraph' && d < 340) {
      // Step sideways out of the dash line.
      fx += -e.dashY * 1.4;
      fy += e.dashX * 1.4;
    }
  }
  if (!bold) {
    for (const eb of state.ebullets) {
      if (!eb.active) continue;
      const dx = p.x - eb.x;
      const dy = p.y - eb.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < 130) {
        fx += (dx / d) * 1.2;
        fy += (dy / d) * 1.2;
      }
    }
    // Gems are worth the walk when nothing is close.
    if (nearestD > 160) {
      let gem = null;
      let gemD = Infinity;
      for (const pk of state.pickups) {
        if (!pk.active || pk.kind !== 'gem') continue;
        const d = Math.hypot(pk.x - p.x, pk.y - p.y);
        if (d < gemD) {
          gemD = d;
          gem = pk;
        }
      }
      if (gem && gemD < 320) {
        fx += ((gem.x - p.x) / gemD) * 0.9;
        fy += ((gem.y - p.y) / gemD) * 0.9;
      }
    }
  }
  if (bold && nearest) {
    fx = (nearest.x - p.x) / nearestD;
    fy = (nearest.y - p.y) / nearestD;
  }
  // Keep off the walls.
  if (p.x < 130) fx += 0.9;
  if (p.x > FIELD.width - 130) fx -= 0.9;
  if (p.y < 130) fy += 0.9;
  if (p.y > FIELD.height - 130) fy -= 0.9;
  const len = Math.hypot(fx, fy);
  const mx = len > 0.01 ? fx / len : 0;
  const my = len > 0.01 ? fy / len : 0;
  return {
    mx,
    my,
    aimX: nearest ? nearest.x : p.x + Math.cos(p.aim) * 100,
    aimY: nearest ? nearest.y : p.y + Math.sin(p.aim) * 100,
  };
}

/**
 * Set `world` to the named scene (start, play, victory or end; any other
 * name is start) and return the screen to draw over it and the best score
 * to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'victory' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) {
      world.step(STEP, autopilot(world.state), true);
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }

  world.startRun();
  if (name === 'end') {
    for (let i = 0; i < STEP_CAP; i += 1) {
      const events = world.step(STEP, autopilot(world.state, true));
      if (events & EVENT_UPGRADE) pickUpgrade(world);
      if (events & EVENT_OVER) break;
    }
    return { screen: SCREEN_OVER, best: world.state.score };
  }
  if (name === 'victory') {
    for (let i = 0; i < STEP_CAP; i += 1) {
      const events = world.step(STEP, autopilot(world.state));
      if (events & EVENT_UPGRADE) pickUpgrade(world);
      if (events & EVENT_VICTORY) break;
      if (world.state.phase === 'over') break;
    }
    const won = world.state.phase === 'victory';
    return { screen: won ? SCREEN_VICTORY : SCREEN_PLAY, best: world.state.score };
  }
  // Play: a busy mid-game frame, wave 5 with embers still standing.
  for (let i = 0; i < STEP_CAP; i += 1) {
    const events = world.step(STEP, autopilot(world.state));
    if (events & EVENT_UPGRADE) pickUpgrade(world);
    if (world.state.phase === 'over') break;
    if (world.state.wave >= PLAY_TARGET_WAVE && world.enemiesLeft() <= PLAY_BUSY_LEFT) break;
    if (world.state.wave > PLAY_TARGET_WAVE) break;
  }
  return { screen: SCREEN_PLAY, best: world.state.score };
}
