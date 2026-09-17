# The Antigravity Architect: System Directives

## 1. The 3-Layer Mandate
All operations must strictly adhere to the following architectural stratification:

### L1: Directives (Strategy)
- **Role:** High-level decision making, system constraints, aesthetic vision, and architectural patterns.
- **Location:** `AGENTS.md`, `implementation_plan.md`
- **Output:** Clear, bounded instructions for L2 and L3.

### L2: Orchestration (Tactics)
- **Role:** Connecting components, deployment pipelines, asset optimization, and state management.
- **Location:** `deploy.sh`, scripts/
- **Output:** Deterministic command sequences.

### L3: Execution (Physics)
- **Role:** The metal. Running code, DOM manipulation, styling, assets, Cloudflare Pages hosting.
- **Location:** `index.html`, `portrait.jpg`, `favicon.svg`, `robots.txt`, `sitemap.xml`
- **Constraint:** Vanilla, ultra-fast, zero-runtime bloat, 100 Lighthouse performance, accessible (a11y).

---

## 2. Aesthetic & Design System (Vibe: Dark / Techy / Code-Centric / AI-Powered)

### Core Theme
- **Background:** Deep dark cyber/terminal space (`#080C10`, `#0D1117`, `#161B22`, `#0F172A`).
- **Gradients & Glows:** Radiant neon cyan (`#00E5FF`), AI matrix emerald (`#00F5A0`), electric violet/indigo (`#818CF8`, `#6366F1`), terminal amber (`#F59E0B`).
- **Typography:**
  - Code & System Elements: JetBrains Mono / Fira Code / Geist Mono / monospace font stacks.
  - Headings & Accents: High-impact modern geometric sans (`Plus Jakarta Sans`, `Inter`, `Space Grotesk`) paired with tech monospace badges.
- **Visual Vocabulary:**
  - Interactive simulated CLI / Terminal prompt (`$ ishaan run agent --mode=autonomous`).
  - Tech metadata overlays: CPU / latency / status indicators (`● SYSTEM ONLINE`, `PUNE // NODE_01`, `STACK: LOCAL_AI + WORKERS`).
  - Code syntax cards, cyber grid lines, subtle CRT scanlines / glowing edge accents.
  - Sleek glassmorphism with backdrop filters and fine border glows (`border: 1px solid rgba(0, 229, 255, 0.15)`).

### Portrait Framing & Alignment Standard
- **Alignment:** Portrait image (`portrait.jpg`) features Ishaan on a mountain overlooking Pune with a victory sign.
- **Framing:** Must not use distorted organic blob clipping or arbitrary rotation.
- **Aspect Ratio:** Modern portrait tech card (4:5 or 3:4 aspect ratio).
- **Positioning:** Precision `object-position: center 68%` or calibrated focus to highlight the subject, arms, gesture, and Pune city panorama.
- **HUD Encapsulation:** Tech card border with corner targeting reticles (`[ + ]`), glowing status badge, coordinate tags (`PUNE_18.5204°N_73.8567°E`), and subtle interactive 3D tilt / glow.

---

## 3. Engineering & Performance Standards
- **Performance:** 100% Google Lighthouse score target. Minimal TTI (<100ms).
- **SEO & AEO:** Schema.org JSON-LD Person & WebSite metadata, OpenGraph, Twitter Cards, semantic HTML5 (`<header>`, `<main>`, `<section>`, `<article>`, `<footer>`).
- **Zero Bloat:** Vanilla HTML/CSS/JS or lightweight vanilla modules without heavy external framework baggage.
- **Accessibility:** WCAG AA compliance, proper ARIA labels, skip links, keyboard navigation focus indicators, `prefers-reduced-motion` fallbacks.

---

## 4. Deployment
- Target: Cloudflare Pages (`ishaan.pages.dev` / `ishaan-dalvi.pages.dev`).
- Automation: `./deploy.sh`.

*Code Over Conversation.*
