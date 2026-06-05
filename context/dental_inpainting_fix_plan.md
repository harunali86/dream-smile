# DreamSmile AI — Dental Inpainting Fix Plan (Execution Lock)

> **Status:** SUPERSEDED BY ADR-008 (Native Inpainting Transition)
> **Applicability:** `lib/gradioAdapter.ts`
> **Enforcement:** Enforces Constitution §1.2 (Execution Lock) and §1.8 (Root Cause Resolution)

---

## 1. Context & Problem Statement

In the dental inpainting pipeline, the primary image provider `flux_modal` works beautifully because it composites the generated tooth corrections back using `pasteMaskedRoiBack()`. This function extracts the alpha channel of the dental mask, applies custom boundary erosion, blurs the edges (1.2px), and performs alpha-masked blending to isolate edits strictly to the teeth/gums.

However, all other active/fallback pipeline routes—specifically `runFluxHFModel` (Hugging Face FLUX), `runModelslabModel` (ModelsLab), and the Cloudflare model fallback loop—currently call `pasteRoiBack()`. This function overwrites the entire rectangular region of the cropped mouth ROI. 

As a result, if the primary flow falls back to these models, or if those providers are explicitly invoked:
1. The user's authentic mouth shape, lips, and surrounding facial skin within the box crop are replaced by the AI model's generation.
2. Distinct box boundaries, skin texture mismatches, and severe distortions of the lip/mouth geometry occur, making the edits look synthetic and cartoonish.

---

## 2. Proposed Changes (Current vs. Desired State)

### 2.1 Current State
- `runFluxModalModel` uses `pasteMaskedRoiBack()` (perfect blend, teeth isolated).
- `runFluxHFModel` uses `pasteRoiBack()` (rectangular block override, leaks artifacts).
- `runModelslabModel` uses `pasteRoiBack()` (rectangular block override, leaks artifacts).
- Cloudflare fallback loop uses `pasteRoiBack()` (rectangular block override, leaks artifacts).
- `pasteRoiBack` is defined as a redundant, duplicate utility in `lib/gradioAdapter.ts`.

### 2.2 Desired State
- All four pipeline flows strictly call `pasteMaskedRoiBack()` using the custom feathered alpha-mask.
- The `pasteRoiBack` function definition is safely removed to eliminate dead code and keep the codebase clean.
- Only the teeth and gums are ever replaced, regardless of provider, leaving lips and facial skin 100% authentic and untouched.
- `context/architecture.md` is updated to reflect this unified masked composition pipeline.

---

## 3. Impact Analysis

- **API Contracts:** `generateVeneerImage()`'s signature, input, and output contracts remain completely unchanged.
- **Dependencies:** Uses existing `sharp` operations already present and loaded in `lib/gradioAdapter.ts`. No new packages.
- **Data Risk:** Zero. All operations are local, server-side in-memory buffer transformations.
- **Performance:** Negligible CPU/VRAM overhead. The custom sharp mask processing (erosion + blur) runs in milliseconds on standard CPU/server configurations.
- **Blast Radius:** Localized strictly to `lib/gradioAdapter.ts`.

---

## 4. Step-by-Step Technical Plan

### Step 1: Migrate ModelsLab Pipeline
Update the composition step in `runModelslabModel` (`lib/gradioAdapter.ts` around line 2189):
```diff
- const pastedDataUrl = await pasteRoiBack(input.imageBase64, roiGeneratedDataUrl, roiInput.meta);
+ const pastedDataUrl = await pasteMaskedRoiBack(
+     input.imageBase64,
+     roiGeneratedDataUrl,
+     roiInput.maskDataUrl,
+     roiInput.meta
+ );
```

### Step 2: Migrate Hugging Face FLUX Pipeline
Update the composition step in `runFluxHFModel` (`lib/gradioAdapter.ts` around line 2299):
```diff
- const pastedDataUrl = await pasteRoiBack(input.imageBase64, roiGeneratedDataUrl, roiInput.meta);
+ const pastedDataUrl = await pasteMaskedRoiBack(
+     input.imageBase64,
+     roiGeneratedDataUrl,
+     roiInput.maskDataUrl,
+     roiInput.meta
+ );
```

### Step 3: Migrate Cloudflare Fallback Loop
Update the composition step in the Cloudflare fallback loop (`lib/gradioAdapter.ts` around line 2909):
```diff
- const pastedDataUrl = await pasteRoiBack(workingInput.imageBase64, roiGeneratedDataUrl, roiInput.meta);
+ const pastedDataUrl = await pasteMaskedRoiBack(
+     workingInput.imageBase64,
+     roiGeneratedDataUrl,
+     roiInput.maskDataUrl,
+     roiInput.meta
+ );
```

### Step 4: Remove Unused `pasteRoiBack` Utility
Delete the function definition of `pasteRoiBack` (lines 621–642 in `lib/gradioAdapter.ts`).

### Step 5: Update Architecture Documentation
Modify `context/architecture.md` at line 31 to change `pasteRoiBack()` to `pasteMaskedRoiBack()`.

---

## 5. Verification Protocol

1. **TypeScript Build Verification:**
   We will trigger a typescript compiler dry run `npx tsc --noEmit` on the project root to ensure no typings are broken or mismatched.
2. **Execution Sanity Check:**
   We will execute the local endpoint validation script `node verify-sweep-diff.mjs` or `node test-guidance-sweep.mjs` to ensure the adapter compiles and runs properly.
