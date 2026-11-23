import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Video,
  Volume2,
  VolumeX,
  Square,
} from 'lucide-react';
import { GRADIENT_MAPS, PRINT_PRESETS } from '../data/presets';
import { SampleMotionGenerator } from '../engine/sampleMotionGenerator';
import { WebGLPrintRenderer } from '../engine/webglPrintRenderer';
import {
  CompareMode,
  GradientMap,
  MediaAnalysis,
  MediaSource,
  PrintParams,
  TargetFps,
} from '../types/print';

interface StepStudioProps {
  media: MediaSource;
  imageEl: HTMLImageElement | null;
  videoEl: HTMLVideoElement | null;
  motionGen: SampleMotionGenerator | null;
  analysis: MediaAnalysis | null;
  activePresetId: string;
  activeGradientId: string;
  customGradient: GradientMap;
  params: PrintParams;
  onSelectPreset: (presetId: string) => void;
  onSelectGradient: (gradientId: string) => void;
  onChangeCustomGradient: (patch: Partial<GradientMap>) => void;
  onChangeParam: <K extends keyof PrintParams>(key: K, value: PrintParams[K]) => void;
  onResetPreset: () => void;
  onReanalyze: () => void;
}

type PanelTab = 'presets' | 'gradient' | 'params';

const FPS_OPTIONS: TargetFps[] = [15, 24, 30, 60];

function formatSeconds(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
  const mins = Math.floor(sec / 60);
  const secs = Math.floor(sec % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const StepStudio: React.FC<StepStudioProps> = ({
  media,
  imageEl,
  videoEl,
  motionGen,
  analysis,
  activePresetId,
  activeGradientId,
  customGradient,
  params,
  onSelectPreset,
  onSelectGradient,
  onChangeCustomGradient,
  onChangeParam,
  onResetPreset,
  onReanalyze,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<WebGLPrintRenderer | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const [activeTab, setActiveTab] = useState<PanelTab>('presets');
  const [compareMode, setCompareMode] = useState<CompareMode>('result');
  const [splitPos, setSplitPos] = useState(0.5);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);

  // Video / Motion playback state
  const isMotion = media.kind === 'video' || media.kind === 'motion-sample';
  const [isPlaying, setIsPlaying] = useState(true);
  const [targetFps, setTargetFps] = useState<TargetFps>(30);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(media.duration ?? 10);
  const [isMuted, setIsMuted] = useState(true);
  const [latencyMs, setLatencyMs] = useState<number>(0);

  // Recording state for processed video export
  const [isRecording, setIsRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordStopTimeoutRef = useRef<number | null>(null);

  // Compute working render dimensions (capped at 1600px on longest side for crisp <2ms GPU frames)
  const renderDimensions = useMemo(() => {
    const maxDim = isMotion ? 1280 : 1800;
    const w = Math.max(1, media.width);
    const h = Math.max(1, media.height);
    const scale = Math.min(1, maxDim / Math.max(w, h));
    // Ensure even dimensions for video encoders
    const rw = Math.max(2, Math.round((w * scale) / 2) * 2);
    const rh = Math.max(2, Math.round((h * scale) / 2) * 2);
    return { width: rw, height: rh };
  }, [media.width, media.height, isMotion]);

  const activeGradient = useMemo(() => {
    if (activeGradientId === 'custom') return customGradient;
    return GRADIENT_MAPS.find((g) => g.id === activeGradientId) ?? GRADIENT_MAPS[0];
  }, [activeGradientId, customGradient]);

  // Refs for latest state inside rAF render loop
  const latestStateRef = useRef({
    params,
    activeGradient,
    compareMode,
    splitPos,
    targetFps,
    isPlaying,
  });
  latestStateRef.current = {
    params,
    activeGradient,
    compareMode,
    splitPos,
    targetFps,
    isPlaying,
  };

  const motionClockRef = useRef(0);

  // Initialize WebGL renderer once canvas mounts
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new WebGLPrintRenderer(canvas);
    rendererRef.current = renderer;

    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  // Upload static image source when media changes
  useEffect(() => {
    if (media.kind !== 'image' || !imageEl || !rendererRef.current) return;
    rendererRef.current.uploadSource(imageEl);
    const ms = rendererRef.current.render({
      width: renderDimensions.width,
      height: renderDimensions.height,
      params,
      gradient: activeGradient,
      time: 0.5,
      compareMode,
      splitPos,
    });
    setLatencyMs(ms);
  }, [media.id, media.kind, imageEl, renderDimensions]);

  // Re-render static image immediately whenever any parameter changes
  useEffect(() => {
    if (media.kind !== 'image' || !imageEl || !rendererRef.current) return;
    const ms = rendererRef.current.render({
      width: renderDimensions.width,
      height: renderDimensions.height,
      params,
      gradient: activeGradient,
      time: 0.5,
      compareMode,
      splitPos,
    });
    setLatencyMs(ms);
  }, [media.kind, imageEl, renderDimensions, params, activeGradient, compareMode, splitPos]);

  // Sync HTMLVideoElement playback & loop
  useEffect(() => {
    if (media.kind !== 'video' || !videoEl) return;
    videoEl.loop = true;
    videoEl.muted = isMuted;
    videoEl.playsInline = true;
    setDuration(Number.isFinite(videoEl.duration) ? videoEl.duration : 10);

    if (isPlaying) {
      videoEl.play().catch(() => {
        setIsPlaying(false);
      });
    } else {
      videoEl.pause();
    }
  }, [media.kind, media.id, videoEl, isPlaying, isMuted]);

  // Real-time low-latency frame processing loop for Video & Motion
  useEffect(() => {
    if (!isMotion) return;

    let rafId = 0;
    let lastProcessedWall = 0;
    let lastLoopTick = performance.now();
    let frameIndex = 0;

    const processFrame = (now: number) => {
      rafId = window.requestAnimationFrame(processFrame);

      const {
        params: curParams,
        activeGradient: curGrad,
        compareMode: curMode,
        splitPos: curSplit,
        targetFps: curFps,
        isPlaying: playing,
      } = latestStateRef.current;

      const renderer = rendererRef.current;
      if (!renderer) return;

      const minInterval = 1000 / curFps;
      const elapsedSinceFrame = now - lastProcessedWall;

      // Throttle upload & shader pass cleanly to the selected target FPS
      if (playing && elapsedSinceFrame < minInterval * 0.92) {
        return;
      }

      const dtSec = Math.min(0.1, (now - lastLoopTick) / 1000);
      lastLoopTick = now;

      if (playing) {
        lastProcessedWall = now;
        frameIndex++;
      }

      if (media.kind === 'motion-sample' && motionGen) {
        if (playing) {
          motionClockRef.current = (motionClockRef.current + dtSec) % motionGen.duration;
          setCurrentTime(motionClockRef.current);
        }
        motionGen.renderAt(motionClockRef.current);
        renderer.uploadSource(motionGen.canvas);
      } else if (media.kind === 'video' && videoEl) {
        if (videoEl.readyState >= 2) {
          renderer.uploadSource(videoEl);
          if (playing) {
            setCurrentTime(videoEl.currentTime);
          }
        }
      }

      const drawMs = renderer.render({
        width: renderDimensions.width,
        height: renderDimensions.height,
        params: curParams,
        gradient: curGrad,
        time: (frameIndex % 1000) / Math.max(curFps, 1),
        compareMode: curMode,
        splitPos: curSplit,
      });
      setLatencyMs(drawMs);
    };

    rafId = window.requestAnimationFrame(processFrame);
    return () => window.cancelAnimationFrame(rafId);
  }, [isMotion, media.kind, media.id, videoEl, motionGen, renderDimensions]);

  // Handle video seek while paused
  const handleSeek = useCallback(
    (newTime: number) => {
      setCurrentTime(newTime);
      if (media.kind === 'motion-sample' && motionGen && rendererRef.current) {
        motionClockRef.current = newTime;
        motionGen.renderAt(newTime);
        rendererRef.current.uploadSource(motionGen.canvas);
        rendererRef.current.render({
          width: renderDimensions.width,
          height: renderDimensions.height,
          params,
          gradient: activeGradient,
          time: newTime,
          compareMode,
          splitPos,
        });
      } else if (media.kind === 'video' && videoEl) {
        videoEl.currentTime = newTime;
      }
    },
    [media.kind, motionGen, videoEl, renderDimensions, params, activeGradient, compareMode, splitPos]
  );

  // Split comparison drag handling
  const updateSplitFromClientX = useCallback((clientX: number) => {
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0.02, Math.min(0.98, (clientX - rect.left) / rect.width));
    setSplitPos(ratio);
  }, []);

  useEffect(() => {
    if (!isDraggingSplit) return;
    const onMove = (e: PointerEvent) => updateSplitFromClientX(e.clientX);
    const onUp = () => setIsDraggingSplit(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [isDraggingSplit, updateSplitFromClientX]);

  // Save current frame / image as PNG
  const handleSaveImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const baseName = media.name.replace(/\.[^/.]+$/, '');
        a.href = url;
        a.download = `${baseName}-prensa.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      },
      'image/png',
      1.0
    );
  };

  // Stop active video recording cleanly
  const stopVideoRecording = useCallback(() => {
    if (recordStopTimeoutRef.current !== null) {
      window.clearTimeout(recordStopTimeoutRef.current);
      recordStopTimeoutRef.current = null;
    }
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
  }, []);

  // Cleanup recorder on unmount
  useEffect(() => {
    return () => {
      stopVideoRecording();
    };
  }, [stopVideoRecording]);

  // Update recording progress bar
  useEffect(() => {
    if (!isRecording) return;
    const started = performance.now();
    const totalMs = Math.min(duration, 15) * 1000;
    const timer = window.setInterval(() => {
      const pct = Math.min(100, ((performance.now() - started) / totalMs) * 100);
      setRecordProgress(pct);
    }, 100);
    return () => window.clearInterval(timer);
  }, [isRecording, duration]);

  // Record processed WebGL video stream at exact Target FPS
  const handleRecordVideo = () => {
    if (isRecording) {
      stopVideoRecording();
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas || typeof canvas.captureStream !== 'function') return;

    // Restart from frame 0 for clean loop capture
    handleSeek(0);
    setIsPlaying(true);

    const stream = canvas.captureStream(targetFps);
    const preferredTypes = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    const mimeType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';

    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 })
      : new MediaRecorder(stream);

    recordedChunksRef.current = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        recordedChunksRef.current.push(ev.data);
      }
    };

    recorder.onstop = () => {
      setIsRecording(false);
      setRecordProgress(0);
      if (recordedChunksRef.current.length === 0) return;
      const blob = new Blob(recordedChunksRef.current, {
        type: mimeType || 'video/webm',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const baseName = media.name.replace(/\.[^/.]+$/, '');
      a.href = url;
      a.download = `${baseName}-prensa-${targetFps}fps.webm`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    };

    mediaRecorderRef.current = recorder;
    setIsRecording(true);
    setRecordProgress(0);
    recorder.start(250);

    // Record 1 cycle (up to 15s max automatically, user can stop anytime)
    const captureMs = Math.min(Math.max(duration, 2), 15) * 1000;
    recordStopTimeoutRef.current = window.setTimeout(() => {
      stopVideoRecording();
    }, captureMs);
  };

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-6 px-5 py-5 lg:flex-row lg:items-start lg:px-8">
      {/* LEFT / CENTER: Primary Canvas Stage */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {/* Top Stage Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Segmented Comparison Switch */}
          <div
            className="inline-flex items-center rounded-lg border border-[#E4E2DC] bg-white p-1"
            role="group"
            aria-label="Modo de visualização"
          >
            {(
              [
                { id: 'result', label: 'Resultado' },
                { id: 'split', label: 'Dividido' },
                { id: 'original', label: 'Original' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setCompareMode(item.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  compareMode === item.id
                    ? 'bg-[#141413] text-white'
                    : 'text-[#5E5C56] hover:text-[#141413]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Quiet Readout + Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="hidden font-mono-tabular text-xs text-[#6B6860] sm:inline">
              {renderDimensions.width}×{renderDimensions.height}
              {isMotion ? ` · ${targetFps} fps` : ''}
              {` · ${latencyMs.toFixed(1)} ms`}
            </span>

            <button
              type="button"
              onClick={onReanalyze}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E4E2DC] bg-white px-3 py-2 text-xs font-medium text-[#141413] transition-colors hover:border-[#141413] whitespace-nowrap shrink-0"
              title="Recalibrar automaticamente os parâmetros com base na mídia"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Reanalisar
            </button>

            {isMotion ? (
              <>
                <button
                  type="button"
                  onClick={handleSaveImage}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#E4E2DC] bg-white px-3.5 py-2 text-xs font-medium text-[#141413] transition-colors hover:border-[#141413] whitespace-nowrap shrink-0"
                >
                  <Download className="h-3.5 w-3.5" />
                  Salvar quadro
                </button>
                <button
                  type="button"
                  onClick={handleRecordVideo}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0 ${
                    isRecording
                      ? 'bg-[#B91C1C] hover:bg-[#991B1B]'
                      : 'bg-[#1E40AF] hover:bg-[#1E3A8A]'
                  }`}
                >
                  {isRecording ? (
                    <>
                      <Square className="h-3.5 w-3.5 fill-white" />
                      Parar ({Math.round(recordProgress)}%)
                    </>
                  ) : (
                    <>
                      <Video className="h-3.5 w-3.5" />
                      Gravar e salvar vídeo
                    </>
                  )}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleSaveImage}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#1E40AF] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#1E3A8A] whitespace-nowrap shrink-0"
              >
                <Download className="h-3.5 w-3.5" />
                Salvar imagem
              </button>
            )}
          </div>
        </div>

        {/* Main Canvas Viewport */}
        <div className="studio-checkerboard relative flex min-h-[380px] flex-1 items-center justify-center overflow-hidden rounded-2xl border border-[#E4E2DC] p-4 md:p-6">
          <div
            ref={stageRef}
            onPointerDown={(e) => {
              if (compareMode !== 'split') return;
              setIsDraggingSplit(true);
              updateSplitFromClientX(e.clientX);
            }}
            className={`relative flex max-h-[calc(100vh-250px)] max-w-full items-center justify-center overflow-hidden rounded-lg shadow-sm ${
              compareMode === 'split' ? 'cursor-ew-resize select-none' : ''
            }`}
            style={{
              aspectRatio: `${renderDimensions.width} / ${renderDimensions.height}`,
            }}
          >
            <canvas
              ref={canvasRef}
              width={renderDimensions.width}
              height={renderDimensions.height}
              className="block h-full w-full max-h-[calc(100vh-250px)] object-contain"
            />

            {/* Interactive Split Overlay Line */}
            {compareMode === 'split' && (
              <div
                className="pointer-events-none absolute inset-y-0 w-px bg-white shadow-[0_0_0_1px_rgba(20,20,19,0.25)]"
                style={{ left: `${splitPos * 100}%` }}
              >
                <div className="absolute top-1/2 left-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#141413]/20 bg-white text-[10px] font-semibold text-[#141413] shadow-sm">
                  ↔
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Video / Motion Transport & FPS Bar */}
        {isMotion && (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#E4E2DC] bg-white px-4 py-2.5">
            <div className="flex min-w-[200px] flex-1 items-center gap-3">
              <button
                type="button"
                onClick={() => setIsPlaying((p) => !p)}
                aria-label={isPlaying ? 'Pausar vídeo' : 'Reproduzir vídeo'}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#141413] text-white transition-colors hover:bg-[#1E40AF]"
              >
                {isPlaying ? (
                  <Pause className="h-3.5 w-3.5" />
                ) : (
                  <Play className="h-3.5 w-3.5 fill-white" />
                )}
              </button>

              <span className="font-mono-tabular text-xs text-[#5E5C56] whitespace-nowrap shrink-0">
                {formatSeconds(currentTime)} / {formatSeconds(duration)}
              </span>

              <input
                type="range"
                min={0}
                max={Math.max(duration, 0.1)}
                step={0.04}
                value={Math.min(currentTime, duration)}
                onChange={(e) => handleSeek(parseFloat(e.target.value))}
                aria-label="Linha do tempo do vídeo"
                className="studio-slider flex-1"
              />

              {media.kind === 'video' && (
                <button
                  type="button"
                  onClick={() => setIsMuted((m) => !m)}
                  aria-label={isMuted ? 'Ativar áudio' : 'Silenciar áudio'}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#E4E2DC] text-[#5E5C56] transition-colors hover:text-[#141413]"
                >
                  {isMuted ? (
                    <VolumeX className="h-3.5 w-3.5" />
                  ) : (
                    <Volume2 className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </div>

            {/* Target FPS Cadence Selector */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-[#6B6860] whitespace-nowrap">
                Cadência:
              </span>
              <div className="inline-flex items-center rounded-lg bg-[#F3F1EC] p-0.5">
                {FPS_OPTIONS.map((fps) => (
                  <button
                    key={fps}
                    type="button"
                    onClick={() => setTargetFps(fps)}
                    className={`rounded-md px-2.5 py-1 font-mono-tabular text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      targetFps === fps
                        ? 'bg-white text-[#141413] shadow-xs'
                        : 'text-[#6B6860] hover:text-[#141413]'
                    }`}
                  >
                    {fps} fps
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* RIGHT: Compact Studio Control Panel */}
      <aside className="flex w-full shrink-0 flex-col rounded-2xl border border-[#E4E2DC] bg-white lg:w-[360px]">
        {/* Panel Tabs */}
        <div className="grid grid-cols-3 border-b border-[#E4E2DC] p-1.5">
          {(
            [
              { id: 'presets', label: 'Presets' },
              { id: 'gradient', label: 'Gradient Map' },
              { id: 'params', label: 'Parâmetros' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-lg py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-[#141413] text-white'
                  : 'text-[#5E5C56] hover:text-[#141413]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Body */}
        <div className="flex flex-col p-4">
          {/* TAB 1: PRESETS */}
          {activeTab === 'presets' && (
            <div className="space-y-2.5">
              {analysis && (
                <p className="border-b border-[#EEECE6] pb-3 text-xs leading-relaxed text-[#5E5C56]">
                  {analysis.summary}
                </p>
              )}

              <div className="space-y-2 pt-0.5">
                {PRINT_PRESETS.map((preset) => {
                  const selected = activePresetId === preset.id;
                  const presetGrad =
                    GRADIENT_MAPS.find((g) => g.id === preset.defaultGradientId) ??
                    GRADIENT_MAPS[0];
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => onSelectPreset(preset.id)}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-left transition-all duration-150 ${
                        selected
                          ? 'border-[#141413] bg-[#FAF9F6]'
                          : 'border-[#E8E6E0] bg-white hover:border-[#B5B2A8]'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-[#141413]">
                          {preset.name}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-[#6B6860]">
                          {preset.subtitle}
                        </div>
                      </div>

                      {/* 3-dot ink palette preview */}
                      <div className="flex shrink-0 items-center -space-x-1">
                        {[presetGrad.shadow, presetGrad.midtone, presetGrad.highlight].map(
                          (hex, i) => (
                            <span
                              key={`${preset.id}-${i}`}
                              className="h-4 w-4 rounded-full border border-white shadow-xs"
                              style={{ backgroundColor: hex }}
                            />
                          )
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: GRADIENT MAPS */}
          {activeTab === 'gradient' && (
            <div className="space-y-4">
              {/* Mix slider directly accessible */}
              <SliderControl
                label="Intensidade do Mapa"
                value={params.gradientMix}
                min={0}
                max={1}
                step={0.01}
                displayValue={`${Math.round(params.gradientMix * 100)}%`}
                onChange={(v) => onChangeParam('gradientMix', v)}
              />

              <div className="grid grid-cols-1 gap-2 border-t border-[#EEECE6] pt-3">
                {GRADIENT_MAPS.map((grad) => {
                  const selected = activeGradientId === grad.id;
                  const displayGrad = grad.id === 'custom' ? customGradient : grad;
                  return (
                    <button
                      key={grad.id}
                      type="button"
                      onClick={() => onSelectGradient(grad.id)}
                      className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-all duration-150 ${
                        selected
                          ? 'border-[#141413] bg-[#FAF9F6]'
                          : 'border-[#E8E6E0] bg-white hover:border-[#B5B2A8]'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-[#141413]">
                          {grad.name}
                        </div>
                        <div className="truncate text-[11px] text-[#6B6860]">
                          {grad.subtitle}
                        </div>
                      </div>

                      <div
                        className="h-4 w-16 shrink-0 rounded-md border border-black/10"
                        style={{
                          background: displayGrad.isNatural
                            ? 'linear-gradient(90deg, #1E1E1E 0%, #8A8A8A 50%, #F4EFE4 100%)'
                            : `linear-gradient(90deg, ${displayGrad.shadow} 0%, ${displayGrad.midtone} 50%, ${displayGrad.highlight} 100%)`,
                        }}
                      />
                    </button>
                  );
                })}
              </div>

              {/* Custom 3-stop Ink Color Pickers */}
              <div className="border-t border-[#EEECE6] pt-3">
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#141413]">
                    Personalizar tintas
                  </span>
                  {activeGradientId !== 'custom' && (
                    <button
                      type="button"
                      onClick={() => onSelectGradient('custom')}
                      className="text-[11px] font-medium text-[#1E40AF] hover:underline"
                    >
                      Editar paleta
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { key: 'shadow', label: 'Sombras' },
                      { key: 'midtone', label: 'Meios-tons' },
                      { key: 'highlight', label: 'Papel / Luz' },
                    ] as const
                  ).map((stop) => {
                    const currentHex =
                      activeGradientId === 'custom'
                        ? customGradient[stop.key]
                        : activeGradient[stop.key];
                    return (
                      <label
                        key={stop.key}
                        className="flex cursor-pointer flex-col gap-1.5 rounded-lg border border-[#E4E2DC] p-2 hover:border-[#141413]"
                      >
                        <div className="flex items-center gap-1.5">
                          <input
                            type="color"
                            value={currentHex}
                            onChange={(e) => {
                              if (activeGradientId !== 'custom') {
                                onChangeCustomGradient({
                                  shadow: activeGradient.shadow,
                                  midtone: activeGradient.midtone,
                                  highlight: activeGradient.highlight,
                                  [stop.key]: e.target.value,
                                });
                                onSelectGradient('custom');
                              } else {
                                onChangeCustomGradient({ [stop.key]: e.target.value });
                              }
                            }}
                            className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
                          />
                          <span className="font-mono-tabular text-[11px] uppercase text-[#5E5C56]">
                            {currentHex}
                          </span>
                        </div>
                        <span className="text-[11px] text-[#6B6860]">{stop.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: REAL-TIME PARAMETERS */}
          {activeTab === 'params' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[#EEECE6] pb-2.5">
                <span className="text-xs font-medium text-[#5E5C56]">
                  Ajustes em tempo real
                </span>
                <button
                  type="button"
                  onClick={onResetPreset}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#141413] hover:text-[#1E40AF]"
                >
                  <RotateCcw className="h-3 w-3" />
                  Restaurar
                </button>
              </div>

              <div className="space-y-3.5">
                <SliderControl
                  label="Meio-tom (Halftone)"
                  value={params.halftoneAmount}
                  min={0}
                  max={1}
                  step={0.01}
                  displayValue={`${Math.round(params.halftoneAmount * 100)}%`}
                  onChange={(v) => onChangeParam('halftoneAmount', v)}
                />
                <SliderControl
                  label="Densidade da Retícula"
                  value={params.halftoneScale}
                  min={45}
                  max={210}
                  step={1}
                  displayValue={`${Math.round(params.halftoneScale)} lpi`}
                  onChange={(v) => onChangeParam('halftoneScale', v)}
                />
                <SliderControl
                  label="Textura de Papel"
                  value={params.paperTexture}
                  min={0}
                  max={1}
                  step={0.01}
                  displayValue={`${Math.round(params.paperTexture * 100)}%`}
                  onChange={(v) => onChangeParam('paperTexture', v)}
                />
                <SliderControl
                  label="Granulação (Grain)"
                  value={params.grain}
                  min={0}
                  max={1}
                  step={0.01}
                  displayValue={`${Math.round(params.grain * 100)}%`}
                  onChange={(v) => onChangeParam('grain', v)}
                />
                <SliderControl
                  label="Desgaste da Tinta"
                  value={params.inkWear}
                  min={0}
                  max={1}
                  step={0.01}
                  displayValue={`${Math.round(params.inkWear * 100)}%`}
                  onChange={(v) => onChangeParam('inkWear', v)}
                />
                <SliderControl
                  label="Desalinhamento (Riso)"
                  value={params.inkShift}
                  min={0}
                  max={1}
                  step={0.01}
                  displayValue={`${Math.round(params.inkShift * 100)}%`}
                  onChange={(v) => onChangeParam('inkShift', v)}
                />

                <div className="border-t border-[#EEECE6] pt-3 space-y-3.5">
                  <SliderControl
                    label="Contraste"
                    value={params.contrast}
                    min={0.7}
                    max={1.6}
                    step={0.01}
                    displayValue={`${Math.round(params.contrast * 100)}%`}
                    onChange={(v) => onChangeParam('contrast', v)}
                  />
                  <SliderControl
                    label="Saturação"
                    value={params.saturation}
                    min={0}
                    max={1.6}
                    step={0.01}
                    displayValue={`${Math.round(params.saturation * 100)}%`}
                    onChange={(v) => onChangeParam('saturation', v)}
                  />
                  <SliderControl
                    label="Vinheta"
                    value={params.vignette}
                    min={0}
                    max={1}
                    step={0.01}
                    displayValue={`${Math.round(params.vignette * 100)}%`}
                    onChange={(v) => onChangeParam('vignette', v)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};

interface SliderControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  onChange: (value: number) => void;
}

const SliderControl: React.FC<SliderControlProps> = ({
  label,
  value,
  min,
  max,
  step,
  displayValue,
  onChange,
}) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between text-xs">
      <span className="font-medium text-[#141413]">{label}</span>
      <span className="font-mono-tabular text-[#6B6860]">{displayValue}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="studio-slider"
    />
  </div>
);
