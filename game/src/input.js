// Keyboard and pointer input. WASD/arrows steer, the mouse aims, the game
// auto-fires toward the aim. One-shot presses (confirm, pause, restart,
// upgrade picks, mute) are queued as bit flags and taken once by the loop,
// so a press between two frames is never lost and never counted twice.
import { FIELD } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;
export const ACTION_PICK1 = 8;
export const ACTION_PICK2 = 16;
export const ACTION_PICK3 = 32;
export const ACTION_MUTE = 64;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const RESTART = new Set(['KeyR']);
const MUTE = new Set(['KeyM']);

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  // Aim in field coordinates; starts at the arena centre.
  let aimX = FIELD.width / 2;
  let aimY = FIELD.height / 2;
  let mouseSeen = false;

  function updateAim(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = FIELD.width / Math.max(1, rect.width);
    const scaleY = FIELD.height / Math.max(1, rect.height);
    aimX = (clientX - rect.left) * scaleX;
    aimY = (clientY - rect.top) * scaleY;
    mouseSeen = true;
  }

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) keys.add('up');
    else if (DOWN.has(event.code)) keys.add('down');
    else if (LEFT.has(event.code)) keys.add('left');
    else if (RIGHT.has(event.code)) keys.add('right');
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (RESTART.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RESTART;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (event.code === 'Digit1') {
      if (!event.repeat) actions |= ACTION_PICK1;
    } else if (event.code === 'Digit2') {
      if (!event.repeat) actions |= ACTION_PICK2;
    } else if (event.code === 'Digit3') {
      if (!event.repeat) actions |= ACTION_PICK3;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) keys.delete('up');
    else if (DOWN.has(event.code)) keys.delete('down');
    else if (LEFT.has(event.code)) keys.delete('left');
    else if (RIGHT.has(event.code)) keys.delete('right');
  });
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('pointermove', (event) => updateAim(event.clientX, event.clientY));
  canvas.addEventListener('pointerdown', (event) => {
    updateAim(event.clientX, event.clientY);
    actions |= ACTION_CONFIRM;
  });

  return {
    /** Movement direction as {x, y}, each -1, 0 or 1, normalized. */
    move() {
      const x = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
      const y = (keys.has('down') ? 1 : 0) - (keys.has('up') ? 1 : 0);
      if (x !== 0 && y !== 0) {
        const len = Math.hypot(x, y);
        return { x: x / len, y: y / len };
      }
      return { x, y };
    },
    aim() {
      return { x: aimX, y: aimY, seen: mouseSeen };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
