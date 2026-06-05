# DreamSmile AI — Architecture

> **Last Updated:** 2026-05-23T12:36 IST

## Tech Stack
- **Framework:** Next.js 16.1.6, React 19, TypeScript
- **Styling:** Tailwind CSS v4
- **Image Processing:** sharp (server-side)
- **Face Detection:** face-api.js
- **AI Inference:** @gradio/client (Hugging Face Spaces), @huggingface/inference
- **3D Viewer:** @react-three/fiber, @react-three/drei, three

## Image Generation Pipeline (`lib/gradioAdapter.ts`)

### Flow: `generateVeneerImage(input) → GenerateOutput`
```
Input (photo + mask)
  ↓
analyzeMouthRegion() → MouthAnalysis (mode, defects, coverage)
  ↓
Flatten transparent mask onto black background
  ↓
Scale full image & mask to target dimensions (max 1024px, snapped to multiple of 8)
  ↓
[AI MODEL CALL] (Modal / HF Space) → FLUX.1 Fill (inpaints natively on full image)
  ↓
Scale generated output back to original dimensions
  ↓
Quality metrics check (maskedDiff, darkLift, toothGain, archDrift)
  ↓
Output OR local-cavity-enhancer fallback
```

### Analysis Modes
| Mode | When | Target |
|---|---|---|
| `reconstruct` | Missing/broken teeth | Full-image native reconstruction (up to 1024px) |
| `restore` | Misaligned/chipped/stained | Full-image native restoration (up to 1024px) |
| `refine` | Minor cosmetic improvement | Full-image native refinement (up to 1024px) |

### Mouth Context Classification
| Context | Coverage | Behavior |
|---|---|---|
| `face` | < 5% | Full face visible |
| `mouth_closeup` | 5-14% | Zoomed mouth |
| `teeth_only` | > 14% | Extreme close-up |

## Available API Providers (`.env.local`)
| Provider | Key | Status | Quality | Description |
|---|---|---|---|---|
| **Modal.com** | ✅ Active | **Primary Production** | ⭐⭐⭐⭐⭐ (FLUX.1 Fill Dev) | Serverless A10G Cloud GPU, sequential CPU offloading, weight pre-cached, cost-optimized (60s autokill). |
| Hugging Face (HF_TOKEN) | ✅ Active | Production Fallback | ⭐⭐⭐⭐⭐ (FLUX.1 Fill Dev) | Free ZeroGPU Spaces via `@gradio/client`. High quality but subject to quota. |
| Cloudflare Workers AI | ✅ Active | Legacy Fallback | ⭐⭐ (SD 1.5) | Free tier, fast, but low plastic-looking quality. |
| ModelsLab | ✅ Active | Legacy Fallback | ⭐⭐⭐ (SD 1.5 / SDXL) | Paid fallback, medium quality. |
| Replicate | ✅ Set | Fallback | ⭐⭐⭐⭐⭐ (FLUX) | Paid fallback, excellent quality but high cold-starts. |
| Segmind | ✅ Set | Fallback | ⭐⭐⭐⭐ | Paid fallback, various models. |

## Key Files
- `modal_flux_deploy.py` — Python deployment script defining the serverless Modal GPU container, pre-caching FLUX.1 Fill Dev weights, and exposing the `/infer` endpoint.
- `test-modal-endpoint.mjs` — Verification test script that runs a 256x256 test image and mask through Modal to verify veneer outputs with minimal credit usage.
- `lib/gradioAdapter.ts` — Main generation and orchestration pipeline driving mouth region analysis, mask refinement, ROI cropping, blending, and metric gating.
- `services/imageService.ts` — High-level image caller service.
- `test-definitive.mjs` — Tested HF Space fallback client script.
- `components/` — Next.js React UI components.
- `app/` — Next.js page structure and router.
