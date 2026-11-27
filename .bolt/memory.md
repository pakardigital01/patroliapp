# Project memory

## Product intent & audience

- Vite + React project; full-featured, production-worthy web pages expected.
- Specific product/domain not yet defined — no feature requests beyond setup so far.

## Brand personality & voice

- Prefers beautiful, non-cookie-cutter designs (see `.bolt/prompt` for full styling authority).
- No brand identity, copy tone, or naming established yet.

## Visual design & UX direction

- Styling via Tailwind CSS; icons via lucide-react — no extra UI/icon packages (per `.bolt/prompt`).
- Path alias `@/` → `src/` for imports.
- No concrete visual system (colors, typography, layout patterns) inferred yet.

## Decisions, constraints & rationale

- Stack: Vite + React (JSX, React hooks, Tailwind, lucide-react).
- Dependencies installed; `vite build` passes with minor warnings (bundle size, third-party code comments) — non-blocking.
- Reported package vulnerabilities exist in dev tooling; not blocking; upgrade optional and unconfirmed.
- Dev server runs automatically in Bolt; manual start not required/possible.

## Open questions & assumptions

- App purpose, content, and target users still unknown.
- Whether to upgrade packages to address vulnerabilities — pending user decision.
- No accessibility, responsive, or component-pattern requirements specified yet.