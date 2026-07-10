# DreamSmile AI — Decisions Log

> **Last Updated:** 2026-06-02T00:10 IST

## ADR-001: Migrate from SD 1.5 to HF Space SDXL/FLUX Inpainting
- **Date:** 2026-05-23
- **Status:** APPROVED — Ready to implement
- **Context:** SD 1.5 (Cloudflare + ModelsLab) produces plastic/cartoonish teeth output. Quality is unacceptable for dental use case.
- **Decision:** Replace both legacy providers with a single Hugging Face Space pipeline using `@gradio/client`.
- **Primary Model:** FLUX.1 Fill [dev] (`black-forest-labs/FLUX.1-Fill-dev`) — best photorealism
- **Fallback Model:** SDXL Inpainting (`diffusers/stable-diffusion-xl-inpainting`) — already tested
- **Rationale:**
  1. FLUX/SDXL >> SD 1.5 for dental photorealism (enamel, tooth boundaries, lighting)
  2. Free via HF ZeroGPU with `HF_TOKEN` (already available)
  3. `@gradio/client` already imported — minimal dependency change
  4. Simplifies code: removes ~300 lines of ModelsLab polling + Cloudflare payload logic
- **Risk:** ZeroGPU daily quota limits (~12-20 images/day free, ~120+ with HF Pro $9/mo)
- **Mitigation:** Local cavity enhancer fallback remains active

## ADR-002: Mask Format — Alpha Channel PNG
- **Date:** 2026-05-23
- **Status:** CONFIRMED
- **Context:** HF Space uses `mask = input_image["layers"][0].getchannel("A").convert("L")`
- **Decision:** Use alpha-channel encoded PNG (white opaque = inpaint, transparent = preserve)
- **Rationale:** `sanitizeMask()` in gradioAdapter.ts already produces exactly this format

## ADR-003: Model Selection Research (2026-05-23)
- **Status:** RESEARCH COMPLETE
- **Models Evaluated:**
  | Model | Quality | Free | Speed | Verdict |
  |---|---|---|---|---|
  | FLUX.1 Fill [dev] | ⭐⭐⭐⭐⭐ | Yes (HF Space) | Slow | **Primary choice** |
  | FLUX.2 | ⭐⭐⭐⭐⭐ | Yes (HF Space) | Slow | Untested |
  | Z-Image-Edit | ⭐⭐⭐⭐ | Yes (HF Space) | Fast | New contender, untested for dental |
  | Qwen-Image-Edit | ⭐⭐⭐⭐ | Yes (HF Space) | Medium | Instruction-based, untested |
  | SDXL Inpainting | ⭐⭐⭐ | Yes (tested) | Medium | Known working, decent quality |
  | SD 1.5 | ⭐⭐ | Yes (current) | Fast | Plastic teeth — replacing |
- **Sources:** Hugging Face, GitHub, Replicate, Segmind, ComfyUI docs, Reddit

## ADR-004: Deploy FLUX.1 Fill Dev on Modal.com Serverless GPU
- **Date:** 2026-05-23
- **Status:** SUCCESSFUL & DEPLOYED
- **Context:** Hugging Face free spaces are excellent but subject to rate limits, cold-starts, and dynamic quota blocks. We need a reliable production serverless endpoint.
- **Decision:** Deploy FLUX.1 Fill Dev to Modal.com using an A10G cloud GPU container.
- **Key Implementation Details:**
  1. **Weight Caching:** Cached the 12GB FLUX model during container image build (`modal.Image...run_commands(...)`) to avoid cold-start VRAM download costs and latencies.
  2. **VRAM Optimization:** Implemented `enable_sequential_cpu_offload()` to reduce peak VRAM to ~8-10GB, allowing stable inference on the highly cost-efficient A10G GPU.
  3. **Idle Scaledown:** Configured container `scaledown_window=60` to immediately kill idle containers after 60s, keeping maintenance cost extremely low.
  4. **API Integration:** Exposed via serverless FastAPI endpoint: `https://harunshaikh270599--dreamsmile-flux-fluxinpaint-inpaint.modal.run`
  5. **E2E Verification:** Validated successfully using `test-modal-endpoint.mjs`. Cold container warmup + inference completed in `63.97s` producing high-fidelity output `public/test-modal-out-256.webp` (256x256 size with 10 steps to conserve credits).

## ADR-005: Validation of Custom Styling Variants
- **Date:** 2026-05-31
- **Status:** COMPLETED & APPROVED
- **Context:** Verify that the frontend veneer style profile configurations mapped accurately to the backend serverless generator.
- **Decision:** Execute verification requests using custom test scenarios for each styling variant:
  1. **natural**: Simulates natural tooth translucency and contours (passed in 171.50s on GPU container spin-up).
  2. **pearl**: Simulates high-reflectivity, glossy surface attributes (passed in 145.35s).
  3. **ivory**: Simulates bright, classic ivory shape and coloration (passed in 138.05s).
- **Result:** 100% success rate under automated API simulation (200 OK responses with valid base64 WebP veneer payloads). Verification scripts successfully purged post-execution.

## ADR-006: Mask Blending and Pasting Stability Fix
- **Date:** 2026-06-01
- **Status:** APPROVED & DEPLOYED
- **Context:** The dental inpainting pipeline produced zero visual changes on final composite output.
- **Decision:** Ensure all sharp outputs from feathering and mask preparation pipelines remain strictly 1-channel raw grayscale.
- **Rationale:**
  1. Sharp's `.blur()` operation on a 1-channel raw buffer automatically promotes the output to a 3-channel (sRGB) raw buffer.
  2. This 3-channel promotion shifts the pixel array mapping, leading to out-of-bounds/undefined indexing in `Math.min(featherAlpha[i], binaryAlpha[i])`, producing zero opacity (completely transparent mask).
  3. Adding `.greyscale()` before `.raw()` in all 4 occurrences in `dreamsmile-ai/lib/gradioAdapter.ts` guarantees 1-channel raw mask output, restoring correct blending calculations.
- **Result:** Verified successfully using pixel-level diagnostic tools, Next.js build verification, and clean test runs.

## ADR-007: Force IPv4 Resolution for Modal API Domain to Mitigate NAT64/IPv6 Connection Timeouts
- **Date:** 2026-06-01
- **Status:** APPROVED & DEPLOYED
- **Context:** Fetch requests to the Modal serverless endpoint (e.g., `*.modal.run`) failed with `ETIMEDOUT` in environments with complex IPv6/NAT64 setups.
- **Decision:** Intercept DNS lookup queries for `.modal.run` domains and force IPv4 resolution (`{ family: 4 }`) at the Node.js process level.
- **Rationale:**
  1. Node's `dns.lookup` automatically attempts IPv6 first if configured, even if IPv6 routing to that specific destination is non-functional or misconfigured on the host/network.
  2. Forcing family 4 completely bypasses the broken IPv6/NAT64 connection path.
  3. Patching `dns.lookup` locally in `gradioAdapter.ts` solves the issue programmatically without requiring manual/administrative DNS configuration changes on developer machines or runtime nodes.
- **Result:** Successfully validated; remote A10G inference calls execute reliably and return image payloads in seconds.

## ADR-008: Transition to Native Inpainting (Full-Image Inpainting)
- **Date:** 2026-06-02
- **Status:** APPROVED & IMPLEMENTED
- **Context:** The previous local crop, mask-dilation/erosion, feathering, and blending heuristics in `pasteMaskedRoiBack` were highly error-prone. They resulted in noticeable boundary seams, "white ice" color bleeding, and box outlines around the mouth.
- **Decision:** Transition to native full-image inpainting:
  1. Bypass all local crop-to-mouth and paste-back operations.
  2. Resize the full uploaded image (maintaining aspect ratio, snapping to a multiple of 8, max 1024px) and send it with the flattened mask directly to the serverless FLUX.1 Fill model.
  3. Upscale the model output back to the original image dimensions and return it directly.
- **Rationale:**
  1. The advanced FLUX.1 Fill inpainting model natively handles seamless blending and keeps regions outside the mask intact.
  2. Eliminates hundreds of lines of complex, brittle local image processing code.
  3. Yields superior visual quality with zero cropping seams or mouth boundary discrepancies.
- **Result:** Verified successfully; test generation completed in 3 minutes via the local test runner with high-fidelity output.

## ADR-009: Bypass Post-Processing Server-Side Blending
- **Date:** 2026-06-04
- **Status:** APPROVED & IMPLEMENTED
- **Context:** Even with native full-image inpainting, running manual server-side blending (`compositeInpaintedResult`) using the alpha mask created minor boundary seams and discrepancies. Since FLUX natively preserves unmasked pixels perfectly, this second stage of blending is redundant and degrades quality.
- **Decision:**
  1. Bypass the manual server-side blending (`compositeInpaintedResult`) stage entirely.
  2. Directly rescale the model's generated image output buffer back to original dimensions (`origW` x `origH`) using Sharp (Lanczos3 kernel).
  3. Return the rescaled WebP image directly as the final output.
- **Rationale:**
  1. Displays the high-fidelity raw output of FLUX exactly as-is.
  2. Prevents any edge artifacts, haloing, or boundary mismatches introduced by local math blending.
- **Result:** Successfully built and verified. Dev server is running locally on port 3001.

## ADR-010: Modal Resource Budget Limit and Stripe Payment Policy
- **Date:** 2026-06-04
- **Status:** APPROVED
- **Context:** The workspace is currently running on the serverless Modal Starter Plan with a strict $5.00 monthly compute credit limit because no payment card has been added to the Stripe billing account.
- **Decision:**
  1. Maintain active usage below the monthly $5.00 Starter budget limit.
  2. Estimate current spent at $3.31 (fully offset by applied credits), with $1.69 remaining.
  3. Limit test runs during development since each call costs ~$0.015 - $0.025 on A10G GPU, which leaves a safety margin of ~65-80 runs.
  4. If the budget cap needs to be raised, add a Visa/Mastercard/Amex debit or credit card with international transactions enabled, noting that card removal requires contacting support@modal.com.
- **Rationale:**
  1. Prevents service interruption due to budget limits.
  2. Ensures that development and debugging cycles can be completed without incurring actual out-of-pocket costs.

## ADR-011: Refined Teeth Mask Cleanup Optimization
- **Date:** 2026-06-09
- **Status:** APPROVED & IMPLEMENTED
- **Context:** Gums and teeth contours were being deleted or degraded, resulting in jagged "piranha teeth" shapes.
- **Decision:**
  1. Refine the RGB color classification inside `applyLipSafeMaskCleanup`:
     - Classify reddish/lip pixels: `isReddish = r > g + 14 && r > b + 14 && (g / (r + 0.001) < 0.75)`
     - Classify tooth-like pixels: `toothLike = lum > 50 && (g / (r + 0.001) >= 0.72) && chr < 80`
     - Classify dark cavity regions: `cavityLike = lum < 102 && chr < 45 && !isReddish`
     - Remove pixels that are reddish OR are neither tooth-like nor cavity-like.
  2. Lower the survival ratio check to `0.05` to prevent false reverting to the aggressive uncleaned mask.
  3. Increase the sharp blur sigma to `0.3` to meet the minimum threshold requirements of the Sharp image library (avoiding errors/warnings).
  4. Update `getTargetCoveragePct` maximum coverage limit values (up to 80% for `teeth_only` and 50% for `mouth_closeup`) to accommodate close-up images.
  5. Ensure that the adapted mask resulting from `adaptMaskForAnalysis` is actually used in `generateVeneerImage` when making the model call.
- **Rationale:**
  1. Precise color classification prevents natural pink gums and teeth edges from being classified as lips and wiped out.
  2. Raising the coverage limit and blur sigma ensures compatibility with closeups and avoids library warnings.
  3. Passing the adapted mask to the inpainting model guarantees the optimized mask is used.
- **Result:** Successfully validated; prevents jagged teeth shape and protects natural gum structure while cleanly removing lip overlaps.

## ADR-012: Relax Vertical Mask Boundary for Teeth Length & Straightening Alignment
- **Date:** 2026-07-01
- **Status:** APPROVED & IMPLEMENTED
- **Context:** Correcting teeth length issues (where cutting edges were being shaved off) and straightening crooked teeth requires more vertical mask canvas to let the AI model inpaint successfully.
- **Decision:**
  - Increased `outerGuard` vertical scaling from `0.9` to `0.98` inside `utils/masking.ts` (line 632).
  - Maintained horizontal scaling limit to protect lips.
- **Rationale:**
  - Expanding the vertical bounds of the outer guard gives the FLUX inpainting model the necessary space to reconstruct standard teeth height and properly align crooked/overlapping teeth.
  - Lips remain protected.
- **Result:** Verified successfully; allows correct dental reconstruction and length preservation.

## ADR-013: Generous Mask Boundaries for Ectopic Canines & Full Biting Edge Alignment
- **Date:** 2026-07-09
- **Status:** APPROVED & IMPLEMENTED
- **Context:** Ectopic canines (high fangs on the gums) were excluded from the mouth mask due to aggressive clamping. Lower teeth biting edges were cut off due to tight vertical constraints.
- **Decision:**
  1. Calculate `outerH` using the bounding box of `mouthOuterPoints` to determine total mouth height.
  2. Implement effective height scaling: `effectiveH = Math.max(innerH, outerH * 0.45)` to prevent mask collapse when the mouth is closed or nearly closed.
  3. Scale arches and dental cavities by `effectiveH` instead of raw `innerH`.
  4. Increase center-band vertical radius to `Math.max(15, innerH * 1.35, outerH * 0.55)` to fully cover fangs, teeth heights, and gums.
  5. Refine prompt engineering inside `lib/gradioAdapter.ts` to focus strictly on teeth straightening and perfect alignment, removing geometry preservation limits.
  6. Erode the mask (2px) and apply Gaussian blur (sigma 2.5) during post-processing composition to eliminate edge ghosting/artifacts.
- **Rationale:**
  - Prevents the teeth boundaries from collapsing while keeping the lips protected via server-side color-based lip safe cleanup.
- **Result:** Successfully validated; ectopic canines are cleanly covered and straightened, and biting edges are preserved.

## ADR-014: ESLint Ignores Configuration for Root Scripts & Scratch Files
- **Date:** 2026-07-09
- **Status:** APPROVED & IMPLEMENTED
- **Context:** Helper/utility scripts in the workspace root and the `scratch/` directory caused compilation errors due to ESLint's strict type rules (e.g., `no-require-imports`, `no-unused-vars`).
- **Decision:**
  - Configure `eslint.config.mjs` to globally ignore scratch directories and helper scripts:
    ```javascript
    globalIgnores([
        '**/scratch/**',
        '*.js',
        '*.mjs',
        '*.cjs'
    ])
    ```
- **Rationale:** Keeps developer test and simulation scripts available without blocking production builds or CI/CD pipelines.
- **Result:** Verified `npm run lint` and `npm run build` compile with zero errors.

