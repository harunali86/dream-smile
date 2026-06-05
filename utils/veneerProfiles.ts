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
        id: 'bleach',
        name: 'Bleach XL',
        previewColor: '#EFF3FA',
        previewHighlight: '#F7FAFF',
        enhancement: {
            alignment: 0.9,
            whitening: 0.88,
            coverage: 0.84,
            smileLift: 0.76,
        },
        material: {
            base: '#EFF3FA',
            highlight: '#F7FAFF',
            roughness: 0.31,
            metalness: 0.04,
            transmission: 0.018,
            clearcoat: 0.74,
            clearcoatRoughness: 0.18,
            reflectivity: 0.24,
            envMapIntensity: 0.58,
            ior: 1.44,
            thickness: 0.14,
        },
    },
    {
        id: 'bright',
        name: 'Super Bright',
        previewColor: '#FBFAF6',
        previewHighlight: '#FFFFFF',
        enhancement: {
            alignment: 0.95,
            whitening: 0.96,
            coverage: 0.9,
            smileLift: 0.82,
        },
        material: {
            base: '#FBFAF6',
            highlight: '#FFFFFF',
            roughness: 0.29,
            metalness: 0.04,
            transmission: 0.02,
            clearcoat: 0.78,
            clearcoatRoughness: 0.16,
            reflectivity: 0.26,
            envMapIntensity: 0.64,
            ior: 1.45,
            thickness: 0.15,
        },
    },
];

export const VENEER_PROFILE_MAP: Record<string, VeneerProfile> = VENEER_PROFILES.reduce((acc, profile) => {
    acc[profile.id] = profile;
    return acc;
}, {} as Record<string, VeneerProfile>);
