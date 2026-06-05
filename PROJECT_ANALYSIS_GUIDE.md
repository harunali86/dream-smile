# DreamSmile AI - Project Analysis Guide

## 1. Project Overview
DreamSmile AI is a real-time virtual veneer try-on application. It uses Augmented Reality (AR) to overlay 3D dental models onto a user's live camera feed.

**Key Tech Stack:**
-   **Framework**: Next.js 14 (App Router)
-   **3D Engine**: Three.js + React Three Fiber (R3F) + Drei
-   **Face Tracking**: `face-api.js` (TensorFlow.js based)
-   **UI**: Tailwind CSS + Lucide Icons

## 2. Architecture: Layered Rendering

The application uses a dual-layer strategy to achieve AR:

1.  **Background Layer**: A raw `<video>` element displays the live webcam feed. It is mirrored via CSS (`transform: scaleX(-1)`).
2.  **Foreground Layer**: A transparent WebGL `<Canvas>` sits perfectly on top of the video. It renders the 3D teeth mesh.

**File:** `components/Camera/ARView.tsx`

## 3. Core Modules & Logic

### A. AR Orchestrator (`ARView.tsx`)
-   **Responsibility**: Initializes Camera, loads AI models, runs the detection loop.
-   **Data Flow**: 
    1.  `face-api.detectSingleFace` runs on every animation frame.
    2.  Extracts 68 facial landmarks.
    3.  **Stabilization**: Raw landmarks are passed to `LandmarkStabilizer` to reduce jitter.
    4.  **Mirroring**: Landmarks are manually flipped (X coordinate) to match the mirrored video.
    5.  **State Update**: Sets `landmarks` state, which triggers a re-render of the 3D scene.

### B. Procedural 3D Mesh (`Teeth3D.tsx`)
-   **Responsibility**: Generates the dental arch geometry and handles positioning.
-   **Geometry**: Uses `THREE.Shape` and `ExtrudeGeometry` to create a U-shaped dental arch dynamically. 
-   **Material**: `MeshPhysicalMaterial` is used to simulate Enamel properties:
    -   `transmission`: 0.1 (Slight translucency)
    -   `roughness`: 0.2 (Smooth/Wet)
    -   `clearcoat`: 1.0 (Saliva layer)
-   **Positioning Logic (PnP)**:
    -   **Position (X,Y)**: Derived from Upper Lip Center (Landmark 62). Mapped from Video Pixels to 3D World Units (Currently 1:1 mapping via OrthographicCamera).
    -   **Scale**: Derived from Mouth Width (Distance between Landmark 48 and 54).
    -   **Rotation (Roll)**: Derived from the angle between Eyes (Landmark 36 and 45).

### C. Jitter Reduction (`utils/LandmarkStabilizer.ts`)
-   **Algorithm**: Simple Exponential Smoothing (EMA).
-   **Factor**: `alpha = 0.7` (Current setting). Lower alpha = smoother but more lag. Higher output = more responsive but jittery.

## 4. Current Limitations & Known Flaws (For Analysis)

1.  **Occlusion (Lips)**:
    -   Currently, the 3D teeth render *on top* of the video.
    -   There is no "Face Mesh Occluder". If the user closes their mouth, the teeth might still be visible (floating) unless specific logic hides them.
    -   *Previous 2D version had strict masking. 3D version needs a transparent mask mesh.*

2.  **Photo Capture**:
    -   The `onCapture` logic is currently disabled/broken in the 3D rewrite.
    -   Needs to use `gl.domElement.toDataURL()` combined with the video frame.

3.  **Z-Depth (Yaw/Pitch)**:
    -   The current tracking only handles X/Y translation and Z-Roll.
    -   Head turning (Yaw) or tilting up/down (Pitch) is not yet fully mapped to the 3D mesh rotation.

## 5. Directory Structure
-   `/components/Camera/`: Core AR logic (`ARView`, `Teeth3D`).
-   `/components/UI/`: Interface elements (`VeneerSelector`).
-   `/utils/`: Helper algorithms (`LandmarkStabilizer`).
-   `/public/models/`: `face-api.js` model weights.
