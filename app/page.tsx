'use client';

import React, { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import VeneerSelector from '@/components/UI/VeneerSelector';
import ComparisonModal from '@/components/UI/ComparisonModal';

const SmileGenerator = dynamic(() => import('@/components/SmileGenerator'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center text-white">
      <div className="animate-pulse text-lg">Loading...</div>
    </div>
  ),
});

interface ComparisonData {
  original: string;
  generated: string;
  provider?: string;
  isDemo?: boolean;
  debug?: string;
}

export default function Home() {
  const [selectedVeneer, setSelectedVeneer] = useState<string>('hollywood');
  const [comparison, setComparison] = useState<ComparisonData | null>(null);

  const handleResult = useCallback((
    original: string,
    generated: string,
    meta?: { provider?: string; isDemo?: boolean; debug?: string }
  ) => {
    setComparison({
      original,
      generated,
      provider: meta?.provider,
      isDemo: meta?.isDemo,
      debug: meta?.debug,
    });
  }, []);

  const handleCloseComparison = useCallback(() => {
    setComparison(null);
  }, []);

  return (
    <main className="flex min-h-screen flex-col bg-gradient-to-b from-gray-950 via-gray-900 to-black relative">
      {/* Header */}
      <header className="sticky top-0 z-40 p-4 bg-black/60 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-md mx-auto w-full flex items-center justify-between">
          <div>
            <h1 className="text-xl font-medium text-white tracking-wide">
              Smile Solution
            </h1>
            <p className="text-[10px] text-white/40 uppercase tracking-[0.2em] font-medium">
              AI Veneer Visualizer
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 bg-green-500/10 text-green-400 text-[10px] font-semibold rounded-full border border-green-500/20">
              AI Powered
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col justify-center pt-8 pb-40">
        <SmileGenerator
          selectedStyle={selectedVeneer}
          onResult={handleResult}
        />
      </div>

      {/* Veneer Style Selector */}
      <VeneerSelector
        selectedVeneer={selectedVeneer}
        onSelect={setSelectedVeneer}
      />

      {/* Comparison Modal */}
      {comparison && (
        <ComparisonModal
          original={comparison.original}
          generated={comparison.generated}
          provider={comparison.provider}
          isDemo={comparison.isDemo}
          debug={comparison.debug}
          onClose={handleCloseComparison}
        />
      )}
    </main>
  );
}
