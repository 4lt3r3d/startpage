// SP//ADD — toolbar icon drawing + animation frames.
// Mirrors the startpage favicon: cursor blinks x3 -> types "SP" -> glitch ->
// lands on "+" (instead of the favicon's "404"). Everything is drawn on a
// 16x16 pixel grid and scaled up by whole numbers so it stays crisp.
// Colors: accent from the startpage (favicon uses #00ffb3), glitch red #ff2d55
// like the favicon, black background like the favicon.

const SPADD_RED = '#ff2d55';

// 4x7 pixel letters
const SPADD_GLYPHS = {
  S: ['.###', '#...', '#...', '.##.', '...#', '...#', '###.'],
  P: ['###.', '#..#', '#..#', '###.', '#...', '#...', '#...'],
};

function spaddPx(ctx, k, x, y, w, h) { ctx.fillRect(x * k, y * k, w * k, h * k); }

function spaddGlyph(ctx, k, ch, x0, y0) {
  SPADD_GLYPHS[ch].forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') spaddPx(ctx, k, x0 + x, y0 + y, 1, 1); }));
}

function spaddPlus(ctx, k, dx = 0, dy = 0) {
  spaddPx(ctx, k, 3 + dx, 7 + dy, 10, 2);
  spaddPx(ctx, k, 7 + dx, 3 + dy, 2, 10);
}

// frame: { type: 'cursor', on } | { type: 'text', text, cursorAfter } | { type: 'glitch' } |
//        { type: 'plus' } (red + over a green ghost) | { type: 'still' } (green S, red P)
function spaddDrawFrame(ctx, s, frame, accent) {
  const k = s / 16;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, s, s);

  if (frame.type === 'cursor') {
    if (frame.on) { ctx.fillStyle = accent; spaddPx(ctx, k, 4, 3, 3, 10); }
  } else if (frame.type === 'text') {
    ctx.fillStyle = accent;
    // letters 4px wide with a 2px gap; "SP" alone is centered (3px each side),
    // shifted left a pixel while the cursor is showing so the cursor fits
    const x0 = frame.text.length === 1 ? 5 : (frame.cursorAfter ? 2 : 3);
    [...frame.text].forEach((ch, i) => spaddGlyph(ctx, k, ch, x0 + i * 6, 4));
    if (frame.cursorAfter) spaddPx(ctx, k, x0 + frame.text.length * 6 - 1, 3, 2, 9);
  } else if (frame.type === 'glitch') {
    // the "+" jitters: a ghost copy in the other color, offset by a pixel
    const r = () => Math.floor(Math.random() * 3) - 1;
    const redFirst = Math.random() < 0.5;
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = redFirst ? accent : SPADD_RED; spaddPlus(ctx, k, r(), r());
    ctx.globalAlpha = 1;
    ctx.fillStyle = redFirst ? SPADD_RED : accent; spaddPlus(ctx, k, r(), r());
  } else if (frame.type === 'plus') {
    // where the animation lands: red "+" on top, green ghost a pixel down-left
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = accent; spaddPlus(ctx, k, -1, 1);
    ctx.globalAlpha = 1;
    ctx.fillStyle = SPADD_RED; spaddPlus(ctx, k, 0, 0);
  } else { // still: green S, red P
    ctx.fillStyle = accent;    spaddGlyph(ctx, k, 'S', 3, 4);
    ctx.fillStyle = SPADD_RED; spaddGlyph(ctx, k, 'P', 9, 4);
  }
}

// favicon timings; lands on the red "+", then returns to the still SP
const SPADD_ANIM = [
  { f: { type: 'cursor', on: true },  d: 450 },
  { f: { type: 'cursor', on: false }, d: 450 },
  { f: { type: 'cursor', on: true },  d: 450 },
  { f: { type: 'cursor', on: false }, d: 450 },
  { f: { type: 'cursor', on: true },  d: 450 },
  { f: { type: 'cursor', on: false }, d: 450 },
  { f: { type: 'text', text: 'S',  cursorAfter: true },  d: 300 },
  { f: { type: 'text', text: 'SP', cursorAfter: true },  d: 300 },
  { f: { type: 'text', text: 'SP', cursorAfter: false }, d: 700 },
  { f: { type: 'glitch' }, d: 90 },
  { f: { type: 'glitch' }, d: 90 },
  { f: { type: 'glitch' }, d: 90 },
  { f: { type: 'plus' }, d: 1400 },   // held like the favicon's "404"
  { f: { type: 'still' }, d: 0 },     // back to the green/red SP
];

// kept for anything that just wants the still icon
function spaddDrawIcon(ctx, s, accent) { spaddDrawFrame(ctx, s, { type: 'still' }, accent); }
