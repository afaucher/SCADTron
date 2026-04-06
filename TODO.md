# SCADTron — Feature Wish List

## Rendering & Export
- [ ] **3MF / Multi-color support** — Wait for `openscad-playground` to compile with `libzip`, or build a custom WASM with 3MF enabled
- [ ] **Binary STL export** — Currently exporting ASCII STL; binary is ~5x smaller for large models
- [ ] **Geometry repair hints** — When a 2-manifold error occurs, suggest specific fixes (epsilon overlaps, `hull()`, etc.)

## Editor
- [x] **OpenSCAD syntax highlighting** — Replace `cpp` language mode with a proper OpenSCAD grammar for Monaco
- [ ] **Auto-complete for OpenSCAD builtins** — `cube`, `sphere`, `translate`, `difference`, etc.
- [ ] **Inline error markers** — Map OpenSCAD line-number errors back to red squiggles in the editor
- [ ] **Multiple file tabs** — Support `use <...>` and `include <...>` with a tabbed editor

## Persistence & Files
- [ ] **IndexedDB storage** — More robust than localStorage, supports larger payloads
- [ ] **Project system** — Save/load multiple named projects, not just one slot
- [ ] **Auto-save with undo history** — Periodic saves with ability to restore prior versions
- [ ] **Import STL as reference** — Load an existing STL to overlay/compare against the generated model

## 3D Viewer
- [ ] **Measurement tool** — Click two points to measure distance
- [ ] **Cross-section view** — Slice the model along a plane to inspect internal geometry
- [ ] **Wireframe toggle** — Show mesh wireframe overlay
- [ ] **Dark/light theme toggle** — Switch viewer background between dark and light

## AI Assistant
- [ ] **BYOK (Bring Your Own Key)** — Let users enter their own Gemini API key in the UI so the app works without a `.env.local` file (store in localStorage, never send to any server)
- [ ] **Conversation persistence** — Save/load chat history alongside the project
- [ ] **Library awareness** — Teach the AI about popular OpenSCAD libraries (BOSL2, MCAD, etc.)
- [ ] **Iterative refinement** — AI can see the rendered model screenshot and suggest improvements automatically
- [ ] **Voice input** — Speak design changes instead of typing

## Infrastructure
- [ ] **Deploy to GitHub Pages / Firebase Hosting** — One-click public deployment
- [ ] **PWA support** — Installable as a desktop app with offline capability
- [ ] **Performance benchmarks** — Track render times across different model complexities
