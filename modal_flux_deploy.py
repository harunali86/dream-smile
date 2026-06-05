"""
DreamSmile AI — FLUX.1 Fill Dev on Modal.com
Serverless GPU endpoint for dental inpainting.

Deploy:  modal deploy modal_flux_deploy.py
Test:    modal run modal_flux_deploy.py  (runs a quick health check)

Cost: ~$0.015-0.025 per inpaint call (A10G GPU, 25-40s)
$5 free credits ≈ 200-350 calls
"""
import modal
import io
import base64

# --- Modal App Setup ---
app = modal.App("dreamsmile-flux")

def get_hf_token():
    import os
    base_dir = "/home/harun/block/dreamsmile-ai"
    env_path = os.path.join(base_dir, ".env.local")
    try:
        with open(env_path) as f:
            for line in f:
                if line.startswith("HF_TOKEN="):
                    return line.strip().split("=", 1)[1]
    except Exception:
        pass
    return ""

# Pre-build image with all dependencies + model weights cached
# This avoids re-downloading 12GB model on every cold start
flux_image = (
    modal.Image.debian_slim(python_version="3.11")
    .env({
        "HF_TOKEN": get_hf_token(),
        "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True",
    })
    .pip_install(
        "torch==2.4.1",
        "diffusers==0.32.1",
        "transformers==4.45.2",
        "accelerate==0.33.0",
        "safetensors",
        "sentencepiece",
        "protobuf",
        "Pillow",
        "fastapi[standard]",
    )
    .run_commands(
        # Pre-download model weights during image build (not at runtime = saves $$$)
        "python3 -c \""
        "from diffusers import FluxFillPipeline; "
        "import torch; "
        "FluxFillPipeline.from_pretrained("
        "'black-forest-labs/FLUX.1-Fill-dev', "
        "torch_dtype=torch.bfloat16"
        ")\""
    )
)


@app.cls(
    image=flux_image,
    gpu="A10G",                    # Cheapest GPU that runs FLUX well
    timeout=600,                   # Max 10 min per request to accommodate offloading latency
    scaledown_window=60,           # Kill idle container after 60s (save $$$)
)
class FluxInpaint:
    """FLUX.1 Fill Dev inpainting endpoint."""

    @modal.enter()
    def load_model(self):
        """Load model once when container starts (cached in image)."""
        import torch
        from diffusers import FluxFillPipeline

        self.pipe = FluxFillPipeline.from_pretrained(
            "black-forest-labs/FLUX.1-Fill-dev",
            torch_dtype=torch.bfloat16,
        )
        # Sequential CPU offload: moves ONE layer at a time to GPU
        # Peak VRAM usage drops from ~22GB to ~8-10GB — guaranteed fit on A10G
        # Trade-off: ~30-60s slower per inference vs full GPU load
        self.pipe.enable_sequential_cpu_offload()

        # Warmup — first call is always slower
        print("[FLUX] Model loaded with sequential CPU offload. Ready.")

    @modal.fastapi_endpoint(method="POST", docs=True)
    def inpaint(self, data: dict) -> dict:
        """
        Dental inpainting endpoint.

        POST JSON body:
        {
            "image": "<base64 encoded image>",
            "mask": "<base64 encoded mask (white=inpaint area)>",
            "prompt": "beautiful white teeth...",
            "guidance_scale": 30,       (optional, default 30)
            "num_inference_steps": 28,  (optional, default 28)
            "width": 1024,              (optional, default from image)
            "height": 1024,             (optional, default from image)
            "seed": -1                  (optional, -1 = random)
        }

        Returns:
        {
            "success": true,
            "image": "<base64 encoded result>",
            "seed": 12345
        }
        """
        import torch
        from PIL import Image

        try:
            # Decode inputs
            image_bytes = base64.b64decode(data["image"])
            mask_bytes = base64.b64decode(data["mask"])

            image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            mask = Image.open(io.BytesIO(mask_bytes)).convert("L")

            prompt = data.get("prompt", "beautiful white teeth, dental veneers, photorealistic")
            guidance_scale = data.get("guidance_scale", 30)
            num_steps = data.get("num_inference_steps", 28)
            width = data.get("width", image.width)
            height = data.get("height", image.height)
            seed = data.get("seed", -1)

            # Ensure dimensions are multiples of 8 (required by FLUX)
            width = max(64, (width // 8) * 8)
            height = max(64, (height // 8) * 8)

            # Resize inputs to target dimensions
            image = image.resize((width, height), Image.LANCZOS)
            mask = mask.resize((width, height), Image.NEAREST)

            # Set seed
            if seed < 0:
                import random
                seed = random.randint(0, 2147483647)
            generator = torch.Generator("cuda").manual_seed(seed)

            # Clear VRAM fragmentation before inference
            torch.cuda.empty_cache()

            # Run inpainting
            result = self.pipe(
                prompt=prompt,
                image=image,
                mask_image=mask,
                height=height,
                width=width,
                guidance_scale=guidance_scale,
                num_inference_steps=num_steps,
                generator=generator,
            ).images[0]

            # Encode result to base64
            buf = io.BytesIO()
            result.save(buf, format="WEBP", quality=95)
            result_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

            return {
                "success": True,
                "image": result_b64,
                "seed": seed,
                "width": width,
                "height": height,
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
            }


# --- Health check / quick test ---
@app.local_entrypoint()
def main():
    """Runs a local end-to-end test on Modal's cloud GPU and saves the result."""
    import base64
    import io
    import os
    from PIL import Image

    print("\n==========================================")
    print("🚀 DREAM SMILE FLUX INPAINTING LOCAL TEST")
    print("==========================================\n")

    # Paths
    base_dir = "/home/harun/block/dreamsmile-ai"
    image_path = os.path.join(base_dir, "public/demo-result.jpg")
    output_path = os.path.join(base_dir, "public/test-modal-out.webp")

    if not os.path.exists(image_path):
        print(f"❌ Error: Demo image not found at {image_path}")
        return

    print("📸 Loading local demo-result.jpg...")
    img = Image.open(image_path)
    
    # Resize to 512x512 for extremely fast and cheap testing
    test_w, test_h = 512, 512
    img_resized = img.resize((test_w, test_h), Image.LANCZOS if hasattr(Image, "LANCZOS") else Image.Resampling.LANCZOS)
    
    # Create test mask (white square in the middle where teeth/mouth usually are)
    print("🎭 Creating test mask (512x512)...")
    mask = Image.new("L", (test_w, test_h), 0)
    # White bounding box in the center
    for y in range(int(test_h * 0.35), int(test_h * 0.7)):
        for x in range(int(test_w * 0.2), int(test_w * 0.8)):
            mask.putpixel((x, y), 255)

    # Encode to base64
    print("📦 Encoding images to base64...")
    img_buf = io.BytesIO()
    img_resized.save(img_buf, format="JPEG", quality=90)
    img_b64 = base64.b64encode(img_buf.getvalue()).decode("utf-8")

    mask_buf = io.BytesIO()
    mask.save(mask_buf, format="PNG")
    mask_b64 = base64.b64encode(mask_buf.getvalue()).decode("utf-8")

    # Run remote inference on Modal cloud GPU
    print("\n☁️ Triggering FLUX.1 Fill Dev on Modal Cloud GPU...")
    print("⏳ Note: First run takes ~2-3 minutes for model compilation. Subsequent runs are instant (<30s).")
    
    # Instantiate the cloud class
    f_inpaint = FluxInpaint()
    
    # Run remotely
    payload = {
        "image": img_b64,
        "mask": mask_b64,
        "prompt": "perfect white smiling teeth, photorealistic, highly detailed veneer work",
        "guidance_scale": 30,
        "num_inference_steps": 28,
        "width": test_w,
        "height": test_h,
        "seed": 42
    }
    
    import urllib.request
    import json

    url = f_inpaint.inpaint.get_web_url()
    print(f"📡 Sending POST request to: {url}")
    
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode("utf-8"))
    except Exception as e:
        result = {"success": False, "error": str(e)}

    if result.get("success"):
        print("✅ Success! Output base64 received.")
        out_bytes = base64.b64decode(result["image"])
        with open(output_path, "wb") as f:
            f.write(out_bytes)
        print(f"🎉 Result saved locally to: {output_path}")
        print(f"📊 Dimensions: {result.get('width')}x{result.get('height')} | Seed: {result.get('seed')}")
    else:
        print(f"❌ Failed to run inpainting: {result.get('error')}")

    print("\n==========================================")

