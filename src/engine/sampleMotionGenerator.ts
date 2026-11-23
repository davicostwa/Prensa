/**
 * Procedural retro-editorial kinetic motion canvas source (10s seamless loop).
 * Allows users to immediately test real-time low-latency frame-by-frame
 * video print effects at 15/24/30/60 FPS without needing a local video file.
 */
export class SampleMotionGenerator {
  public readonly canvas: HTMLCanvasElement;
  public readonly duration = 10; // seconds loop
  private ctx: CanvasRenderingContext2D;

  constructor(width = 960, height = 640) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not create 2D context for sample motion.');
    }
    this.ctx = ctx;
    this.renderAt(0);
  }

  public renderAt(timeSeconds: number): void {
    const t = ((timeSeconds % this.duration) + this.duration) % this.duration;
    const phase = (t / this.duration) * Math.PI * 2;
    const { width: w, height: h } = this.canvas;
    const ctx = this.ctx;

    // 1. Clean warm architectural gradient backdrop
    const bgGrad = ctx.createLinearGradient(0, 0, w, h);
    bgGrad.addColorStop(0, '#E9E2D0');
    bgGrad.addColorStop(0.55, '#DFD4BC');
    bgGrad.addColorStop(1, '#CBBFA6');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // 2. Sweeping horizon / modernist architectural bands
    ctx.save();
    const horizonY = h * 0.62 + Math.sin(phase) * 14;
    ctx.fillStyle = '#1D3342';
    ctx.fillRect(0, horizonY, w, h - horizonY);

    // Subtle perspective road/stripes
    ctx.fillStyle = '#D85A2A';
    for (let i = 0; i < 6; i++) {
      const progress = ((i / 6 + t / 4) % 1);
      const y = horizonY + Math.pow(progress, 1.85) * (h - horizonY);
      const thickness = 3 + progress * 14;
      ctx.globalAlpha = 0.25 + progress * 0.75;
      ctx.fillRect(0, y, w, thickness);
    }
    ctx.restore();

    // 3. Orbiting solar disc with crisp shading
    const sunX = w * 0.34 + Math.cos(phase) * 95;
    const sunY = h * 0.36 + Math.sin(phase * 2) * 32;
    const sunR = 112;

    const sunGrad = ctx.createRadialGradient(
      sunX - 28,
      sunY - 28,
      14,
      sunX,
      sunY,
      sunR
    );
    sunGrad.addColorStop(0, '#F7E7C4');
    sunGrad.addColorStop(0.45, '#E46A2E');
    sunGrad.addColorStop(1, '#9E2B1C');

    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
    ctx.fillStyle = sunGrad;
    ctx.fill();

    // 4. Spinning vinyl/mechanical wheel motif on right
    const wheelX = w * 0.69;
    const wheelY = h * 0.43;
    const wheelR = 148;

    ctx.save();
    ctx.translate(wheelX, wheelY);
    ctx.rotate(phase * 2);

    ctx.beginPath();
    ctx.arc(0, 0, wheelR, 0, Math.PI * 2);
    ctx.fillStyle = '#16191D';
    ctx.fill();

    // Concentric grooves for halftone/print testing
    ctx.strokeStyle = '#333A42';
    ctx.lineWidth = 2;
    for (let r = 56; r < wheelR - 10; r += 10) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Specular highlight wedge
    ctx.fillStyle = 'rgba(244, 236, 218, 0.22)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, wheelR - 4, -0.35, 0.2);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, wheelR - 4, Math.PI - 0.35, Math.PI + 0.2);
    ctx.closePath();
    ctx.fill();

    // Inner label
    ctx.beginPath();
    ctx.arc(0, 0, 50, 0, Math.PI * 2);
    ctx.fillStyle = '#2BB3C0';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#F2ECE1';
    ctx.fill();
    ctx.restore();

    // 5. Bold kinetic editorial typography
    ctx.save();
    ctx.fillStyle = '#151514';
    ctx.font = '700 66px Archivo, sans-serif';
    ctx.textBaseline = 'top';
    const slideX = Math.sin(phase) * 28;
    ctx.fillText('PRENSA', 56 + slideX, 48);

    ctx.fillStyle = '#C94420';
    ctx.font = '700 66px Archivo, sans-serif';
    ctx.fillText('MOTION', 56 - slideX * 0.6, 114);

    // Clean editorial index line
    ctx.fillStyle = '#1E2832';
    ctx.font = '500 18px "JetBrains Mono", monospace';
    ctx.fillText(`QUADRO ${String(Math.floor(t * 24)).padStart(3, '0')}  /  LOOP 10S`, 58, h - 52);
    ctx.restore();
  }
}
