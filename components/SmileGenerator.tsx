'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, Upload, Sparkles, Loader2, AlertCircle, MapPin, X, FlipHorizontal } from 'lucide-react';

interface SmileGeneratorProps {
    selectedStyle: string;
    onResult: (
        original: string,
        generated: string,
        meta?: { provider?: string; isDemo?: boolean; debug?: string }
    ) => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FREE_GENERATIONS = 999; // Unlimited for now (user request)
const STORAGE_KEY = 'smile_solution_gen_count';

function getGenerationCount(): number {
    if (typeof window === 'undefined') return 0;
    try {
        return parseInt(localStorage.getItem(STORAGE_KEY) ?? '0', 10);
    } catch {
        return 0;
    }
}

function incrementGenerationCount(): number {
    const current = getGenerationCount() + 1;
    try {
        localStorage.setItem(STORAGE_KEY, String(current));
    } catch { /* SSR-safe */ }
    return current;
}

export default function SmileGenerator({ selectedStyle, onResult }: SmileGeneratorProps) {
    const [preview, setPreview] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);
    const [genCount, setGenCount] = useState(0);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const limitReached = genCount >= MAX_FREE_GENERATIONS;
    const remaining = Math.max(0, MAX_FREE_GENERATIONS - genCount);

    useEffect(() => {
        setGenCount(getGenerationCount());
    }, []);

    // Cleanup camera stream on unmount
    useEffect(() => {
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
            }
        };
    }, []);

    const clearError = useCallback(() => {
        if (error) setTimeout(() => setError(null), 4000);
    }, [error]);

    const clearInfo = useCallback(() => {
        if (info) setTimeout(() => setInfo(null), 4500);
    }, [info]);

    // --- Camera Functions ---
    const startCamera = useCallback(async (facing: 'user' | 'environment' = facingMode) => {
        try {
            // Stop existing stream
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 1600 } },
                audio: false,
            });

            streamRef.current = stream;
            setIsCameraOpen(true);
            setError(null);

            // Wait for video element to mount then assign
            setTimeout(() => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
            }, 50);
        } catch (err: unknown) {
            if (err instanceof DOMException && err.name === 'NotAllowedError') {
                setError('Camera access denied. Please allow camera permission and try again.');
            } else if (err instanceof DOMException && err.name === 'NotFoundError') {
                setError('No camera found on this device.');
            } else {
                setError('Could not access camera. Please try uploading a photo instead.');
            }
            clearError();
        }
    }, [facingMode, clearError]);

    const stopCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        setIsCameraOpen(false);
    }, []);

    const capturePhoto = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Mirror the image if front-facing camera
        if (facingMode === 'user') {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }

        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        setPreview(dataUrl);
        stopCamera();
    }, [facingMode, stopCamera]);

    const flipCamera = useCallback(() => {
        const newFacing = facingMode === 'user' ? 'environment' : 'user';
        setFacingMode(newFacing);
        startCamera(newFacing);
    }, [facingMode, startCamera]);

    // --- File Upload ---
    const validateAndSetImage = useCallback((file: File) => {
        if (!ALLOWED_TYPES.includes(file.type)) {
            setError('Only JPEG, PNG, and WebP images are accepted.');
            clearError();
            return;
        }
        if (file.size > MAX_FILE_SIZE) {
            setError('Image must be under 10MB.');
            clearError();
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const result = e.target?.result as string;
            setPreview(result);
            setError(null);
        };
        reader.onerror = () => {
            setError('Failed to read image. Please try again.');
            clearError();
        };
        reader.readAsDataURL(file);
    }, [clearError]);

    const handleFileChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (file) validateAndSetImage(file);
            e.target.value = '';
        },
        [validateAndSetImage]
    );

    // --- Generate ---
    const handleGenerate = useCallback(async () => {
        if (!preview || limitReached) return;

        setIsGenerating(true);
        setError(null);
        setInfo(null);

        try {
            const { generateMouthMask } = await import('@/utils/masking');

            const img = new Image();
            img.crossOrigin = 'anonymous';
            await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = () => reject(new Error('Failed to load image'));
                img.src = preview;
            });

            const maskBase64 = await generateMouthMask(img);

            if (!maskBase64) {
                setError('Could not detect cavity/teeth region. Use a clear image where teeth and mouth cavity are visible (full face or close-up).');
                return;
            }

            const response = await fetch('/api/v1/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image_url: preview,
                    mask_url: maskBase64,
                    veneer_style: selectedStyle,
                }),
            });

            const data = await response.json();

            if (!data.success) {
                setError(data.error?.message ?? 'Failed to generate. Please try again.');
                return;
            }

            const provider = data.data?.provider as string | undefined;
            const isDemo = Boolean(data.data?.isDemo);
            const debug = data.data?.debug as string | undefined;

            if (isDemo) {
                setInfo('Primary AI provider is temporarily busy. Please retry in a moment.');
                clearInfo();
            }

            const newCount = incrementGenerationCount();
            setGenCount(newCount);
            // DEBUG: verify original vs generated are different
            console.log('[DEBUG] preview length:', preview?.length, 'first100:', preview?.substring(0, 100));
            console.log('[DEBUG] imageUrl length:', data.data.imageUrl?.length, 'first100:', data.data.imageUrl?.substring(0, 100));
            console.log('[DEBUG] ARE SAME?', preview === data.data.imageUrl);
            onResult(preview, data.data.imageUrl, {
                provider,
                isDemo,
                debug,
            });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
            setError(message);
        } finally {
            setIsGenerating(false);
        }
    }, [preview, selectedStyle, onResult, limitReached, clearInfo]);

    // ==================== RENDER ====================

    // --- Camera View (Full-screen overlay) ---
    if (isCameraOpen) {
        return (
            <div className="fixed inset-0 z-[90] bg-black flex flex-col">
                {/* Camera Header */}
                <div className="absolute top-0 left-0 right-0 z-20 p-4 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent">
                    <button
                        onClick={stopCamera}
                        className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white"
                        aria-label="Close camera"
                    >
                        <X className="w-5 h-5" />
                    </button>
                    <p className="text-white/60 text-sm font-medium tracking-wide">Smile & Capture</p>
                    <button
                        onClick={flipCamera}
                        className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white"
                        aria-label="Flip camera"
                    >
                        <FlipHorizontal className="w-5 h-5" />
                    </button>
                </div>

                {/* Live Video Feed */}
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="flex-1 w-full h-full object-cover"
                    style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
                />

                {/* Capture Button */}
                <div className="absolute bottom-0 left-0 right-0 z-20 pb-10 pt-6 flex justify-center bg-gradient-to-t from-black/60 to-transparent">
                    <button
                        onClick={capturePhoto}
                        className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
                        aria-label="Capture photo"
                    >
                        <div className="w-16 h-16 rounded-full bg-white" />
                    </button>
                </div>
            </div>
        );
    }

    // --- Main View ---
    return (
        <div className="flex flex-col items-center w-full max-w-md mx-auto px-4 font-sans">
            {/* Error Banner */}
            {error && (
                <div className="w-full mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-300">{error}</p>
                </div>
            )}
            {info && (
                <div className="w-full mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-100">{info}</p>
                </div>
            )}

            {/* Photo Preview Area */}
            {preview ? (
                <div className="relative w-full aspect-[3/4] max-h-[320px] sm:max-h-[360px] rounded-2xl overflow-hidden border border-white/10 shadow-2xl mb-6 bg-neutral-900">
                    <img
                        src={preview}
                        alt="Your smile"
                        className="w-full h-full object-cover"
                    />
                    <button
                        onClick={() => setPreview(null)}
                        className="absolute top-3 right-3 px-4 py-2 bg-black/40 backdrop-blur-md text-white text-xs font-medium rounded-full border border-white/10 hover:bg-black/60 transition-colors"
                    >
                        Change Photo
                    </button>

                    {isGenerating && (
                        <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center z-10">
                            <Loader2 className="w-12 h-12 animate-spin text-amber-100 mb-4" />
                            <p className="text-white font-medium text-lg tracking-wide">Crafting Your Smile...</p>
                            <p className="text-white/40 text-sm mt-2 font-light">AI is designing natural veneers</p>
                        </div>
                    )}
                </div>
            ) : (
                /* Upload / Capture Buttons */
                <div className="w-full aspect-[3/4] max-h-[320px] sm:max-h-[360px] rounded-2xl border border-white/5 bg-gradient-to-b from-white/5 to-transparent flex flex-col items-center justify-center gap-6 mb-6 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03),transparent)] pointer-events-none" />

                    <div className="text-center z-10">
                        <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover:scale-105 transition-transform duration-500">
                            <Camera className="w-8 h-8 text-white/80" />
                        </div>
                        <h3 className="text-white font-medium text-lg mb-2 tracking-wide">Upload Your Smile</h3>
                        <p className="text-white/40 text-sm max-w-[240px] font-light leading-relaxed">
                            Take a selfie or pick a photo from your gallery
                        </p>
                    </div>

                    <div className="flex flex-col gap-3 w-full max-w-[280px] z-10">
                        {/* Camera Capture — Opens WebRTC on any device */}
                        <button
                            onClick={() => startCamera('user')}
                            className="flex items-center justify-center gap-3 px-6 py-3.5 bg-white text-black rounded-xl font-semibold text-sm hover:bg-gray-100 transition-all hover:scale-[1.02] active:scale-[0.98]"
                        >
                            <Camera className="w-4 h-4" />
                            Take Photo
                        </button>

                        {/* Gallery Upload */}
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center justify-center gap-3 px-6 py-3.5 bg-white/5 text-white rounded-xl font-medium text-sm border border-white/10 hover:bg-white/10 transition-all hover:scale-[1.02] active:scale-[0.98]"
                        >
                            <Upload className="w-4 h-4" />
                            Select from Gallery
                        </button>
                    </div>
                </div>
            )}

            {/* Hidden File Input (Gallery only) */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                aria-label="Upload photo from gallery"
            />

            {/* Generate Button or Limit CTA */}
            {preview && !isGenerating && (
                limitReached ? (
                    <div className="w-full text-center">
                        <div className="p-5 bg-neutral-900 border border-amber-900/30 rounded-2xl mb-4">
                            <p className="text-amber-100 font-medium text-sm mb-1 tracking-wide">
                                All {MAX_FREE_GENERATIONS} free previews used
                            </p>
                            <p className="text-white/40 text-xs font-light">
                                Visit our clinic for a professional consultation
                            </p>
                        </div>
                        <a
                            href="https://maps.google.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full py-4 bg-white text-black rounded-2xl font-semibold text-base shadow-lg flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all"
                        >
                            <MapPin className="w-4 h-4" />
                            Book Consultation
                        </a>
                    </div>
                ) : (
                    <div className="w-full">
                        <button
                            onClick={handleGenerate}
                            disabled={!selectedStyle}
                            className="w-full py-4 bg-white text-black rounded-2xl font-semibold text-base shadow-xl hover:shadow-2xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            <Sparkles className="w-4 h-4 text-amber-600" />
                            Generate Dream Smile
                        </button>
                        <p className="text-center text-white/20 text-[10px] mt-3 uppercase tracking-widest font-medium">
                            {remaining} {remaining === 1 ? 'preview' : 'previews'} remaining
                        </p>
                    </div>
                )
            )}
        </div>
    );
}
