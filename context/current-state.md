# DreamSmile AI — Current State

> **Last Updated:** 2026-07-09T19:30 IST

## Active Task: None (Stable Maintenance & Monitoring)
- **Goal:** Monitor dev server stability and ensure dental generation quality remains high.

## Previous Task: Ectopic Canine Alignment & Teeth Length Optimization
**Phase:** COMPLETED, VERIFIED & STABILIZED
- **Goal:** Resolve quality issues where high ectopic canines (fangs) are not removed and lower teeth biting edges are clipped/shortened.
- **Fix:**
  - Implemented dynamic bounding box calculation using `outerH` to measure total mouth height.
  - Multiplied scaling metrics by `effectiveH = Math.max(innerH, outerH * 0.45)` to prevent mouth mask collapse.
  - Increased center-band vertical radius to `Math.max(15, innerH * 1.35, outerH * 0.55)` to fully enclose fangs and gum heights.
  - Refined prompts in `lib/gradioAdapter.ts` to request perfectly aligned veneers and remove geometry preservation constraints.
  - Eroded mask by 2px and applied Gaussian blur (2.5) post-inpainting to prevent edge ghosting.

**Phase:** COMPLETED, VERIFIED & STABILIZED

### Active Setup
- **Primary Model Pipeline:** `black-forest-labs/FLUX.1-Fill-dev` deployed on Modal serverless cloud.
- **Production Endpoint:** `https://harunshaikh270599--dreamsmile-flux-fluxinpaint-inpaint.modal.run`
- **Fallback Candidate:** `diffusers/stable-diffusion-xl-inpainting` (Hugging Face Space via `@gradio/client`).
- **Inference Mode:** Native full-image inpainting (bypassing brittle local crop/paste/blending code to prevent boundary seams).
- **Billing & Resource State:** 
  - Active Plan: Starter Plan ($5.00 monthly compute credits, no card attached).
  - Billing Cycle: June 1 – July 1, 2026.
  - Active Usage: $3.31 spent, leaving exactly **$1.69** remaining.
  - Test Margin: ~65–80 remaining test runs based on A10G GPU unit costs ($0.015–$0.025 per run).

### Status Checklist
- ✅ `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET` set in `.env.local`
- ✅ Model weights pre-cached in docker image build to save cold-start latency ($)
- ✅ Modal class `FluxInpaint` deployed with sequential CPU offloading for VRAM optimization on A10G GPU
- ✅ Native inpainting pipeline implemented in `lib/gradioAdapter.ts` (resized full-image/mask inference)
- ✅ Input transparent mask flattened onto black background for model compatibility
- ✅ E2E API Verification completed successfully using native full-image inpainting (took 3.0min on cold start)
- ✅ Styling variants (`hollywood`, `natural`, `ivory`) fully supported under the new native pipeline
- ✅ DNS lookup interceptor configured to force IPv4 (`{ family: 4 }`) for `.modal.run` domains to mitigate NAT64/IPv6 fetch timeout issues
- ✅ Closeup Mask Fallback Corrected: Verified that mouth-only dynamic masking correctly selects and returns the optimal detected teeth area candidate (`best.dataUrl`) instead of defaulting to a static central ellipse override.
- ✅ Teeth Mask Cleanup Optimization: Replaced aggressive gum/lip erasure logic in `applyLipSafeMaskCleanup` with accurate color checks (`isReddish`, `toothLike`, `cavityLike`) to prevent "piranha teeth" (jagged contours) and preserve gums while cleanly erasing lip overlap. Updated coverage thresholds and enabled adapted masks in inpainting.

### Resolved Issues
- **Mouth Boundary Seams and "White Ice" Artifacts — RESOLVED**
  - **Symptom:** The previous local crop, mask-dilation/erosion, feathering, and blending heuristics in `pasteMaskedRoiBack` resulted in noticeable boundary seams, box outlines, and incorrect colors around the lips/mouth.
  - **Root Cause:** Blending cropped ROIs back onto original face images under local heuristics is extremely sensitive to micro-variations in dimensions, colors, and lighting.
  - **Fix:** Bypassed local crop/paste/blending logic entirely. Resized full image/mask to a max of 1024px (snapped to multiples of 8), fed directly to FLUX.1 Fill. Post-processing blending (`compositeInpaintedResult`) on the server was also bypassed; we now scale the model's direct output back to the original dimensions to preserve absolute fidelity.

- **Zero-Change Composite Output (Blending Bug) — RESOLVED**
  - **Fix:** Kept raw mask buffers strictly 1-channel by chaining `.greyscale()` before `.raw()`. Server-side compositing is now bypassed entirely, ensuring the raw generated veneers show perfectly.

- **Modal Domain ETIMEDOUT / Fetch Failed (DNS NAT64 Resolution) — RESOLVED**
  - **Fix:** Custom Node.js process-level DNS lookup override forcing IPv4 resolution for `.modal.run`.

- **Mouth-only Fallback Mask Resolution Override (Zero Change on Closeups) — RESOLVED**
  - **Symptom:** Generating veneers on close-up photos resulted in the original image being returned with zero changes.
  - **Root Cause:** `buildFallbackMouthMask` erroneously returned `buildSafeCentralDentalMask(...) ?? best.dataUrl`. Since `buildSafeCentralDentalMask` always returned a valid static central ellipse mask (~1.42% coverage) rather than `null`, the dynamically scanned mouth mask (`best.dataUrl`, ~29.61% coverage) was completely overridden and ignored. The tiny static mask did not cover the teeth, causing the inpainting model to make zero visual modifications.
  - **Fix:** Modified `utils/masking.ts` to return `best.dataUrl` directly from the fallback routine. This successfully routes the ~29% coverage dynamic mouth mask to the serverless FLUX model, resulting in high-quality veneer generation.

- **Piranha Teeth and Aggressive Gum Deletions — RESOLVED**
  - **Symptom:** AI-generated teeth appeared jagged, pointed, or cut off ("piranha teeth"), and natural gums were aggressively erased during mask processing.
  - **Root Cause:** The `applyLipSafeMaskCleanup` logic used rough chroma checks (`chr > 55`) that misclassified gums and teeth edges as lips, deleting them from the mask. Reverting occurred due to an aggressive 30% survival threshold, and the 0.24 blur sigma was below sharp's warning limit. Additionally, `adaptMaskForAnalysis`'s output was not being piped to the inpainting model, and closeups were rejected due to a low 38% maximum coverage cap.
  - **Fix:** Refined color classification (`isReddish`, `toothLike`, `cavityLike`), lowered survival limit to 0.05, and bumped blur sigma to 0.3. Raised closeup coverage caps (to 80% for `teeth_only` / 50% for `mouth_closeup`) and ensured `adaptMaskForAnalysis`'s output is passed to the inpainting model inside `generateVeneerImage`.

### Current Files Status
- **`lib/gradioAdapter.ts`** — Updated prompts for veneer alignment, added 2px mask erosion, 2.5 sigma Gaussian blur, and luminance boundary matching.
- **`utils/masking.ts`** — Implemented `effectiveH` scaling, outer mouth bounding box tracking, and expanded center-band clamps.
- **`eslint.config.mjs`** — Configured global ignores for helper scripts and scratch directory.
- **`modal_flux_deploy.py`** — Deployed and running serverless FLUX.1 Fill inpainting on Modal.
- **`context/decisions.md`** — Finalized ADR-013 and added ADR-014.
- **`context/known-issues.md`** — Moved teeth alignment issue to resolved.



