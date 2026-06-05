# Dreamsmile AI — Codex Context

> **Last Updated:** 2026-05-23T12:36 IST
> **Full context:** See `/context/` directory for detailed docs.

## Project
- **Path:** /home/harun/block/dreamsmile-ai
- **Stack:** Next.js 16.1.6, React 19, TypeScript, Tailwind CSS v4, sharp, @gradio/client
- **Purpose:** Photorealistic dental inpainting for smile design (veneers, whitening, straightening)

## Current Task
**Migrating image pipeline from SD 1.5 → FLUX.1 Fill / SDXL via Hugging Face Space**
- Status: APPROVED, READY TO IMPLEMENT
- Target file: `lib/gradioAdapter.ts`
- Plan artifact: See `/context/decisions.md` (ADR-001)

## Key Files
- `lib/gradioAdapter.ts` — Main inpainting pipeline (2433 lines)
- `services/imageService.ts` — Caller service
- `test-definitive.mjs` — Working HF Space test (SDXL, generates 2 images successfully)
- `.env.local` — API keys (HF_TOKEN, Replicate, Cloudflare, ModelsLab, Segmind)

## Context Directory (`/context/`)
- `current-state.md` — Active task and next steps
- `architecture.md` — Pipeline flow, analysis modes, providers
- `decisions.md` — ADRs and model selection research
- `known-issues.md` — Active bugs and resolved issues

## MemPalace Wing
- Wing: `dreamsmile_ai` (5 drawers)
- Rooms: `decisions`, `architecture`
