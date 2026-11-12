# Lightship Marigold

A toy first-person shooter played on the inside of a 1960s pinball table, at the scale of a ball.

**Play it in the browser: https://gaborballa.github.io/lightship-marigold/**

- W A S D walks, the mouse looks. The first click takes the pointer, Esc gives it back.
- You can also look with a right-button drag or the arrow keys.
- Hold the left button to pull the spring, release to fire a steel ball.
- Knock down the three banks of drop targets to light L-I-G-H-T-S-H-I-P, then walk into the special hole at the top.
- Keep clear of the big chrome table ball: it costs one of your three credits.
- R restarts. Sound is off until you press "Enable sound".

Useful links: `?auto=1` lets a bot play the whole level, `?state=a1|a2|a3|end` starts at an area, `?view=top` shows the table from above.

## Run it on your own computer

The game needs a web server (opening `index.html` as a file shows a black screen).

- macOS: double-click `play.command`.
- Anywhere with Python: `python3 -m http.server 8000`, then open http://localhost:8000/

## How it is made

three.js (bundled in `game/lib`), light baked in Blender Cycles for two lamp states, printed art drawn with canvas, all sound made with WebAudio. The page loads nothing from the network. The scripts in `gen/` rebuild the layout, the art and the bake, and run the tests.
