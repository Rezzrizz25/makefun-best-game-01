// Drawing only: the world's state and the current screen in, pixels out. The
// 1280x720 playfield is scaled to fit the window and centred, the margin
// filled with the backdrop colour. All art is drawn from code: glowing ember
// creatures, a flame-knight player, sparks and smoke. Text that holds a
// number is rebuilt only when the number changes, so a frame allocates
// nothing.
import { FIELD, FONT, MAX_WAVE, PALETTE, PLAYER, UPGRADES } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_UPGRADE = 'upgrade';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_VICTORY = 'victory';
export const SCREEN_OVER = 'over';

const TAU = Math.PI * 2;

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

function fmtTime(seconds) {
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();
  const hpLabel = cachedLabel('HP ');
  const waveLabel = cachedLabel('WAVE ');
  const scoreLabel = cachedLabel('SCORE ');
  const gemsLabel = cachedLabel('GEMS ');
  const killsLabel = cachedLabel('KILLS ');
  const leftLabel = cachedLabel('EMBERS LEFT ');
  const timeLabel = cachedLabel('');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align) {
    if (!fonts.has(size)) fonts.set(size, `bold ${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function circle(x, y, r, color) {
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, r, 0, TAU);
    context.fill();
  }

  function drawArena(state) {
    const grad = context.createLinearGradient(0, 0, 0, FIELD.height);
    grad.addColorStop(0, PALETTE.arenaTop);
    grad.addColorStop(1, PALETTE.arenaBottom);
    context.fillStyle = grad;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    // Faint grid.
    context.strokeStyle = PALETTE.grid;
    context.lineWidth = 1;
    context.beginPath();
    for (let x = FIELD.margin; x <= FIELD.width - FIELD.margin; x += 80) {
      context.moveTo(x, FIELD.margin);
      context.lineTo(x, FIELD.height - FIELD.margin);
    }
    for (let y = FIELD.margin; y <= FIELD.height - FIELD.margin; y += 80) {
      context.moveTo(FIELD.margin, y);
      context.lineTo(FIELD.width - FIELD.margin, y);
    }
    context.stroke();
    // Warm ember glow at the centre.
    const glow = context.createRadialGradient(640, 360, 60, 640, 360, 520);
    glow.addColorStop(0, 'rgba(255, 122, 47, 0.10)');
    glow.addColorStop(1, 'rgba(255, 122, 47, 0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    // Arena edge.
    context.strokeStyle = PALETTE.arenaEdge;
    context.lineWidth = 3;
    context.strokeRect(FIELD.margin, FIELD.margin, FIELD.width - FIELD.margin * 2, FIELD.height - FIELD.margin * 2);
  }

  function drawEnemy(e) {
    const flash = e.flash > 0;
    const body = flash ? '#ffffff' : { emberling: PALETTE.emberling, spitter: PALETTE.spitter, dasher: PALETTE.dasher, brute: PALETTE.brute }[e.kind];
    if (e.kind === 'dasher' && e.state === 'telegraph') {
      // Warning line along the dash direction.
      context.strokeStyle = 'rgba(255, 210, 63, 0.7)';
      context.lineWidth = 3;
      context.setLineDash([10, 8]);
      context.beginPath();
      context.moveTo(e.x, e.y);
      context.lineTo(e.x + e.dashX * 300, e.y + e.dashY * 300);
      context.stroke();
      context.setLineDash([]);
    }
    if (e.kind === 'brute') {
      circle(e.x, e.y, e.radius, body);
      context.strokeStyle = '#7a1f1f';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(e.x - e.radius * 0.6, e.y - e.radius * 0.3);
      context.lineTo(e.x, e.y);
      context.lineTo(e.x + e.radius * 0.5, e.y - e.radius * 0.6);
      context.moveTo(e.x - e.radius * 0.4, e.y + e.radius * 0.5);
      context.lineTo(e.x + e.radius * 0.3, e.y + e.radius * 0.2);
      context.stroke();
    } else {
      // Flame spikes around the body.
      context.fillStyle = body;
      context.beginPath();
      const spikes = e.kind === 'spitter' ? 8 : 6;
      for (let i = 0; i < spikes; i += 1) {
        const a = (i / spikes) * TAU + e.x * 0.01;
        const r1 = e.radius * 1.35;
        const r0 = e.radius * 0.85;
        const ax = e.x + Math.cos(a) * r1;
        const ay = e.y + Math.sin(a) * r1;
        const bx = e.x + Math.cos(a + 0.35) * r0;
        const by = e.y + Math.sin(a + 0.35) * r0;
        const cx = e.x + Math.cos(a - 0.35) * r0;
        const cy = e.y + Math.sin(a - 0.35) * r0;
        context.moveTo(ax, ay);
        context.lineTo(bx, by);
        context.lineTo(cx, cy);
        context.closePath();
      }
      context.fill();
      circle(e.x, e.y, e.radius, body);
    }
    // Eyes: two white dots with dark pupils, always facing the player.
    const eyeOff = e.radius * 0.35;
    circle(e.x - eyeOff, e.y - eyeOff * 0.5, Math.max(2, e.radius * 0.16), '#fff');
    circle(e.x + eyeOff, e.y - eyeOff * 0.5, Math.max(2, e.radius * 0.16), '#fff');
    circle(e.x - eyeOff, e.y - eyeOff * 0.5, Math.max(1, e.radius * 0.08), '#1a0b0b');
    circle(e.x + eyeOff, e.y - eyeOff * 0.5, Math.max(1, e.radius * 0.08), '#1a0b0b');
    if (e.elite) {
      context.strokeStyle = PALETTE.eliteRing;
      context.lineWidth = 3;
      context.beginPath();
      context.arc(e.x, e.y, e.radius + 6, 0, TAU);
      context.stroke();
      // Little crown.
      context.fillStyle = PALETTE.eliteRing;
      context.beginPath();
      context.moveTo(e.x - 10, e.y - e.radius - 4);
      context.lineTo(e.x - 5, e.y - e.radius - 14);
      context.lineTo(e.x, e.y - e.radius - 4);
      context.lineTo(e.x + 5, e.y - e.radius - 14);
      context.lineTo(e.x + 10, e.y - e.radius - 4);
      context.closePath();
      context.fill();
    }
    // Health bar for hurt enemies.
    if (e.hp < e.maxHp) {
      const w = e.radius * 2;
      const frac = Math.max(0, e.hp / e.maxHp);
      context.fillStyle = 'rgba(0, 0, 0, 0.55)';
      context.fillRect(e.x - w / 2, e.y - e.radius - 12, w, 5);
      context.fillStyle = frac > 0.5 ? '#7ddb52' : frac > 0.25 ? '#ffc53d' : '#ff4d4d';
      context.fillRect(e.x - w / 2, e.y - e.radius - 12, w * frac, 5);
    }
  }

  function drawPlayer(state, ui) {
    const p = state.player;
    if (p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0) return; // Blink while invulnerable.
    const st = ui.stats;
    if (st && st.auraRadius > 0) {
      context.fillStyle = 'rgba(255, 122, 47, 0.10)';
      context.beginPath();
      context.arc(p.x, p.y, st.auraRadius, 0, TAU);
      context.fill();
      context.strokeStyle = 'rgba(255, 150, 60, 0.35)';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(p.x, p.y, st.auraRadius, 0, TAU);
      context.stroke();
    }
    if (p.overdrive > 0) {
      context.strokeStyle = 'rgba(184, 255, 93, 0.8)';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(p.x, p.y, PLAYER.radius + 8, 0, TAU);
      context.stroke();
    }
    // Gun barrel toward the aim.
    context.strokeStyle = '#d8c9b8';
    context.lineWidth = 6;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(p.x, p.y);
    context.lineTo(p.x + Math.cos(p.aim) * (PLAYER.radius + 12), p.y + Math.sin(p.aim) * (PLAYER.radius + 12));
    context.stroke();
    // Body: ember knight.
    circle(p.x, p.y, PLAYER.radius, PALETTE.player);
    circle(p.x, p.y, PLAYER.radius * 0.62, PALETTE.playerCore);
    // Flame crest on top.
    context.fillStyle = '#ff5d2f';
    context.beginPath();
    context.moveTo(p.x - 7, p.y - PLAYER.radius + 4);
    context.quadraticCurveTo(p.x, p.y - PLAYER.radius - 14, p.x + 7, p.y - PLAYER.radius + 4);
    context.closePath();
    context.fill();
    // Eyes toward the aim.
    const ex = Math.cos(p.aim) * 5;
    const ey = Math.sin(p.aim) * 5;
    circle(p.x - 5 + ex, p.y - 2 + ey, 2.4, '#1a0b0b');
    circle(p.x + 5 + ex, p.y - 2 + ey, 2.4, '#1a0b0b');
  }

  function drawPickups(state) {
    for (const p of state.pickups) {
      if (!p.active) continue;
      if (p.kind === 'gem') {
        context.fillStyle = PALETTE.gem;
        context.beginPath();
        context.moveTo(p.x, p.y - 8);
        context.lineTo(p.x + 6, p.y);
        context.lineTo(p.x, p.y + 8);
        context.lineTo(p.x - 6, p.y);
        context.closePath();
        context.fill();
      } else if (p.kind === 'heart') {
        context.fillStyle = PALETTE.heart;
        context.beginPath();
        context.arc(p.x - 4, p.y - 2, 5, 0, TAU);
        context.arc(p.x + 4, p.y - 2, 5, 0, TAU);
        context.fill();
        context.beginPath();
        context.moveTo(p.x - 8, p.y);
        context.lineTo(p.x, p.y + 9);
        context.lineTo(p.x + 8, p.y);
        context.closePath();
        context.fill();
      } else {
        // Overdrive star.
        context.fillStyle = PALETTE.overdrive;
        context.beginPath();
        for (let i = 0; i < 10; i += 1) {
          const a = (i / 10) * TAU - Math.PI / 2;
          const r = i % 2 === 0 ? 11 : 5;
          const px = p.x + Math.cos(a) * r;
          const py = p.y + Math.sin(a) * r;
          if (i === 0) context.moveTo(px, py);
          else context.lineTo(px, py);
        }
        context.closePath();
        context.fill();
      }
    }
  }

  function drawHud(state, ui) {
    const p = state.player;
    const s = ui.summary;
    context.textBaseline = 'top';
    // HP bar, top-left.
    context.fillStyle = 'rgba(0, 0, 0, 0.5)';
    context.fillRect(20, 18, 220, 22);
    const frac = Math.max(0, p.hp / p.maxHp);
    context.fillStyle = frac > 0.5 ? '#7ddb52' : frac > 0.25 ? '#ffc53d' : '#ff4d4d';
    context.fillRect(22, 20, 216 * frac, 18);
    text(hpLabel(`${Math.ceil(p.hp)}/${p.maxHp}`), 248, 20, 20, PALETTE.text, 'left');
    // Wave, top-centre.
    text(waveLabel(state.endless ? `${state.wave} (ENDLESS)` : `${state.wave}/${MAX_WAVE}`), FIELD.width / 2, 18, 24, PALETTE.text, 'center');
    text(leftLabel(state.phase === 'upgrade' ? 0 : ui.enemiesLeft), FIELD.width / 2, 46, 16, PALETTE.muted, 'center');
    // Score, top-right.
    text(scoreLabel(s.score), FIELD.width - 20, 18, 22, PALETTE.text, 'right');
    text(gemsLabel(s.gems), FIELD.width - 20, 44, 18, PALETTE.gem, 'right');
    text(killsLabel(s.kills), FIELD.width - 20, 66, 18, PALETTE.muted, 'right');
    // Time, bottom-left.
    text(timeLabel(fmtTime(s.time)), 20, FIELD.height - 34, 18, PALETTE.muted, 'left');
    // Overdrive, bottom-centre.
    if (p.overdrive > 0) {
      text(`OVERDRIVE ${p.overdrive.toFixed(1)}s`, FIELD.width / 2, FIELD.height - 34, 20, PALETTE.overdrive, 'center');
    }
    // Aim reticle.
    if (ui.aim && ui.aim.seen) {
      context.strokeStyle = 'rgba(255, 233, 163, 0.8)';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(ui.aim.x, ui.aim.y, 9, 0, TAU);
      context.stroke();
      context.beginPath();
      context.moveTo(ui.aim.x - 13, ui.aim.y);
      context.lineTo(ui.aim.x - 5, ui.aim.y);
      context.moveTo(ui.aim.x + 5, ui.aim.y);
      context.lineTo(ui.aim.x + 13, ui.aim.y);
      context.moveTo(ui.aim.x, ui.aim.y - 13);
      context.lineTo(ui.aim.x, ui.aim.y - 5);
      context.moveTo(ui.aim.x, ui.aim.y + 5);
      context.lineTo(ui.aim.x, ui.aim.y + 13);
      context.stroke();
    }
  }

  function drawPanel(title, lines, prompt, promptColor = PALETTE.gold) {
    const width = 640;
    const lineH = 32;
    const height = 110 + lines.length * lineH + 54;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(10, 5, 6, 0.72)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 64, 46, PALETTE.text, 'center');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], FIELD.width / 2, y + 112 + i * lineH, 20, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 30, 22, promptColor, 'center');
  }

  function drawTitle(state, ui) {
    context.fillStyle = 'rgba(10, 5, 6, 0.55)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.textBaseline = 'alphabetic';
    text('EMBERFALL', FIELD.width / 2, 210, 84, PALETTE.player, 'center');
    text('Survive ten waves of living embers. Clear wave 10 to win.', FIELD.width / 2, 258, 22, PALETTE.text, 'center');
    text('WASD / arrows to move · mouse to aim · auto-fire', FIELD.width / 2, 300, 20, PALETTE.muted, 'center');
    text('Pick 1 of 3 upgrades after each wave · grab gems, hearts and overdrive', FIELD.width / 2, 330, 20, PALETTE.muted, 'center');
    if (ui.best > 0) text(`Best score: ${ui.best}`, FIELD.width / 2, 392, 22, PALETTE.gold, 'center');
    text('Press SPACE or click to start', FIELD.width / 2, 452, 26, PALETTE.gold, 'center');
    text('M mute · P pause', FIELD.width / 2, 500, 16, PALETTE.muted, 'center');
  }

  function drawUpgrade(state, ui) {
    context.fillStyle = 'rgba(10, 5, 6, 0.66)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.textBaseline = 'alphabetic';
    text(`WAVE ${state.wave} CLEAR — CHOOSE AN UPGRADE`, FIELD.width / 2, 150, 34, PALETTE.gold, 'center');
    const cardW = 320;
    const cardH = 210;
    const gap = 28;
    const totalW = cardW * 3 + gap * 2;
    const startX = (FIELD.width - totalW) / 2;
    const y = 210;
    state.choices.forEach((key, i) => {
      const def = UPGRADES[key];
      const level = state.player.levels[key];
      const x = startX + i * (cardW + gap);
      context.fillStyle = PALETTE.panel;
      context.fillRect(x, y, cardW, cardH);
      context.strokeStyle = PALETTE.panelEdge;
      context.lineWidth = 2;
      context.strokeRect(x, y, cardW, cardH);
      text(`${i + 1}`, x + 18, y + 40, 24, PALETTE.muted, 'left');
      text(def.name, x + cardW / 2, y + 78, 26, PALETTE.text, 'center');
      text(def.desc, x + cardW / 2, y + 122, 19, PALETTE.gold, 'center');
      text(level > 0 ? `Owned: level ${level} → ${level + 1}` : 'New upgrade', x + cardW / 2, y + 158, 17, PALETTE.muted, 'center');
      text('Click or press 1 / 2 / 3', x + cardW / 2, y + cardH - 22, 15, PALETTE.muted, 'center');
    });
  }

  function drawStats(state, ui, title, prompt) {
    const s = ui.summary;
    const lines = [
      `Score ${s.score}   ·   Kills ${s.kills}   ·   Gems ${s.gems}`,
      `Reached wave ${s.wave}${s.endless ? ' (Endless)' : ''}   ·   Survived ${fmtTime(s.time)}`,
      ui.best > 0 ? `Best score: ${ui.best}` : '',
    ];
    drawPanel(title, lines, prompt);
  }

  /** Paint one frame: the field, then the HUD or a panel for the screen. */
  function draw(state, screen, ui) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const shake = state.shake;
    const sx = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    const sy = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    context.setTransform(view.scale, 0, 0, view.scale, view.x + sx * view.scale, view.y + sy * view.scale);
    drawArena(state);
    drawPickups(state);
    for (const e of state.enemies) if (e.active) drawEnemy(e);
    for (const eb of state.ebullets) {
      if (!eb.active) continue;
      circle(eb.x, eb.y, eb.radius + 2, 'rgba(199, 125, 255, 0.35)');
      circle(eb.x, eb.y, eb.radius, '#e0aaff');
    }
    for (const b of state.bullets) {
      if (!b.active) continue;
      context.strokeStyle = PALETTE.bullet;
      context.lineWidth = 4;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
      context.lineTo(b.x, b.y);
      context.stroke();
      circle(b.x, b.y, 2.5, '#ffffff');
    }
    drawPlayer(state, ui);
    for (const p of state.particles) {
      if (!p.active) continue;
      context.globalAlpha = Math.max(0, p.life / p.maxLife);
      circle(p.x, p.y, p.size, p.color);
    }
    context.globalAlpha = 1;
    context.textBaseline = 'alphabetic';
    for (const f of state.floaters) {
      if (!f.active) continue;
      context.globalAlpha = Math.min(1, f.life);
      text(f.text, f.x, f.y, 18, f.color, 'center');
    }
    context.globalAlpha = 1;

    if (screen === SCREEN_TITLE) {
      drawTitle(state, ui);
      return;
    }
    drawHud(state, ui);
    if (screen === SCREEN_UPGRADE) drawUpgrade(state, ui);
    else if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The embers wait for you.'], 'Press P or Space to resume');
    } else if (screen === SCREEN_VICTORY) {
      drawStats(state, ui, 'VICTORY — THE FALL ENDS', 'Press SPACE for Endless mode · R to play again');
    } else if (screen === SCREEN_OVER) {
      drawStats(state, ui, 'THE EMBERS TAKE YOU', 'Press SPACE or R to try again');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
