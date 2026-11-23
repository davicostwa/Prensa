import React, { useRef, useState } from 'react';
import { Upload, Film, Image as ImageIcon, Play } from 'lucide-react';
import { SAMPLE_ASSETS, SampleAsset } from '../data/presets';

interface StepUploadProps {
  onSelectFile: (file: File) => void;
  onSelectSample: (sample: SampleAsset) => void;
  errorMessage: string | null;
}

export const StepUpload: React.FC<StepUploadProps> = ({
  onSelectFile,
  onSelectSample,
  errorMessage,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    onSelectFile(files[0]);
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-6 py-10 md:py-14">
      <div className="mb-8 text-center">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-[#141413] text-balance md:text-4xl">
          Impressão retrô em tempo real
        </h1>
        <p className="mt-2.5 text-sm text-[#5E5C56] md:text-base">
          Suba uma imagem ou vídeo para aplicar serigrafia, retícula e texturas de papel com baixa latência.
        </p>
      </div>

      {/* Main Dropzone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`group flex w-full cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-14 text-center transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E40AF] ${
          isDragging
            ? 'border-[#1E40AF] bg-[#EFF4FF]'
            : 'border-[#CFCBC2] bg-white hover:border-[#8C887E] hover:bg-[#FCFBF9]'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />

        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#F3F1EC] text-[#141413] transition-colors group-hover:bg-[#141413] group-hover:text-white">
          <Upload className="h-5 w-5" />
        </div>

        <p className="text-base font-medium text-[#141413]">
          Arraste sua mídia aqui ou clique para escolher
        </p>

        <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs text-[#6B6860]">
          <span className="inline-flex items-center gap-1">
            <ImageIcon className="h-3.5 w-3.5" />
            PNG, JPG, WebP
          </span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">
            <Film className="h-3.5 w-3.5" />
            MP4, WebM, MOV
          </span>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            inputRef.current?.click();
          }}
          className="mt-6 rounded-lg bg-[#141413] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1E40AF] whitespace-nowrap shrink-0"
        >
          Selecionar arquivo
        </button>
      </div>

      {errorMessage && (
        <p className="mt-4 text-sm font-medium text-[#B91C1C]" role="alert">
          {errorMessage}
        </p>
      )}

      {/* Quick samples */}
      <div className="mt-10 w-full">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-medium text-[#6B6860]">
            Ou testar instantaneamente com amostras
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SAMPLE_ASSETS.map((sample) => (
            <button
              key={sample.id}
              type="button"
              onClick={() => onSelectSample(sample)}
              className="group flex flex-col overflow-hidden rounded-xl border border-[#E4E2DC] bg-white text-left transition-all duration-150 hover:border-[#141413] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E40AF]"
            >
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#EAE6DD]">
                {sample.kind === 'image' ? (
                  <img
                    src={sample.url}
                    alt={sample.label}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center bg-[#181B20] text-white">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 transition-transform duration-200 group-hover:scale-110">
                      <Play className="h-4 w-4 fill-white text-white" />
                    </div>
                    <span className="mt-2 font-mono-tabular text-[11px] text-white/75">
                      10s · 24–60 fps
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between px-3 py-2">
                <span className="truncate text-xs font-medium text-[#141413]">
                  {sample.label}
                </span>
                <span className="text-[11px] text-[#6B6860]">
                  {sample.kind === 'image' ? 'IMG' : 'VID'}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
