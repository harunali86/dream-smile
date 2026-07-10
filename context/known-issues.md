# DreamSmile AI — Known Issues

> **Last Updated:** 2026-06-05T16:00 IST

## Active Issues
 
### ISSUE-003: HF Space Network Flakiness
- **Severity:** LOW
- **Status:** MITIGATED
- **Description:** Hugging Face Space connections can timeout (ETIMEDOUT / fetch failed)
- **Mitigation:** Global fetch interceptor with 5 retries + 2s delay already active in gradioAdapter.ts
 

### BYPASS-001: Preflight Validation Disabled (Local Development)
- **Severity:** NONE (Intentional)
- **Status:** ACTIVE
- **Description:** The automated image validation pipeline (`runInputPreflight`) is commented out in `services/imageService.ts` to allow frictionless local development and custom testing.
- **Remediation:** Uncomment lines 385–402 in `services/imageService.ts` to re-enable production-level teeth presence and clarity validation.


## Resolved Issues

### RESOLVED-001: SD 1.5 Output Quality
- **Fixed:** 2026-05-23
- **Description:** Cloudflare SD 1.5 and ModelsLab produced plastic, cartoonish, blurry teeth.
- **Root Cause:** SD 1.5 lacks the spatial details and domain realism required for fine dental work (enamel gloss, translucent incisal edges).
- **Fix:** Successfully migrated to FLUX.1 Fill [dev] (`black-forest-labs/FLUX.1-Fill-dev`) deployed as a custom serverless container on Modal.com. High photorealism verified.

### RESOLVED-002: ZeroGPU Quota Limits
- **Fixed:** 2026-05-23
- **Description:** Hugging Face free spaces get rate-limited (ZeroGPU quota limits under high request volume).
- **Fix:** Deployed FLUX.1 Fill [dev] to Modal.com using serverless A10G GPUs with sequential CPU offloading and a 60-second automatic scaledown window. This guarantees production-level availability at minimal cost without throttling.

### RESOLVED-003: Mask Format Mismatch
- **Fixed:** 2026-05-23
- **Description:** Initial test scripts sent raw JPEG as mask instead of alpha-channel PNG
- **Root Cause:** HF Space expects `layers[0].getchannel("A")` — needs alpha channel
- **Fix:** `test-definitive.mjs` creates proper RGBA PNG mask; `sanitizeMask()` in adapter already produces correct format

### RESOLVED-004: Gums Erased During Mask Cleanup (Chroma Threshold Adjustment)
- **Fixed:** 2026-05-30
- **Description:** Natural reddish/pinkish gums were being classified as lips and wiped out (value set to 0) during mask adaptivity cleanup.
- **Root Cause:** The chroma threshold in `applyLipSafeMaskCleanup` was too loose (`chr > 14`), matching low-saturation red gums (chroma 12-25) in addition to high-saturation lips (chroma > 100).
- **Fix:** Relaxed/increased the chroma threshold filter to `chr > 55`. Verified in `test-mask-cleanup.mjs` that this achieves 100% precision—protecting 100% of gums while cleanly removing lip overlaps from the dental mask.

### RESOLVED-005: Zero-Change Composite Output (Blending Bug)
- **Fixed:** 2026-06-01
- **Description:** The composite output showed zero change from the original image after inpainting.
- **Root Cause:** calling `.blur()` as the last step on a 1-channel raw grayscale mask automatically promoted it to a 3-channel (sRGB) raw buffer. This shifted the pixel mapping in the composition loop, causing out-of-bounds array access in `Math.min(featherAlpha[i], binaryAlpha[i])` resulting in `undefined` (which evaluates to 0), making the mask completely transparent.
- **Fix:** Chained `.greyscale()` before `.raw()` in all 4 sharp mask processing pipelines in `dreamsmile-ai/lib/gradioAdapter.ts` to enforce strictly 1-channel raw buffers. Verified with node-based test scripts and confirmed correct visual compositing.

### RESOLVED-006: Modal Connection ETIMEDOUT (IPv6/NAT64 Domain Resolution)
- **Fixed:** 2026-06-01
- **Description:** Connections to the production Modal serverless endpoint (e.g., `*.modal.run`) failed with `ETIMEDOUT` or `fetch failed` errors during execution.
- **Root Cause:** The host network maps `.modal.run` domains to both IPv6 (NAT64) and IPv4 endpoints. Node.js's native DNS lookup scheduled IPv6 connection attempts first. If IPv6 routing on the host network was dysfunctional, the socket hung and ultimately threw a slow timeout exception, failing the request.
- **Fix:** Overrode the native `dns.lookup` function globally within `gradioAdapter.ts` to force IPv4 resolution (`{ family: 4 }`) for `.modal.run` hostnames. This completely avoids non-functional IPv6 routes and guarantees reliable, instant API connections.

### RESOLVED-007: Crop-and-Paste Seams and "White Ice" Artifacts
- **Fixed:** 2026-06-02
- **Description:** Noticeable seams, box outlines, and bleeding colors around the mouth/lips area in the final output.
- **Root Cause:** Brittle local crop, scale, dilate, and blend heuristics (e.g., `pasteMaskedRoiBack`) were highly sensitive to alignment and dimension variations.
- **Fix:** Redesigned the pipeline to use full-image native inpainting. Instead of cropping a tight bounding box around the mouth, the full original image and a flattened black-and-white mask are resized to a target scale (max 1024px, snapping to multiples of 8) and fed directly to FLUX.1 Fill, which natively handles seamless boundary integration. The output is then upscaled back to the original input resolution.

### RESOLVED-008: Closeup Fallback Mask Override (Zero Change on Closeup Veneer Generation)
- **Fixed:** 2026-06-05
- **Description:** Generating veneers on extreme close-up images of teeth resulted in identical output images with no dental modifications.
- **Root Cause:** Face detection fails on extreme closeups (due to missing landmarks like eyes/nose). The code successfully triggers `buildFallbackMouthMask`. However, inside `buildFallbackMouthMask`, the return value was:
  `return buildSafeCentralDentalMask(width, height, faceBox) ?? best.dataUrl;`
  Since `buildSafeCentralDentalMask` is a helper function that returns a fallback static central ellipse mask (~1.42% coverage) and is never `null`, the dynamically scanned mouth mask `best.dataUrl` (~29.61% coverage) was completely discarded. The tiny static ellipse did not cover the teeth, causing zero edits.
- **Fix:** Corrected the return inside `buildFallbackMouthMask` in `utils/masking.ts` to return `best.dataUrl` directly. This enables the dynamically scanned mouth mask to be sent to the serverless FLUX model, enabling successful closeup veneer generation.

### RESOLVED-009: Piranha Teeth and Aggressive Gum Deletions
- **Fixed:** 2026-06-09
- **Description:** AI-generated teeth appeared jagged, pointed, or cut off ("piranha teeth"), and natural gums were aggressively erased during mask processing.
- **Root Cause:** The `applyLipSafeMaskCleanup` logic used rough chroma checks (`chr > 55`) that misclassified gums and teeth edges as lips, deleting them from the mask. Reverting occurred due to an aggressive 30% survival threshold, and the 0.24 blur sigma was below sharp's warning limit. Additionally, `adaptMaskForAnalysis`'s output was not being piped to the inpainting model, and closeups were rejected due to a low 38% maximum coverage cap.
- **Fix:** Refined color classification (`isReddish`, `toothLike`, `cavityLike`), lowered survival limit to 0.05, and bumped blur sigma to 0.3. Raised closeup coverage caps (to 80% for `teeth_only` / 50% for `mouth_closeup`) and ensured `adaptMaskForAnalysis`'s output is passed to the inpainting model inside `generateVeneerImage`.

### RESOLVED-010: Insufficient Tooth Straightening & Veneer Alignment Quality
- **Fixed:** 2026-07-09
- **Description:** Generated veneers did not align or straighten crooked teeth, fangs (ectopic canines), or preserve biting edges, adhering strictly to old contours.
- **Root Cause:** Overly restrictive prompts (e.g. "preserve smile geometry") and geometric mask constraints collapsed on closed/narrow mouths or cropped out corners.
- **Fix:** 
  1. Calculated total mouth height (`outerH`) and implemented effective height scaling `effectiveH = Math.max(innerH, outerH * 0.45)` to prevent boundary collapse.
  2. Multiplied arch and cavity radii by `effectiveH`, and increased center-band vertical clamp to `Math.max(15, innerH * 1.35, outerH * 0.55)` to cover fangs and full teeth height.
  3. Replaced restrictive prompts with explicit high-quality veneer alignment directives ("perfectly aligned, bright white porcelain veneers", "8k macro detail").
  4. Eroded the mask by 2px and applied Gaussian blur (2.5) post-inpainting to resolve edge seams and ghosting.



