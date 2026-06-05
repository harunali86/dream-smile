'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Download, Share2, ArrowLeftRight } from 'lucide-react';

interface ComparisonModalProps {
    original: string;
    generated: string;
    provider?: string;
    isDemo?: boolean;
    debug?: string;
    onClose: () => void;
}

type CapacitorFilesystemModule = {
    Filesystem: {
        writeFile: (options: {
            path: string;
            data: string;
            directory: string;
        }) => Promise<void>;
    };
    Directory: {
        Documents: string;
    };
};

type CapacitorShareModule = {
    Share: {
        share: (options: {
            title?: string;
            text?: string;
            url?: string;
            dialogTitle?: string;
        }) => Promise<void>;
    };
};

const CAPACITOR_FILESYSTEM_MODULE_ID = '@capacitor/filesystem';
const CAPACITOR_SHARE_MODULE_ID = '@capacitor/share';

export default function ComparisonModal({
    original,
    generated,
    provider,
    isDemo,
    debug,
    onClose,
}: ComparisonModalProps) {
    const [sliderPosition, setSliderPosition] = useState(50);
    const [viewMode, setViewMode] = useState<'slider' | 'side-by-side'>('slider');
    const [imageAspectRatio, setImageAspectRatio] = useState(3 / 4);
    const [showDebug] = useState(() => process.env.NEXT_PUBLIC_SHOW_IMAGE_DEBUG === 'true');
    const containerRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);

    // DEBUG: verify props
    useEffect(() => {
        console.log('[ComparisonModal DEBUG] original length:', original?.length);
        console.log('[ComparisonModal DEBUG] generated length:', generated?.length);
        console.log('[ComparisonModal DEBUG] ARE SAME?', original === generated);
        console.log('[ComparisonModal DEBUG] original starts:', original?.substring(0, 80));
        console.log('[ComparisonModal DEBUG] generated starts:', generated?.substring(0, 80));
    }, [original, generated]);

    const updateSlider = useCallback((clientX: number) => {
        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const x = clientX - rect.left;
        const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
        setSliderPosition(percentage);
    }, []);

    // Mouse Events
    const handleMouseDown = useCallback(() => {
        isDragging.current = true;
    }, []);

    const handleMouseMove = useCallback(
        (e: MouseEvent) => {
            if (!isDragging.current) return;
            e.preventDefault();
            updateSlider(e.clientX);
        },
        [updateSlider]
    );

    const handleMouseUp = useCallback(() => {
        isDragging.current = false;
    }, []);

    // Touch Events (Mobile)
    const handleTouchStart = useCallback(() => {
        isDragging.current = true;
    }, []);

    const handleTouchMove = useCallback(
        (e: TouchEvent) => {
            if (!isDragging.current || !e.touches[0]) return;
            e.preventDefault();
            updateSlider(e.touches[0].clientX);
        },
        [updateSlider]
    );

    const handleTouchEnd = useCallback(() => {
        isDragging.current = false;
    }, []);

    useEffect(() => {
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.addEventListener('touchmove', handleTouchMove, { passive: false });
        document.addEventListener('touchend', handleTouchEnd);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.removeEventListener('touchmove', handleTouchMove);
            document.removeEventListener('touchend', handleTouchEnd);
        };
    }, [handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

    // Prevent body scroll when modal is open
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = '';
        };
    }, []);

    useEffect(() => {
        let mounted = true;

        const probeRatio = (src: string) =>
            new Promise<number | null>((resolve) => {
                const img = new Image();
                img.onload = () => {
                    if (!img.width || !img.height) return resolve(null);
                    resolve(img.width / img.height);
                };
                img.onerror = () => resolve(null);
                img.src = src;
            });

        (async () => {
            const [originalRatio, generatedRatio] = await Promise.all([
                probeRatio(original),
                probeRatio(generated),
            ]);
            if (!mounted) return;

            const ratios = [originalRatio, generatedRatio].filter((r): r is number => typeof r === 'number');
            if (!ratios.length) return;

            const chosen = ratios.length === 2 ? Math.min(ratios[0], ratios[1]) : ratios[0];
            setImageAspectRatio(Math.max(0.55, Math.min(1.9, chosen)));
        })();

        return () => {
            mounted = false;
        };
    }, [original, generated]);

    const handleDownload = useCallback(async () => {
        const { isNativeApp, loadNativePlugin } = await import('@/utils/platform');

        if (isNativeApp()) {
            // Native: Save to device gallery via Capacitor Filesystem
            const fsModule = await loadNativePlugin<CapacitorFilesystemModule>(() =>
                import(/* webpackIgnore: true */ CAPACITOR_FILESYSTEM_MODULE_ID) as unknown as Promise<CapacitorFilesystemModule>
            );
            if (fsModule) {
                try {
                    const response = await fetch(generated);
                    const blob = await response.blob();
                    const reader = new FileReader();
                    const base64 = await new Promise<string>((resolve) => {
                        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                        reader.readAsDataURL(blob);
                    });
                    await fsModule.Filesystem.writeFile({
                        path: `smile-solution-${Date.now()}.jpg`,
                        data: base64,
                        directory: fsModule.Directory.Documents,
                    });
                } catch {
                    window.open(generated, '_blank');
                }
            }
        } else {
            // Web: Standard download via anchor tag
            try {
                const response = await fetch(generated);
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `smile-solution-${Date.now()}.jpg`;
                link.click();
                URL.revokeObjectURL(url);
            } catch {
                window.open(generated, '_blank');
            }
        }
    }, [generated]);

    const handleShare = useCallback(async () => {
        const { isNativeApp, loadNativePlugin } = await import('@/utils/platform');

        if (isNativeApp()) {
            // Native: Capacitor Share plugin (native share sheet)
            const shareModule = await loadNativePlugin<CapacitorShareModule>(() =>
                import(/* webpackIgnore: true */ CAPACITOR_SHARE_MODULE_ID) as unknown as Promise<CapacitorShareModule>
            );
            if (shareModule) {
                await shareModule.Share.share({
                    title: 'My Dream Smile',
                    text: 'Check out my Dream Smile! Generated by Smile Solution.',
                    url: generated,
                    dialogTitle: 'Share your smile',
                });
            }
        } else if (typeof navigator !== 'undefined' && navigator.share) {
            // Web: Web Share API
            try {
                const response = await fetch(generated);
                const blob = await response.blob();
                const file = new File([blob], 'smile-solution.jpg', { type: 'image/jpeg' });

                await navigator.share({
                    title: 'My Dream Smile — Smile Solution',
                    text: 'Check out my Dream Smile! Generated by Smile Solution.',
                    files: [file],
                });
            } catch {
                await navigator.share({
                    title: 'My Dream Smile',
                    text: 'Check out my Dream Smile! Generated by Smile Solution.',
                    url: window.location.href,
                });
            }
        }
    }, [generated]);

    return (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent absolute top-0 left-0 right-0 z-20">
                <div className="flex flex-col gap-1">
                    <h2 className="text-white font-semibold text-sm tracking-wide">Your Dream Smile</h2>
                    {provider && (
                        <p className="text-[10px] text-white/55 tracking-wide uppercase">
                            Source: {provider}
                            {isDemo ? ' (Demo)' : ''}
                        </p>
                    )}
                    {debug && showDebug && (
                        <p className="text-[10px] text-amber-200/80 max-w-[380px] truncate">
                            {debug}
                        </p>
                    )}
                </div>
                <button
                    onClick={onClose}
                    className="w-9 h-9 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
                    aria-label="Close comparison"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* View Toggle */}
            <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 flex gap-2 p-1 bg-black/60 backdrop-blur-md rounded-full border border-white/10">
                <button
                    onClick={() => setViewMode('slider')}
                    className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${viewMode === 'slider' ? 'bg-white text-black shadow-lg' : 'text-white/70 hover:text-white'
                        }`}
                >
                    Slider
                </button>
                <button
                    onClick={() => setViewMode('side-by-side')}
                    className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${viewMode === 'side-by-side' ? 'bg-white text-black shadow-lg' : 'text-white/70 hover:text-white'
                        }`}
                >
                    Side by Side
                </button>
            </div>

            {/* Content Area */}
            <div className="mt-16 relative flex-1 w-full max-w-5xl mx-auto flex items-center justify-center p-4">
                {viewMode === 'slider' ? (
                    /* Slider View */
                    <div
                        ref={containerRef}
                        className="relative w-full rounded-2xl overflow-hidden cursor-ew-resize select-none shadow-2xl border border-white/20 bg-black"
                        style={{
                            aspectRatio: imageAspectRatio,
                            maxWidth: imageAspectRatio >= 1 ? '880px' : '500px',
                        }}
                        onMouseDown={handleMouseDown}
                        onTouchStart={handleTouchStart}
                    >
                        {/* Layer 1: Original image as base */}
                        <img
                            src={original}
                            alt="Original smile"
                            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                            draggable={false}
                        />

                        {/* Layer 2: Generated image clipped from slider position to the right side */}
                        <div
                            className="absolute inset-0 pointer-events-none"
                            style={{ clipPath: `inset(0 0 0 ${sliderPosition}%)` }}
                        >
                            <img
                                src={generated}
                                alt="AI generated smile"
                                className="absolute inset-0 w-full h-full object-contain"
                                draggable={false}
                            />
                        </div>

                        {/* Slider Handle */}
                        <div
                            className="absolute top-0 bottom-0 z-10 pointer-events-none"
                            style={{ left: `${sliderPosition}%` }}
                        >
                            <div className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_10px_rgba(0,0,0,0.5)] -translate-x-1/2" />
                            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-white shadow-2xl flex items-center justify-center border-2 border-white/50">
                                <ArrowLeftRight className="w-5 h-5 text-gray-800" />
                            </div>
                        </div>

                        {/* Labels */}
                        <div className="absolute top-4 left-4 z-10 pointer-events-none">
                            <span className="px-3 py-1 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold uppercase tracking-wider rounded-md border border-white/10">
                                Before
                            </span>
                        </div>
                        <div className="absolute top-4 right-4 z-10 pointer-events-none">
                            <span className="px-3 py-1 bg-amber-500 text-black text-[10px] font-bold uppercase tracking-wider rounded-md shadow-lg">
                                After
                            </span>
                        </div>
                    </div>
                ) : (
                    /* Side-by-Side View */
                    <div className="flex flex-col md:flex-row gap-4 w-full h-full justify-center items-center overflow-y-auto">
                        <div
                            className="relative w-full md:w-[45%] rounded-2xl overflow-hidden border border-white/20 shadow-xl bg-black"
                            style={{ aspectRatio: imageAspectRatio }}
                        >
                            <img src={original} alt="Before" className="w-full h-full object-contain" />
                            <span className="absolute top-4 left-4 px-3 py-1 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold uppercase tracking-wider rounded-md border border-white/10">
                                Before
                            </span>
                        </div>
                        <div
                            className="relative w-full md:w-[45%] rounded-2xl overflow-hidden border border-amber-500/30 shadow-xl shadow-amber-500/10 bg-black"
                            style={{ aspectRatio: imageAspectRatio }}
                        >
                            <img src={generated} alt="After" className="w-full h-full object-contain" />
                            <span className="absolute top-4 right-4 px-3 py-1 bg-amber-500 text-black text-[10px] font-bold uppercase tracking-wider rounded-md shadow-lg">
                                After
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Action Buttons */}
            <div className="p-4 pb-8 bg-gradient-to-t from-black via-black/90 to-transparent flex items-center justify-center gap-4">
                <button
                    onClick={handleDownload}
                    className="flex items-center gap-2 px-6 py-3 bg-white text-black rounded-xl font-semibold text-sm shadow-xl hover:scale-105 active:scale-95 transition-transform"
                >
                    <Download className="w-4 h-4" />
                    Download
                </button>

                {typeof navigator !== 'undefined' && 'share' in navigator && (
                    <button
                        onClick={handleShare}
                        className="flex items-center gap-2 px-6 py-3 bg-white/10 text-white rounded-xl font-semibold text-sm border border-white/10 hover:bg-white/20 transition-all hover:scale-105 active:scale-95"
                    >
                        <Share2 className="w-4 h-4" />
                        Share
                    </button>
                )}

                <button
                    onClick={onClose}
                    className="flex items-center gap-2 px-6 py-3 bg-white/10 text-white rounded-xl font-semibold text-sm border border-white/20 hover:bg-white/15 active:scale-95 transition-all"
                >
                    Try Again
                </button>
            </div>
        </div>
    );
}
