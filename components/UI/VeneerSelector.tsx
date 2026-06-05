import React from 'react';
import clsx from 'clsx';
import { Eye } from 'lucide-react';
import { VENEER_PROFILES } from '../../utils/veneerProfiles';

// SVG Teeth Clip component for preview
const TeethClipPreview: React.FC<{ color: string; highlight: string; isSelected: boolean }> = ({
    color,
    highlight,
    isSelected,
}) => {
    return (
        <svg viewBox="0 0 60 32" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            {/* Gum line */}
            <ellipse cx="30" cy="6" rx="28" ry="6" fill={isSelected ? '#FFB0B0' : '#E8A0A0'} opacity="0.6" />

            {/* Upper teeth row */}
            {[0, 1, 2, 3, 4, 5].map((i) => {
                const x = 6 + i * 8.2;
                const w = 7.5;
                const h = 14;
                return (
                    <g key={`upper-${i}`}>
                        <rect
                            x={x}
                            y={5}
                            width={w}
                            height={h}
                            rx={1.5}
                            fill={color}
                            stroke="rgba(180,180,180,0.4)"
                            strokeWidth={0.3}
                        />
                        {/* Gloss */}
                        <rect
                            x={x + 0.5}
                            y={5}
                            width={w - 1}
                            height={h * 0.3}
                            rx={1}
                            fill={highlight}
                            opacity={0.7}
                        />
                    </g>
                );
            })}

            {/* Lower teeth row (smaller) */}
            {[0, 1, 2, 3, 4].map((i) => {
                const x = 10 + i * 7.8;
                const w = 7;
                const h = 10;
                return (
                    <rect
                        key={`lower-${i}`}
                        x={x}
                        y={20}
                        width={w}
                        height={h}
                        rx={1.2}
                        fill={color}
                        stroke="rgba(180,180,180,0.3)"
                        strokeWidth={0.3}
                        opacity={0.85}
                    />
                );
            })}
        </svg>
    );
};

interface VeneerSelectorProps {
    selectedVeneer: string | null;
    onSelect: (id: string) => void;
}

const VeneerSelector: React.FC<VeneerSelectorProps> = ({ selectedVeneer, onSelect }) => {
    return (
        <div className="fixed bottom-0 left-0 right-0 bg-neutral-950/95 backdrop-blur-md border-t border-white/10 p-3 pb-6 z-40 shadow-[0_-5px_20px_rgba(0,0,0,0.3)]">
            <div className="max-w-md mx-auto">
                <h3 className="text-center text-[10px] font-semibold text-amber-200/60 mb-2 uppercase tracking-[0.2em]">
                    Select Veneer Style
                </h3>
                <div className="flex gap-3 overflow-x-auto pb-1 hide-scrollbar justify-center">
                    {VENEER_PROFILES.map((option) => (
                        <button
                            key={option.id}
                            onClick={() => onSelect(option.id)}
                            className={clsx(
                                'flex flex-col items-center min-w-[72px] transition-all duration-300 transform',
                                selectedVeneer === option.id
                                    ? 'scale-110 opacity-100'
                                    : 'scale-100 opacity-50 hover:opacity-75'
                            )}
                        >
                            <div
                                className={clsx(
                                    'w-16 h-10 rounded-lg flex items-center justify-center border-2 mb-1.5 transition-all overflow-hidden p-1',
                                    selectedVeneer === option.id
                                        ? 'border-amber-400 bg-white/15 shadow-md shadow-amber-400/20'
                                        : 'border-white/20 bg-white/10'
                                )}
                            >
                                {option.id === 'original' ? (
                                    <Eye className={clsx('w-6 h-6', selectedVeneer === option.id ? 'text-amber-300' : 'text-white/50')} />
                                ) : (
                                    <TeethClipPreview
                                        color={option.previewColor}
                                        highlight={option.previewHighlight}
                                        isSelected={selectedVeneer === option.id}
                                    />
                                )}
                            </div>
                            <span
                                className={clsx(
                                    'text-[10px] font-medium whitespace-nowrap tracking-wide',
                                    selectedVeneer === option.id ? 'text-amber-200' : 'text-white/60'
                                )}
                            >
                                {option.name}
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default VeneerSelector;
