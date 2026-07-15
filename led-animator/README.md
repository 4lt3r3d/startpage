# LED Matrix Animator

Standalone LED-matrix animation editor for the startpage project.
Lives at `4lt3r3d.github.io/startpage/led-animator/`.

Based on the open-source [led_matrix_animator](https://github.com/dsalaj/led_matrix_animator)
(MIT). Extended with an easy custom-font system.

## What it does

Full editor for designing LED dot-matrix animations:

- **Layers** — stack text, rain, and glitch layers
- **Text modes** — scroll, bounce, pulse, static, typewriter, sequence
- **Rain** — matrix rain with head/trail colors, density, trail length, kana/latin charsets
- **Glitch** — noise, scanline, block, chromatic
- **Timeline** — FPS + loop duration controls
- **Matrix sizing** — set the dot-grid resolution
- **Export** — animated GIF (indexed color for authentic LED look)
- **Share** — full state serialized into the URL hash

## Using it with the startpage

1. Design your animation here in the editor.
2. Click **EXPORT GIF** — saves a looping `.gif`.
3. In the startpage: clock panel → viz button → **custom** tab →
   upload that GIF (or host it and paste the URL).
4. It becomes your looping clock-panel background.

Because this lives in the same repo/domain as the startpage, a GIF hosted
here can be referenced by the startpage with no cross-origin issues.

## Adding your own fonts

1. Drop the font file (`.ttf`, `.otf`, `.woff`, `.woff2`) into the `fonts/` folder.
2. Open `index.html`, find the `CUSTOM_FONTS` array near the top of the `<script>`.
3. Add one line:

   ```js
   { family: 'MyFont', label: 'My Font', file: 'MyFont.ttf' },
   ```

   - `family` — the CSS name you reference
   - `label`  — what shows in the Font dropdown
   - `file`   — the filename inside `fonts/`

The `@font-face` rule and the dropdown entry are generated automatically —
no other edits needed. The font then appears in every text layer's Font menu.

## Files

```
led-animator/
├── index.html     the editor
├── fonts/         put your .ttf/.otf files here
│   └── Predator-nLgM.ttf   (add this — see below)
└── README.md
```

## One thing to add

The **Predator** font file isn't included here (it ships with the original
project). Download `Predator-nLgM.ttf` and place it in `fonts/`, or just remove
the Predator line from `CUSTOM_FONTS` if you don't want it. Everything else
works without it.
