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
