# Gatewright

Drag, wire and simulate logic circuits in the browser. Plain HTML/CSS/ES modules — no build step.

- **Parts:** switch, push button, 1 Hz clock, number pad (0–15 → 4 binary bits), AND/OR/XOR/NAND/NOR/XNOR/NOT/BUFFER, lightbulb, hex display
- **Wiring:** drag from a pin to another pin; wires glow green when carrying a 1
- **Persistence:** autosaves to the browser; Save/Open circuit as JSON
- **Export:** schematic as PNG or SVG (white sheet with title block)
- **Controls:** `Del` / right-click removes, scroll zooms, drag empty space pans

## Run locally
```
python3 -m http.server 8000   # then open http://localhost:8000
```
(ES modules need http, not `file://`.)

## Publish on GitHub Pages
1. Push this repo to GitHub.
2. Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)`.
3. Visit `https://<user>.github.io/<repo>/`.
