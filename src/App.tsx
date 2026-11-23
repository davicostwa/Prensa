import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { StepAnalyze } from './components/StepAnalyze';
import { StepStudio } from './components/StepStudio';
import { StepUpload } from './components/StepUpload';
import {
  DEFAULT_PRINT_PARAMS,
  GRADIENT_MAPS,
  PRINT_PRESETS,
  SampleAsset,
} from './data/presets';
import { analyzeMediaSource } from './engine/mediaAnalyzer';
import { SampleMotionGenerator } from './engine/sampleMotionGenerator';
import {
  GradientMap,
  JourneyStep,
  MediaAnalysis,
  MediaSource,
  PrintParams,
} from './types/print';

export default function App() {
  const [step, setStep] = useState<JourneyStep>('upload');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [media, setMedia] = useState<MediaSource | null>(null);
  const [previewThumbUrl, setPreviewThumbUrl] = useState<string | null>(null);
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [motionGen, setMotionGen] = useState<SampleMotionGenerator | null>(null);

  const [analysis, setAnalysis] = useState<MediaAnalysis | null>(null);
  const [activePresetId, setActivePresetId] = useState<string>(PRINT_PRESETS[0].id);
  const [activeGradientId, setActiveGradientId] = useState<string>(
    PRINT_PRESETS[0].defaultGradientId
  );
  const [customGradient, setCustomGradient] = useState<GradientMap>(() => {
    const base = GRADIENT_MAPS.find((g) => g.id === 'custom') ?? GRADIENT_MAPS[0];
    return { ...base, isNatural: false };
  });
  const [params, setParams] = useState<PrintParams>({ ...DEFAULT_PRINT_PARAMS });

  const activeObjectUrlRef = useRef<string | null>(null);

  const revokeActiveUrl = useCallback(() => {
    if (activeObjectUrlRef.current) {
      URL.revokeObjectURL(activeObjectUrlRef.current);
      activeObjectUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => revokeActiveUrl();
  }, [revokeActiveUrl]);

  const resetToUpload = useCallback(() => {
    if (videoEl) {
      videoEl.pause();
      videoEl.removeAttribute('src');
      videoEl.load();
    }
    revokeActiveUrl();
    setMedia(null);
    setPreviewThumbUrl(null);
    setImageEl(null);
    setVideoEl(null);
    setMotionGen(null);
    setAnalysis(null);
    setErrorMessage(null);
    setStep('upload');
  }, [videoEl, revokeActiveUrl]);

  const runIntelligentCalibration = useCallback(
    (sourceEl: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement) => {
      const result = analyzeMediaSource(sourceEl);
      setAnalysis(result.analysis);
      setActivePresetId(result.presetId);
      setActiveGradientId(result.gradientId);
      setParams({ ...result.calibratedParams });
    },
    []
  );

  const startImageFlow = useCallback(
    (url: string, name: string, isObjectUrl: boolean) => {
      setErrorMessage(null);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (videoEl) {
          videoEl.pause();
        }
        setVideoEl(null);
        setMotionGen(null);
        setImageEl(img);
        setPreviewThumbUrl(url);
        setMedia({
          id: `${name}-${Date.now()}`,
          name,
          kind: 'image',
          url,
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
        });
        runIntelligentCalibration(img);
        setStep('analyze');
      };
      img.onerror = () => {
        if (isObjectUrl) revokeActiveUrl();
        setErrorMessage('Não foi possível ler esta imagem. Tente um arquivo PNG, JPG ou WebP.');
      };
      img.src = url;
    },
    [videoEl, revokeActiveUrl, runIntelligentCalibration]
  );

  const startVideoFlow = useCallback(
    (url: string, name: string) => {
      setErrorMessage(null);
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;
      video.loop = true;

      let settled = false;

      const captureAndStart = () => {
        if (settled) return;
        settled = true;

        // Grab crisp first frame thumbnail for Step 2
        let thumbUrl: string | null = null;
        try {
          const thumbCanvas = document.createElement('canvas');
          thumbCanvas.width = 320;
          thumbCanvas.height = Math.max(
            180,
            Math.round((320 * (video.videoHeight || 540)) / (video.videoWidth || 960))
          );
          const ctx = thumbCanvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, thumbCanvas.width, thumbCanvas.height);
            thumbUrl = thumbCanvas.toDataURL('image/jpeg', 0.85);
          }
        } catch {
          thumbUrl = null;
        }

        setImageEl(null);
        setMotionGen(null);
        setVideoEl(video);
        setPreviewThumbUrl(thumbUrl);
        setMedia({
          id: `${name}-${Date.now()}`,
          name,
          kind: 'video',
          url,
          width: video.videoWidth || 1280,
          height: video.videoHeight || 720,
          duration: Number.isFinite(video.duration) ? video.duration : 10,
        });
        runIntelligentCalibration(video);
        setStep('analyze');
      };

      video.onloadeddata = () => {
        if (video.readyState >= 2) {
          captureAndStart();
        }
      };

      video.onerror = () => {
        if (settled) return;
        settled = true;
        revokeActiveUrl();
        setErrorMessage('Não foi possível reproduzir este vídeo. Tente MP4 ou WebM.');
      };

      video.src = url;
      video.load();
    },
    [revokeActiveUrl, runIntelligentCalibration]
  );

  const startMotionSampleFlow = useCallback(() => {
    setErrorMessage(null);
    revokeActiveUrl();
    if (videoEl) {
      videoEl.pause();
    }
    const gen = new SampleMotionGenerator(960, 640);
    gen.renderAt(1.4);
    const thumbUrl = gen.canvas.toDataURL('image/jpeg', 0.88);

    setImageEl(null);
    setVideoEl(null);
    setMotionGen(gen);
    setPreviewThumbUrl(thumbUrl);
    setMedia({
      id: `motion-sample-${Date.now()}`,
      name: 'retro-motion-loop.mp4',
      kind: 'motion-sample',
      url: 'procedural://motion-loop',
      width: 960,
      height: 640,
      duration: gen.duration,
    });
    runIntelligentCalibration(gen.canvas);
    setStep('analyze');
  }, [videoEl, revokeActiveUrl, runIntelligentCalibration]);

  const handleSelectFile = useCallback(
    (file: File) => {
      revokeActiveUrl();
      const objectUrl = URL.createObjectURL(file);
      activeObjectUrlRef.current = objectUrl;

      if (file.type.startsWith('image/')) {
        startImageFlow(objectUrl, file.name, true);
      } else if (file.type.startsWith('video/')) {
        startVideoFlow(objectUrl, file.name);
      } else {
        revokeActiveUrl();
        setErrorMessage('Formato não suportado. Envie uma imagem ou vídeo (MP4/WebM/MOV).');
      }
    },
    [revokeActiveUrl, startImageFlow, startVideoFlow]
  );

  const handleSelectSample = useCallback(
    (sample: SampleAsset) => {
      revokeActiveUrl();
      if (sample.kind === 'motion-sample') {
        startMotionSampleFlow();
      } else {
        startImageFlow(sample.url, sample.name, false);
      }
    },
    [revokeActiveUrl, startMotionSampleFlow, startImageFlow]
  );

  const handleAnalysisComplete = useCallback(() => {
    setStep('studio');
  }, []);

  const handleSelectPreset = useCallback((presetId: string) => {
    const preset = PRINT_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setActivePresetId(preset.id);
    setActiveGradientId(preset.defaultGradientId);
    setParams({ ...preset.params });
  }, []);

  const handleSelectGradient = useCallback((gradientId: string) => {
    setActiveGradientId(gradientId);
  }, []);

  const handleChangeCustomGradient = useCallback((patch: Partial<GradientMap>) => {
    setCustomGradient((prev) => ({
      ...prev,
      ...patch,
      id: 'custom',
      isNatural: false,
    }));
  }, []);

  const handleChangeParam = useCallback(
    <K extends keyof PrintParams>(key: K, value: PrintParams[K]) => {
      setParams((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const handleResetPreset = useCallback(() => {
    const preset = PRINT_PRESETS.find((p) => p.id === activePresetId) ?? PRINT_PRESETS[0];
    setParams({ ...preset.params });
    setActiveGradientId(preset.defaultGradientId);
  }, [activePresetId]);

  const handleReanalyze = useCallback(() => {
    if (media?.kind === 'image' && imageEl) {
      runIntelligentCalibration(imageEl);
    } else if (media?.kind === 'video' && videoEl) {
      runIntelligentCalibration(videoEl);
    } else if (media?.kind === 'motion-sample' && motionGen) {
      runIntelligentCalibration(motionGen.canvas);
    }
  }, [media, imageEl, videoEl, motionGen, runIntelligentCalibration]);

  const activePresetName = useMemo(
    () => PRINT_PRESETS.find((p) => p.id === activePresetId)?.name ?? 'Serigrafia 70s',
    [activePresetId]
  );
  const activeGradientName = useMemo(
    () => GRADIENT_MAPS.find((g) => g.id === activeGradientId)?.name ?? 'Terracota & Cobalto',
    [activeGradientId]
  );

  return (
    <div className="flex min-h-screen flex-col bg-[#F7F7F5] text-[#141413]">
      {/* Clean 3-Zone Top Bar */}
      <header className="flex items-center justify-between gap-8 border-b border-[#E4E2DC] bg-white/90 px-6 py-3.5 backdrop-blur-sm">
        {/* Zone 1: Single-element Brand Wordmark */}
        <button
          type="button"
          onClick={resetToUpload}
          className="font-display text-lg font-bold tracking-tight text-[#141413] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E40AF]"
        >
          Prensa
        </button>

        {/* Zone 2: Minimalist Step Breadcrumb */}
        <nav
          aria-label="Etapas da jornada"
          className="hidden items-center gap-4 text-xs font-medium sm:flex"
        >
          <button
            type="button"
            onClick={resetToUpload}
            className={`whitespace-nowrap shrink-0 transition-colors ${
              step === 'upload'
                ? 'font-semibold text-[#141413]'
                : 'text-[#6B6860] hover:text-[#141413]'
            }`}
          >
            01. Mídia
          </button>
          <span className="text-[#CFCBC2]" aria-hidden="true">
            ·
          </span>
          <span
            className={`whitespace-nowrap shrink-0 ${
              step === 'analyze' ? 'font-semibold text-[#141413]' : 'text-[#8C887E]'
            }`}
          >
            02. Análise
          </span>
          <span className="text-[#CFCBC2]" aria-hidden="true">
            ·
          </span>
          <span
            className={`whitespace-nowrap shrink-0 ${
              step === 'studio' ? 'font-semibold text-[#141413]' : 'text-[#8C887E]'
            }`}
          >
            03. Estúdio
          </span>
        </nav>

        {/* Zone 3: Single Contextual Action */}
        <div className="flex items-center shrink-0">
          {step !== 'upload' ? (
            <button
              type="button"
              onClick={resetToUpload}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E4E2DC] bg-white px-3.5 py-1.5 text-xs font-medium text-[#141413] transition-colors hover:border-[#141413] whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Trocar mídia
            </button>
          ) : (
            <span className="text-xs text-[#6B6860] whitespace-nowrap shrink-0">
              Imagem &amp; Vídeo
            </span>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex flex-1 flex-col">
        {step === 'upload' && (
          <StepUpload
            onSelectFile={handleSelectFile}
            onSelectSample={handleSelectSample}
            errorMessage={errorMessage}
          />
        )}

        {step === 'analyze' && media && (
          <StepAnalyze
            media={media}
            previewThumbUrl={previewThumbUrl}
            analysis={analysis}
            presetName={activePresetName}
            gradientName={activeGradientName}
            onComplete={handleAnalysisComplete}
          />
        )}

        {step === 'studio' && media && (
          <StepStudio
            media={media}
            imageEl={imageEl}
            videoEl={videoEl}
            motionGen={motionGen}
            analysis={analysis}
            activePresetId={activePresetId}
            activeGradientId={activeGradientId}
            customGradient={customGradient}
            params={params}
            onSelectPreset={handleSelectPreset}
            onSelectGradient={handleSelectGradient}
            onChangeCustomGradient={handleChangeCustomGradient}
            onChangeParam={handleChangeParam}
            onResetPreset={handleResetPreset}
            onReanalyze={handleReanalyze}
          />
        )}
      </main>
    </div>
  );
}
