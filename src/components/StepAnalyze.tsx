import React, { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { MediaAnalysis, MediaSource } from '../types/print';

interface StepAnalyzeProps {
  media: MediaSource;
  previewThumbUrl: string | null;
  analysis: MediaAnalysis | null;
  presetName: string;
  gradientName: string;
  onComplete: () => void;
}

const CALIBRATION_STAGES = [
  'Leitura de luminância e amplitude dinâmica',
  'Mapeamento cromático e contraste de sombras',
  'Calibração inteligente de preset, papel e tintas',
];

export const StepAnalyze: React.FC<StepAnalyzeProps> = ({
  media,
  previewThumbUrl,
  analysis,
  presetName,
  gradientName,
  onComplete,
}) => {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    setStageIndex(0);
    const t1 = window.setTimeout(() => setStageIndex(1), 280);
    const t2 = window.setTimeout(() => setStageIndex(2), 580);
    const t3 = window.setTimeout(() => setStageIndex(3), 900);
    const tDone = window.setTimeout(() => onComplete(), 1200);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.clearTimeout(tDone);
    };
  }, [media.id, onComplete]);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center px-6 py-14">
      <div className="w-full rounded-2xl border border-[#E4E2DC] bg-white p-6 md:p-8">
        <div className="flex items-center gap-4">
          <div className="h-16 w-20 shrink-0 overflow-hidden rounded-lg border border-[#E4E2DC] bg-[#EFECE6]">
            {previewThumbUrl ? (
              <img
                src={previewThumbUrl}
                alt={media.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-[#6B6860]">
                Mídia
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-semibold text-[#141413]">
              Calibrando impressão retrô
            </h2>
            <p className="mt-0.5 truncate text-xs text-[#6B6860]">
              {media.name} ·{' '}
              <span className="font-mono-tabular">
                {media.width}×{media.height}
              </span>
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-3 border-t border-[#EEECE6] pt-5">
          {CALIBRATION_STAGES.map((label, idx) => {
            const done = stageIndex > idx;
            const active = stageIndex === idx;
            return (
              <div key={label} className="flex items-center gap-3 text-sm">
                <div
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors ${
                    done
                      ? 'bg-[#141413] text-white'
                      : active
                      ? 'bg-[#EFF4FF] text-[#1E40AF]'
                      : 'bg-[#F3F1EC] text-[#9A968D]'
                  }`}
                >
                  {done ? (
                    <Check className="h-3 w-3" />
                  ) : active ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <span className="font-mono-tabular text-[10px]">{idx + 1}</span>
                  )}
                </div>
                <span
                  className={
                    done || active ? 'font-medium text-[#141413]' : 'text-[#8C887E]'
                  }
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        {analysis && stageIndex >= 2 && (
          <div className="mt-5 border-t border-[#EEECE6] pt-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#5E5C56]">
              <span>
                Preset: <strong className="text-[#141413]">{presetName}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Paleta: <strong className="text-[#141413]">{gradientName}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular">
                Contraste {Math.round(analysis.contrastSpread * 100)}%
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
