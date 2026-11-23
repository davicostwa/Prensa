export type JourneyStep = 'upload' | 'analyze' | 'studio';

export type MediaKind = 'image' | 'video' | 'motion-sample';

export interface MediaSource {
  id: string;
  name: string;
  kind: MediaKind;
  url: string;
  width: number;
  height: number;
  duration?: number;
}

export interface PrintParams {
  gradientMix: number;     // 0 to 1
  halftoneAmount: number;  // 0 to 1
  halftoneScale: number;   // 40 to 220 (density/lines)
  paperTexture: number;    // 0 to 1
  grain: number;           // 0 to 1
  inkShift: number;        // 0 to 1 (chromatic/plate misregistration)
  inkWear: number;         // 0 to 1 (distressed ink bleed & edge texture)
  contrast: number;        // 0.6 to 1.6
  saturation: number;      // 0 to 1.6
  vignette: number;        // 0 to 1
}

export interface GradientMap {
  id: string;
  name: string;
  subtitle: string;
  shadow: string;    // hex
  midtone: string;   // hex
  highlight: string; // hex
  isNatural?: boolean;
}

export interface PrintPreset {
  id: string;
  name: string;
  subtitle: string;
  defaultGradientId: string;
  params: PrintParams;
}

export interface MediaAnalysis {
  avgLuminance: number;     // 0..1
  contrastSpread: number;   // 0..1
  saturationAvg: number;    // 0..1
  warmthBias: number;       // -1 (cool) .. +1 (warm)
  shadowRatio: number;      // 0..1
  highlightRatio: number;   // 0..1
  recommendedPresetId: string;
  recommendedGradientId: string;
  summary: string;
}

export type CompareMode = 'result' | 'original' | 'split';

export type TargetFps = 15 | 24 | 30 | 60;
