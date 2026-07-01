export interface VeneerMaterialProfile {
    base: string;
    highlight: string;
    roughness: number;
    metalness: number;
    transmission: number;
    clearcoat: number;
    clearcoatRoughness: number;
    reflectivity: number;
    envMapIntensity: number;
    ior: number;
    thickness: number;
}

export interface VeneerEnhancementProfile {
    alignment: number;
    whitening: number;
    coverage: number;
    smileLift: number;
}

export interface VeneerProfile {
    id: string;
    name: string;
    previewColor: string;
    previewHighlight: string;
    modelUrl?: string;
    material?: VeneerMaterialProfile;
    enhancement?: VeneerEnhancementProfile;
}

export const VENEER_PROFILES: VeneerProfile[] = [
    {
        id: 'original',
        name: 'Original',
        previewColor: '',
        previewHighlight: '',
    },
    {
        id: 'hollywood',
        name: 'Hollywood White',
        previewColor: '#F8F5EF',
        previewHighlight: '#FFFDF8',
        enhancement: {
            alignment: 0.86,
            whitening: 0.74,
            coverage: 0.8,
            smileLift: 0.7,
        },
        material: {
            base: '#F8F5EF',
            highlight: '#FFFDF8',
            roughness: 0.34,
            metalness: 0.03,
            transmission: 0.016,
            clearcoat: 0.7,
            clearcoatRoughness: 0.2,
            reflectivity: 0.22,
            envMapIntensity: 0.55,
            ior: 1.43,
            thickness: 0.13,
        },
    },
    {
        id: 'natural',
        name: 'Natural White',
        previewColor: '#F1E8DB',
        previewHighlight: '#F8F2E9',
        enhancement: {
            alignment: 0.72,
            whitening: 0.56,
            coverage: 0.68,
            smileLift: 0.62,
        },
        material: {
            base: '#F1E8DB',
            highlight: '#F8F2E9',
            roughness: 0.38,
            metalness: 0.03,
            transmission: 0.012,
            clearcoat: 0.64,
            clearcoatRoughness: 0.24,
            reflectivity: 0.2,
            envMapIntensity: 0.48,
            ior: 1.42,
            thickness: 0.11,
        },
    },
    {
        id: 'ivory',
        name: 'Light Ivory',
        previewColor: '#F5ECD7',
        previewHighlight: '#FAF3E6',
        enhancement: {
            alignment: 0.74,
            whitening: 0.48,
            coverage: 0.7,
            smileLift: 0.6,
        },
        material: {
            base: '#F5ECD7',
            highlight: '#FAF3E6',
            roughness: 0.4,
            metalness: 0.03,
            transmission: 0.01,
            clearcoat: 0.6,
            clearcoatRoughness: 0.26,
            reflectivity: 0.18,
            envMapIntensity: 0.44,
            ior: 1.41,
            thickness: 0.1,
        },
    },
];

export const VENEER_PROFILE_MAP: Record<string, VeneerProfile> = VENEER_PROFILES.reduce((acc, profile) => {
    acc[profile.id] = profile;
    return acc;
}, {} as Record<string, VeneerProfile>);
