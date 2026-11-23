import { GRADIENT_MAPS, PRINT_PRESETS } from '../data/presets';
import { MediaAnalysis, PrintParams } from '../types/print';

export interface AnalysisCalibrationResult {
  analysis: MediaAnalysis;
  presetId: string;
  gradientId: string;
  calibratedParams: PrintParams;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Performs fast deterministic pixel-level analysis on an image, video frame, or canvas
 * to intelligently select and calibrate the most flattering vintage print recipe.
 */
export function analyzeMediaSource(
  source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
): AnalysisCalibrationResult {
  const sampleSize = 128;
  const offscreen = document.createElement('canvas');
  offscreen.width = sampleSize;
  offscreen.height = sampleSize;
  const ctx = offscreen.getContext('2d', { willReadFrequently: true });

  if (!ctx) {
    const fallbackPreset = PRINT_PRESETS[0];
    return {
      analysis: {
        avgLuminance: 0.5,
        contrastSpread: 0.45,
        saturationAvg: 0.45,
        warmthBias: 0.1,
        shadowRatio: 0.25,
        highlightRatio: 0.25,
        recommendedPresetId: fallbackPreset.id,
        recommendedGradientId: fallbackPreset.defaultGradientId,
        summary: 'Calibração padrão aplicada com equilíbrio tonal.',
      },
      presetId: fallbackPreset.id,
      gradientId: fallbackPreset.defaultGradientId,
      calibratedParams: { ...fallbackPreset.params },
    };
  }

  ctx.drawImage(source, 0, 0, sampleSize, sampleSize);
  const { data } = ctx.getImageData(0, 0, sampleSize, sampleSize);

  const totalPixels = sampleSize * sampleSize;
  let lumSum = 0;
  let lumSqSum = 0;
  let satSum = 0;
  let warmthSum = 0;
  let shadows = 0;
  let highlights = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;

    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    lumSum += lum;
    lumSqSum += lum * lum;

    if (lum < 0.25) shadows++;
    if (lum > 0.78) highlights++;

    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const sat = maxC === 0 ? 0 : (maxC - minC) / maxC;
    satSum += sat;

    warmthSum += r - b;
  }

  const avgLuminance = lumSum / totalPixels;
  const variance = Math.max(0, lumSqSum / totalPixels - avgLuminance * avgLuminance);
  const contrastSpread = clamp(Math.sqrt(variance) * 2.6, 0, 1);
  const saturationAvg = satSum / totalPixels;
  const warmthBias = clamp((warmthSum / totalPixels) * 1.8, -1, 1);
  const shadowRatio = shadows / totalPixels;
  const highlightRatio = highlights / totalPixels;

  // Intelligent preset + palette selection based on tonal signature
  let presetId = 'editorial-classico';
  let gradientId = 'editorial-teal';
  let summary = '';

  if (shadowRatio > 0.42 && saturationAvg > 0.34) {
    // Rich dark shadows & vivid highlights -> Cassete Analógico
    presetId = 'cassete-analogico';
    gradientId = 'ciano-laranja';
    summary = 'Sombras densas e alta saturação detectadas: calibrado para contraste analógico e divisão ciano-laranja.';
  } else if (contrastSpread > 0.62 && warmthBias > 0.12) {
    // Bold warm graphic contrast -> Serigrafia 70s
    presetId = 'serigrafia-70s';
    gradientId = 'terracota-cobalto';
    summary = 'Contraste marcante com matizes quentes: otimizado para serigrafia de tinta espessa e papel fibroso.';
  } else if (saturationAvg < 0.22) {
    // Low saturation / monochrome-leaning -> Jornal Halftone
    presetId = 'jornal-halftone';
    gradientId = 'carvao-jornal';
    summary = 'Baixa saturação cromática: ajustado para retícula halftone nítida em papel jornal envelhecido.';
  } else if (highlightRatio > 0.38 && contrastSpread < 0.52) {
    // Airy high-key / soft editorial -> Editorial Clássico
    presetId = 'editorial-classico';
    gradientId = 'editorial-teal';
    summary = 'Altas luzes amplas e meio-tom suave: calibrado para impressão editorial de revista retrô.';
  } else if (warmthBias < -0.05) {
    // Cool tones -> Risografia Duotone
    presetId = 'risografia-duotone';
    gradientId = 'riso-carmim';
    summary = 'Tons frios predominantes: configurado para sobreposição risográfica em dois tambores com leve deslocamento.';
  } else {
    // Balanced photographic subject -> Filme Desbotado or Editorial
    presetId = 'editorial-classico';
    gradientId = warmthBias > 0.08 ? 'musgo-ocre' : 'editorial-teal';
    summary = 'Equilíbrio tonal versátil: textura de fibra sutil e mapeamento de tintas calibrado sem perda de detalhes.';
  }

  const basePreset = PRINT_PRESETS.find((p) => p.id === presetId) ?? PRINT_PRESETS[0];
  const calibratedParams: PrintParams = { ...basePreset.params };

  // Fine-tune parameters dynamically to respect the uploaded media's dynamic range
  if (contrastSpread > 0.72) {
    // Avoid over-crushing already high-contrast art
    calibratedParams.contrast = clamp(calibratedParams.contrast - 0.1, 0.9, 1.35);
    calibratedParams.inkWear = clamp(calibratedParams.inkWear * 0.85, 0.1, 0.7);
  } else if (contrastSpread < 0.35) {
    // Lift punch for flat/low-contrast photos
    calibratedParams.contrast = clamp(calibratedParams.contrast + 0.14, 1.0, 1.45);
    calibratedParams.halftoneAmount = clamp(calibratedParams.halftoneAmount + 0.1, 0.1, 0.85);
  }

  if (avgLuminance < 0.32) {
    // Darker media benefits from lighter paper & controlled gradient mix so details breathe
    calibratedParams.gradientMix = clamp(calibratedParams.gradientMix * 0.82, 0.25, 0.9);
    calibratedParams.vignette = clamp(calibratedParams.vignette * 0.6, 0.05, 0.4);
  }

  // Ensure gradient exists
  if (!GRADIENT_MAPS.some((g) => g.id === gradientId)) {
    gradientId = basePreset.defaultGradientId;
  }

  return {
    analysis: {
      avgLuminance,
      contrastSpread,
      saturationAvg,
      warmthBias,
      shadowRatio,
      highlightRatio,
      recommendedPresetId: presetId,
      recommendedGradientId: gradientId,
      summary,
    },
    presetId,
    gradientId,
    calibratedParams,
  };
}
