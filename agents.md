# Agent Instructions & Guidelines

> **IMPORTANT REQUIREMENT FOR ALL AGENTS / COLLABORATORS:**
> Whenever you create, edit, or write files in this repository, you **MUST** update this file (`agents.md`) to reflect your changes, document your actions, and log the latest state of the project.

---

## Agent Operational Rules
1. **Mandatory Documentation Update**:
   - Always update `agents.md` whenever writing or modifying files in this codebase.
   - Record what files were touched, what was changed, and why.
2. **Commit Policy**:
   - Stage and commit only the files you changed with a clear, meaningful commit message.
   - Never push unless explicitly instructed by the user.
   - Update existing commits if working on follow-up changes to the same task.
3. **Safety & Preservation**:
   - Respect concurrent work. Never run commands that overwrite or erase work without verification.
   - Avoid redundant heavy operations (builds/test suites) to conserve compute power.

---

## Activity Log

| Date (ISO) | Agent / Author | Action & Files Modified | Summary of Changes |
| :--- | :--- | :--- | :--- |
| 2026-11-19 | Antigravity | Created `facts.md`, Created `agents.md` | Extracted and documented all facts from `index.html` into `facts.md`. Established `agents.md` with guidelines requiring updates upon file modification. |
| 2026-11-20 | Antigravity | Updated `index.html`, `facts.md`, `agents.md`; Created `llms.txt`, `_headers`, `_redirects`, `robots.txt`, `sitemap.xml` | Implemented Generative Engine Optimization (GEO) and entity verification. Added JSON-LD schema with `sameAs`, bi-directional GitHub/Dalvi links, `/llms.txt` markdown context file, fact-dense neutral copy, and Cloudflare Pages hosting optimizations (security/cache headers, redirects, AI-friendly robots.txt, sitemap). |
| 2026-11-20 | Antigravity | Updated `index.html`, `llms.txt`, `facts.md`, `agents.md` | Anchored commercial work explicitly to legal business entity Dalvi Consultancy across the portfolio hero, footer, Schema.org Organization JSON-LD, and `/llms.txt`. |
| 2026-11-22 | Gemini | Updated `index.html`, `agents.md`; Created `garage-bikes.js` | Made the 3D Food Forest smoothly expand to full screen (`100vw × 100vh`) when fully zoomed in without WebGL framebuffer reallocation. Added a seamless full-width **The Garage** section directly beneath the garden displaying both procedural 3D voxel bikes (**Hero Impulse** and **Kawasaki KLX 230R**) spinning on illuminated turntables inside a single shared `WebGLRenderer`. Added full lazy-loading (on-demand Three.js + `garage-bikes.js` via `IntersectionObserver`), off-screen/hidden render-loop pausing, InstancedMesh batching for 748+ forest terrain/bund meshes, and mobile-adaptive voxel resolution, shadow, and DPR caps. |
| 2026-11-22 | Gemini | Updated `garage-bikes.js`, `index.html`, `agents.md` | Fixed washed-out bike colors in Three.js r128 by converting sRGB hex material/instance colors to linear (`.convertSRGBToLinear()`) and rebalancing garage studio lighting, exposure (`0.96`), and per-material `envMapIntensity`. Upgraded the 3D Food Forest scroll track (`440vh`) to a 3-phase curve: zoom in & expand to full screen (`0–36%`), hold in 1st-person interactive clearing (`36–68%`), and smoothly zoom back out into its framed glass card (`68–100%`) before entering The Garage. |
| 2026-11-22 | Gemini | Updated `garage-bikes.js`, `index.html`, `agents.md` | Combined both spinning bikes (**Hero Impulse** & **Kawasaki KLX 230R**) into a single unified plain-black (`#000000`) 3D room (removing split-screen scissor viewports, cyan rings, and bay dividers). Updated the 3D Food Forest scroll transition to silently swap the sticky backdrop from transparent (blue halftone) to solid `#000000` while at 100% full screen (`rawProgress >= 0.50`), so zooming back out transitions cleanly straight into the plain-black garage without exposing the blue background again. |
| 2026-11-24 | Gemini | Updated `garage-bikes.js`, `index.html`, `agents.md` | Recreated The Garage 3D backdrop as a batched `InstancedMesh` voxel-style motorcycle workshop (interlocking tiled floor, staggered cinder-block back wall, steel I-beams, overhead LED shop lights, red rolling tool chest, pegboard with tools, fuel jerrycan, spare knobby tires, shelving rack with oil bottles & MX helmet, paddock stand, and spinning voxel turntable plinths). Mounted a clickable 3D-wall-anchored **DirtShack.in** logo sign (`https://dirtshack.in`) inside a neon-lime voxel frame with raycast fallback. Locked both bikes (**Hero Impulse** & **Kawasaki KLX 230R**) into mirror-synced opposite-direction rotation via a shared phase for both auto-spin and horizontal drag. |
| 2026-11-24 | Gemini | Updated `garage-bikes.js`, `index.html`, `agents.md`; Created `dirtshack-logo-wide.png` | Fixed floating bikes on the voxel stands via per-instance world-space grounding (`computeInstancedMinY`) + contact shadow decals. Saved the exact full uncropped wide DirtShack logo (`dirtshack-logo-wide.png`, 1371×200) and rendered it as-is across the back garage wall as a clickable wallpaper (`https://dirtshack.in`). Replaced the 2D shrinking-window transition with a real transparent 3D architectural window cutout in the voxel garage back wall (`alpha: true` WebGLRenderer + surround occluders) and a smoothly damped 3D camera backwards dolly (`window.setGaragePullbackProgress`) that pulls directly backwards away from the corner window into the wide garage bay while keeping the live 3D Food Forest permanently visible through the glass. |
