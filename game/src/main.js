// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between six screens: title,
// play, upgrade, paused, victory and game over.
//
// ?seed=N fixes the spawn pattern. ?shot=start|play|victory|end (with
// &seed=N) stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import { createWorld, EVENT_HIT, EVENT_KILL, EVENT_OVER, EVENT_OVERDRIVE, EVENT_PICKUP, EVENT_UPGRADE, EVENT_VICTORY, EVENT_WAVE_CLEAR } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_PICK1, ACTION_PICK2, ACTION_PICK3, ACTION_RESTART, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE, SCREEN_VICTORY } from './render.js';
import { autopilot, stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  window.__shotSummary = { screen: scene.screen, ...world.summary() };
  let painted = 0;
  function paint() {
    try {
      renderer.draw(world.state, scene.screen, {
        best: scene.best,
        summary: world.summary(),
        stats: world.stats(),
        enemiesLeft: world.enemiesLeft(),
        aim: null,
      });
    } catch (err) {
      window.__gameError = String(err && err.message ? err.message : err);
      return;
    }
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.startRun();
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    audio.startMusic();
    audio.waveStart();
    announce(`Playing. Wave 1. ${world.state.player.hp} HP.`);
  }

  function endGame() {
    screen = SCREEN_OVER;
    audio.gameOver();
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(`Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function winGame() {
    screen = SCREEN_VICTORY;
    audio.victory();
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(`Victory! Score ${world.state.score}. Press Space for Endless mode.`);
  }

  function handleEvents(events) {
    if (events & EVENT_OVER) {
      endGame();
      return;
    }
    if (events & EVENT_VICTORY) {
      winGame();
      return;
    }
    if (events & EVENT_WAVE_CLEAR) {
      audio.waveClear();
      announce(`Wave ${world.state.wave} clear. Choose an upgrade.`);
    }
    if (events & EVENT_UPGRADE) screen = SCREEN_UPGRADE;
    if (events & EVENT_HIT) {
      audio.hurt();
      announce(`Hit. ${Math.ceil(world.state.player.hp)} HP left.`);
    }
    if (events & EVENT_KILL) audio.explode();
    if (events & EVENT_PICKUP) audio.gem();
    if (events & EVENT_OVERDRIVE) audio.overdrive();
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
      announce(audio.isMuted() ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_RESTART && (screen === SCREEN_PLAY || screen === SCREEN_PAUSED || screen === SCREEN_OVER || screen === SCREEN_VICTORY)) {
      startGame();
      return;
    }
    if (screen === SCREEN_TITLE || screen === SCREEN_OVER) {
      if (actions & ACTION_CONFIRM) startGame();
    } else if (screen === SCREEN_VICTORY) {
      if (actions & ACTION_CONFIRM) {
        world.continueEndless();
        screen = SCREEN_PLAY;
        audio.waveStart();
        announce('Endless mode. The embers keep coming.');
      }
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    } else if (screen === SCREEN_UPGRADE) {
      let pick = -1;
      if (actions & ACTION_PICK1) pick = 0;
      else if (actions & ACTION_PICK2) pick = 1;
      else if (actions & ACTION_PICK3) pick = 2;
      if (pick >= 0 && world.state.choices[pick]) {
        const key = world.chooseUpgrade(pick);
        audio.upgrade();
        screen = SCREEN_PLAY;
        audio.waveStart();
        announce(`Upgrade taken. Wave ${world.state.wave}.`);
      }
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      // The title's backdrop: the autopilot plays a harmless demo game.
      world.step(STEP, autopilot(world.state), true);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const move = input.move();
    const aim = input.aim();
    let aimX = aim.x;
    let aimY = aim.y;
    if (!aim.seen) {
      // No mouse yet: aim at the nearest ember so keyboard-only play works.
      let nearest = null;
      let nearestD = Infinity;
      for (const e of world.state.enemies) {
        if (!e.active) continue;
        const d = (e.x - world.state.player.x) ** 2 + (e.y - world.state.player.y) ** 2;
        if (d < nearestD) {
          nearestD = d;
          nearest = e;
        }
      }
      if (nearest) {
        aimX = nearest.x;
        aimY = nearest.y;
      } else {
        aimX = world.state.player.x;
        aimY = world.state.player.y - 100;
      }
    }
    const events = world.step(STEP, { mx: move.x, my: move.y, aimX, aimY });
    handleEvents(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    try {
      renderer.draw(world.state, screen, {
        best,
        summary: world.summary(),
        stats: world.stats(),
        enemiesLeft: world.enemiesLeft(),
        aim: input.aim(),
      });
    } catch (err) {
      window.__gameError = String(err && err.message ? err.message : err);
    }
  }

  // Leaving the tab pauses a running game rather than letting embers fall unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });
  // Upgrade cards are clickable: 1/2/3 keys work too.
  canvas.addEventListener('click', (event) => {
    if (screen !== SCREEN_UPGRADE) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = 1280 / Math.max(1, rect.width);
    const clickX = (event.clientX - rect.left) * scaleX;
    const clickY = (event.clientY - rect.top) * (720 / Math.max(1, rect.height));
    const cardW = 320;
    const gap = 28;
    const totalW = cardW * 3 + gap * 2;
    const startX = (1280 - totalW) / 2;
    const y = 210;
    if (clickY >= y && clickY <= y + 210) {
      for (let i = 0; i < 3; i += 1) {
        if (clickX >= startX + i * (cardW + gap) && clickX <= startX + i * (cardW + gap) + cardW) {
          if (world.state.choices[i]) {
            world.chooseUpgrade(i);
            audio.upgrade();
            screen = SCREEN_PLAY;
            audio.waveStart();
            announce(`Upgrade taken. Wave ${world.state.wave}.`);
          }
          break;
        }
      }
    }
  });

  // A small debug handle for the headless play-test driver: screen, summary
  // and a forced game-over so the loop can be verified end to end.
  window.__emberfall = {
    screen() {
      return screen;
    },
    summary() {
      return world.summary();
    },
    state() {
      return { phase: world.state.phase, wave: world.state.wave, hp: world.state.player.hp, enemiesLeft: world.enemiesLeft() };
    },
    forceGameOver() {
      if (screen === SCREEN_PLAY) {
        world.state.player.hp = 1;
        world.state.player.invuln = 0;
        world.hurtPlayer(999, world.state.player.x + 10, world.state.player.y);
        if (world.state.phase === 'over') endGame();
      }
    },
  };

  announce('Emberfall. Press Space or click to start.');
  requestAnimationFrame(frame);
}

try {
  if (shot) runShot(shot);
  else runGame();
} catch (err) {
  window.__gameError = String(err && err.message ? err.message : err);
}
