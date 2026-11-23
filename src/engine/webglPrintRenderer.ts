import { GradientMap, PrintParams, CompareMode } from '../types/print';

const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;

varying vec2 v_uv;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;

// Print Parameters
uniform float u_gradientMix;
uniform float u_halftoneAmount;
uniform float u_halftoneScale;
uniform float u_paperTexture;
uniform float u_grain;
uniform float u_inkShift;
uniform float u_inkWear;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_vignette;

// Gradient Map Colors (normalized RGB)
uniform vec3 u_shadowColor;
uniform vec3 u_midtoneColor;
uniform vec3 u_highlightColor;
uniform float u_isNatural;

// Comparison
uniform int u_compareMode; // 0 = result, 1 = original, 2 = split
uniform float u_splitPos;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    v += amp * noise2(p);
    p *= 2.04;
    amp *= 0.5;
  }
  return v;
}

vec3 adjustSaturation(vec3 color, float sat) {
  float lum = dot(color, vec3(0.299, 0.587, 0.114));
  return mix(vec3(lum), color, sat);
}

vec3 applyGradientMap(float lum) {
  float t = clamp(lum, 0.0, 1.0);
  if (t < 0.5) {
    return mix(u_shadowColor, u_midtoneColor, t * 2.0);
  }
  return mix(u_midtoneColor, u_highlightColor, (t - 0.5) * 2.0);
}

void main() {
  vec4 baseSample = texture2D(u_texture, v_uv);
  vec3 originalCol = baseSample.rgb;

  // Immediate bypass for Original view or left side of Split view
  if (u_compareMode == 1 || (u_compareMode == 2 && v_uv.x < u_splitPos)) {
    gl_FragColor = vec4(originalCol, baseSample.a);
    return;
  }

  // 1. Chromatic / Ink Plate Misregistration
  vec2 shiftVec = vec2(0.0045, 0.0028) * u_inkShift;
  float rChan = texture2D(u_texture, clamp(v_uv + shiftVec, 0.001, 0.999)).r;
  float gChan = originalCol.g;
  float bChan = texture2D(u_texture, clamp(v_uv - shiftVec, 0.001, 0.999)).b;
  vec3 shifted = vec3(rChan, gChan, bChan);

  // 2. Pre-print Contrast & Saturation Shaping
  vec3 col = (shifted - 0.5) * u_contrast + 0.5;
  col = clamp(col, 0.0, 1.0);
  col = adjustSaturation(col, u_saturation);

  // Subtle matte black lift so shadows resemble ink on paper
  col = mix(vec3(0.055, 0.05, 0.045), vec3(0.97, 0.955, 0.925), col);

  // 3. Distressed Screenprint Ink Wear (organic speckle before halftone/gradient)
  vec2 wearCoord = v_uv * vec2(u_resolution.x / max(u_resolution.y, 1.0), 1.0) * 180.0;
  float wearNoise = fbm(wearCoord * 0.35);
  float fineSpeckle = noise2(wearCoord * 1.9);
  float wearMask = mix(wearNoise, fineSpeckle, 0.45);

  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  // Subtle dry-ink erosion mostly in mid-to-dark ink regions
  float inkErosion = (wearMask - 0.48) * u_inkWear * 0.38;
  float shapedLum = clamp(lum + inkErosion, 0.0, 1.0);

  // 4. Angled Halftone Screen (45 degrees)
  if (u_halftoneAmount > 0.005) {
    float aspect = u_resolution.x / max(u_resolution.y, 1.0);
    vec2 aspectUv = vec2(v_uv.x * aspect, v_uv.y);
    float angle = 0.78539816; // 45 deg
    mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
    vec2 gridUv = rot * aspectUv * u_halftoneScale;
    vec2 cell = fract(gridUv) - 0.5;
    float dist = length(cell);

    // Ink dot radius grows where luminance is darker
    float darkness = clamp(1.0 - shapedLum, 0.0, 1.0);
    float dotRadius = sqrt(darkness) * 0.64;
    float edgeSoftness = clamp(1.2 / max(u_halftoneScale, 20.0) * 8.0, 0.04, 0.14);
    float dotMask = smoothstep(dotRadius - edgeSoftness, dotRadius + edgeSoftness, dist);

    // Halftone mixes paper highlight vs ink density
    float halftoneLum = mix(0.08, 0.96, dotMask);
    shapedLum = mix(shapedLum, halftoneLum, u_halftoneAmount * 0.78);
    col = mix(col, vec3(halftoneLum), u_halftoneAmount * 0.35);
  }

  // 5. Gradient Map (3-stop ink palette)
  vec3 mappedCol = applyGradientMap(shapedLum);
  float effectiveMix = u_isNatural > 0.5 ? (u_gradientMix * 0.18) : u_gradientMix;
  vec3 printed = mix(col, mappedCol, effectiveMix);

  // Subtle ink distress bleed in color
  if (u_inkWear > 0.01) {
    float bleed = (fineSpeckle - 0.5) * u_inkWear * 0.16;
    printed = clamp(printed + bleed * (u_highlightColor - u_shadowColor) * 0.35, 0.0, 1.0);
  }

  // 6. Procedural Archival Paper Texture (fibers + warm pulp mottling)
  if (u_paperTexture > 0.005) {
    vec2 paperUv = v_uv * vec2(u_resolution.x / max(u_resolution.y, 1.0), 1.0);
    float pulp = fbm(paperUv * 42.0);
    float fiberH = noise2(vec2(paperUv.x * 260.0, paperUv.y * 28.0));
    float fiberV = noise2(vec2(paperUv.x * 28.0, paperUv.y * 260.0));
    float fiber = (fiberH + fiberV) * 0.5;
    float paperPattern = mix(pulp, fiber, 0.45);
    float paperFactor = mix(1.0, 0.86 + paperPattern * 0.22, u_paperTexture);
    printed *= paperFactor;
  }

  // 7. Organic Film / Print Grain (frame-quantized u_time for authentic video cadence)
  if (u_grain > 0.005) {
    float g1 = hash12(gl_FragCoord.xy + vec2(u_time * 131.7, u_time * 57.3));
    float g2 = hash12(gl_FragCoord.xy * 0.5 + vec2(u_time * 29.1, u_time * 91.7));
    float grainVal = ((g1 + g2) * 0.5 - 0.5) * u_grain * 0.22;
    printed = clamp(printed + grainVal, 0.0, 1.0);
  }

  // 8. Subtle Edge Vignette
  if (u_vignette > 0.005) {
    vec2 centered = v_uv - 0.5;
    float distSq = dot(centered, centered);
    float vig = 1.0 - smoothstep(0.18, 0.72, distSq) * u_vignette * 0.65;
    printed *= vig;
  }

  gl_FragColor = vec4(clamp(printed, 0.0, 1.0), baseSample.a);
}
`;

function hexToVec3(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0');
  const num = parseInt(full, 16);
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;
  return [r, g, b];
}

export class WebGLPrintRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private texture: WebGLTexture;
  private positionBuffer: WebGLBuffer;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', {
      preserveDrawingBuffer: true,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    if (!gl) {
      throw new Error('WebGL não suportado neste navegador.');
    }
    this.gl = gl;

    const vs = this.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);

    const program = gl.createProgram();
    if (!program) throw new Error('Falha ao criar programa WebGL.');
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      throw new Error(`Erro no shader WebGL: ${info}`);
    }
    this.program = program;
    gl.useProgram(program);

    // Full-screen quad
    const posBuf = gl.createBuffer();
    if (!posBuf) throw new Error('Falha ao alocar buffer WebGL.');
    this.positionBuffer = posBuf;
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const posLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    // Create texture
    const tex = gl.createTexture();
    if (!tex) throw new Error('Falha ao criar textura WebGL.');
    this.texture = tex;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const uniformNames = [
      'u_texture',
      'u_resolution',
      'u_time',
      'u_gradientMix',
      'u_halftoneAmount',
      'u_halftoneScale',
      'u_paperTexture',
      'u_grain',
      'u_inkShift',
      'u_inkWear',
      'u_contrast',
      'u_saturation',
      'u_vignette',
      'u_shadowColor',
      'u_midtoneColor',
      'u_highlightColor',
      'u_isNatural',
      'u_compareMode',
      'u_splitPos',
    ];
    for (const name of uniformNames) {
      this.uniforms[name] = gl.getUniformLocation(program, name);
    }
  }

  private compileShader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Falha ao criar shader.');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const err = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Erro ao compilar shader: ${err}`);
    }
    return shader;
  }

  public uploadSource(
    source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
  ): void {
    if (this.disposed) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  public render(options: {
    width: number;
    height: number;
    params: PrintParams;
    gradient: GradientMap;
    time: number;
    compareMode: CompareMode;
    splitPos: number;
  }): number {
    if (this.disposed) return 0;
    const t0 = performance.now();
    const gl = this.gl;

    if (this.canvas.width !== options.width || this.canvas.height !== options.height) {
      this.canvas.width = options.width;
      this.canvas.height = options.height;
    }

    gl.viewport(0, 0, options.width, options.height);
    gl.useProgram(this.program);

    gl.uniform1i(this.uniforms.u_texture, 0);
    gl.uniform2f(this.uniforms.u_resolution, options.width, options.height);
    gl.uniform1f(this.uniforms.u_time, options.time);

    const { params, gradient } = options;
    gl.uniform1f(this.uniforms.u_gradientMix, params.gradientMix);
    gl.uniform1f(this.uniforms.u_halftoneAmount, params.halftoneAmount);
    gl.uniform1f(this.uniforms.u_halftoneScale, params.halftoneScale);
    gl.uniform1f(this.uniforms.u_paperTexture, params.paperTexture);
    gl.uniform1f(this.uniforms.u_grain, params.grain);
    gl.uniform1f(this.uniforms.u_inkShift, params.inkShift);
    gl.uniform1f(this.uniforms.u_inkWear, params.inkWear);
    gl.uniform1f(this.uniforms.u_contrast, params.contrast);
    gl.uniform1f(this.uniforms.u_saturation, params.saturation);
    gl.uniform1f(this.uniforms.u_vignette, params.vignette);

    const [sr, sg, sb] = hexToVec3(gradient.shadow);
    const [mr, mg, mb] = hexToVec3(gradient.midtone);
    const [hr, hg, hb] = hexToVec3(gradient.highlight);

    gl.uniform3f(this.uniforms.u_shadowColor, sr, sg, sb);
    gl.uniform3f(this.uniforms.u_midtoneColor, mr, mg, mb);
    gl.uniform3f(this.uniforms.u_highlightColor, hr, hg, hb);
    gl.uniform1f(this.uniforms.u_isNatural, gradient.isNatural ? 1.0 : 0.0);

    const modeInt =
      options.compareMode === 'original' ? 1 : options.compareMode === 'split' ? 2 : 0;
    gl.uniform1i(this.uniforms.u_compareMode, modeInt);
    gl.uniform1f(this.uniforms.u_splitPos, options.splitPos);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    return performance.now() - t0;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    gl.deleteTexture(this.texture);
    gl.deleteBuffer(this.positionBuffer);
    gl.deleteProgram(this.program);
  }
}
