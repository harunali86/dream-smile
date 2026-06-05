/**
 * Platform Detection Utility — GEMINI Rule 2.1
 * 
 * Detects whether the app is running as:
 * - Web (browser)
 * - Native App (Capacitor on iOS/Android)
 * 
 * All Capacitor-specific code MUST be behind `isNativeApp()` checks
 * and dynamically imported so it's tree-shaken from the web bundle.
 */

type CapacitorBridge = {
    isNativePlatform?: () => boolean;
    getPlatform?: () => 'ios' | 'android' | 'web';
};

declare global {
    interface Window {
        Capacitor?: CapacitorBridge;
    }
}

function getCapacitorBridge(): CapacitorBridge | undefined {
    if (typeof window === 'undefined') return undefined;
    return window.Capacitor;
}

/** Returns true if running inside Capacitor (iOS/Android native shell) */
export function isNativeApp(): boolean {
    return !!getCapacitorBridge()?.isNativePlatform?.();
}

/** Returns true if running in a standard web browser */
export function isWeb(): boolean {
    return !isNativeApp();
}

/** Returns 'ios' | 'android' | 'web' */
export function getPlatform(): 'ios' | 'android' | 'web' {
    const cap = getCapacitorBridge();
    if (cap?.isNativePlatform?.()) {
        return cap.getPlatform?.() === 'ios' ? 'ios' : 'android';
    }
    return 'web';
}

/**
 * Safely import a Capacitor plugin ONLY when running in native app.
 * Returns null on web — zero bundle impact.
 * 
 * Usage:
 *   const share = await loadNativePlugin(() => import('@capacitor/share'));
 *   if (share) { await share.Share.share({ ... }) }
 */
export async function loadNativePlugin<T>(
    loader: () => Promise<T>
): Promise<T | null> {
    if (!isNativeApp()) return null;
    try {
        return await loader();
    } catch {
        console.warn('[Platform] Native plugin failed to load');
        return null;
    }
}

/**
 * Check if device has a physical camera.
 * Works on both web (mediaDevices) and native (Capacitor Camera).
 */
export async function hasCamera(): Promise<boolean> {
    if (typeof navigator === 'undefined') return false;
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.some(d => d.kind === 'videoinput');
    } catch {
        return false;
    }
}
