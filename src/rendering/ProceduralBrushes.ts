/**
 * 程序化水彩笔触与铅笔线稿图集生成器（V0.3）。
 *
 * 零外部图片依赖：在浏览器启动时用离屏 Canvas 2D 确定性生成水彩叶簇、
 * 铅笔卷曲线稿、冷压水彩纸纹、流动水波笔触、樱花花瓣与白桦树皮贴图；
 * 在无 DOM 的 Node 单测环境下自动退化为轻量 DataTexture。
 */
import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  NoColorSpace,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  UnsignedByteType,
} from "three";

export interface ProceduralBrushPack {
  readonly foliagePaint: Texture;
  readonly foliageSketch: Texture;
  readonly paperGrain: Texture;
  readonly waterStroke: Texture;
  readonly petal: Texture;
  readonly birchBark: Texture;
  dispose(): void;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeFallbackTexture(r: number, g: number, b: number, a: number, repeat = false): Texture {
  const data = new Uint8Array([r, g, b, a, r, g, b, a, r, g, b, a, r, g, b, a]);
  const tex = new DataTexture(data, 2, 2, RGBAFormat, UnsignedByteType);
  tex.wrapS = repeat ? RepeatWrapping : ClampToEdgeWrapping;
  tex.wrapT = repeat ? RepeatWrapping : ClampToEdgeWrapping;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function createCanvas(
  width: number,
  height: number,
): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  return { canvas, ctx };
}

function wrapTexture(
  canvas: HTMLCanvasElement,
  name: string,
  options: { readonly repeat?: boolean; readonly srgb?: boolean } = {},
): Texture {
  const texture = new Texture(canvas);
  texture.name = name;
  texture.colorSpace = options.srgb ? SRGBColorSpace : NoColorSpace;
  texture.wrapS = options.repeat ? RepeatWrapping : ClampToEdgeWrapping;
  texture.wrapT = options.repeat ? RepeatWrapping : ClampToEdgeWrapping;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** 1. 水彩叶簇笔触卡片：多层柔边点染、深浅颜料晕染与自然花瓣状外缘。 */
function buildFoliagePaintTexture(): Texture {
  const size = 256;
  const created = createCanvas(size, size);
  if (!created) return makeFallbackTexture(235, 235, 235, 255);
  const { canvas, ctx } = created;
  const rand = mulberry32(20260301);

  ctx.clearRect(0, 0, size, size);
  const cx = size * 0.5;
  const cy = size * 0.5;

  // 主体柔和水彩团：多层偏心半透明笔触叠出有机边缘
  for (let i = 0; i < 58; i += 1) {
    const angle = rand() * Math.PI * 2;
    const dist = Math.pow(rand(), 0.72) * 58;
    const x = cx + Math.cos(angle) * dist;
    const y = cy + Math.sin(angle) * dist * 0.92;
    const rx = 24 + rand() * 34;
    const ry = 20 + rand() * 30;
    const shade = Math.round(205 + rand() * 50);
    const alpha = 0.24 + rand() * 0.26;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rand() * Math.PI);
    ctx.scale(1, ry / rx);
    const grad = ctx.createRadialGradient(0, 0, rx * 0.12, 0, 0, rx);
    grad.addColorStop(0, `rgba(${shade}, ${shade}, ${shade}, ${alpha})`);
    grad.addColorStop(0.68, `rgba(${shade - 12}, ${shade - 12}, ${shade - 12}, ${alpha * 0.85})`);
    grad.addColorStop(1, `rgba(${shade - 20}, ${shade - 20}, ${shade - 20}, 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 外缘细小飞白点缀，模拟手绘水彩干湿过渡
  for (let i = 0; i < 24; i += 1) {
    const angle = rand() * Math.PI * 2;
    const dist = 54 + rand() * 34;
    const x = cx + Math.cos(angle) * dist;
    const y = cy + Math.sin(angle) * dist * 0.9;
    const r = 7 + rand() * 14;
    const shade = Math.round(210 + rand() * 45);
    const grad = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
    grad.addColorStop(0, `rgba(${shade}, ${shade}, ${shade}, 0.42)`);
    grad.addColorStop(1, `rgba(${shade}, ${shade}, ${shade}, 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  return wrapTexture(canvas, "v03-foliage-paint");
}

/** 2. 未显色铅笔卷曲线稿卡片：透明底 + 轻盈速写环绕线条（还原视频前段线稿树冠）。 */
function buildFoliageSketchTexture(): Texture {
  const size = 256;
  const created = createCanvas(size, size);
  if (!created) return makeFallbackTexture(80, 75, 68, 180);
  const { canvas, ctx } = created;
  const rand = mulberry32(20260302);

  ctx.clearRect(0, 0, size, size);
  const cx = size * 0.5;
  const cy = size * 0.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // 外轮廓卷曲铅笔环线
  for (let i = 0; i < 26; i += 1) {
    const baseAngle = (i / 26) * Math.PI * 2 + (rand() - 0.5) * 0.25;
    const r0 = 32 + rand() * 54;
    const r1 = r0 + (rand() - 0.5) * 26;
    const span = 0.45 + rand() * 0.65;
    const x0 = cx + Math.cos(baseAngle) * r0;
    const y0 = cy + Math.sin(baseAngle) * r0 * 0.92;
    const x1 = cx + Math.cos(baseAngle + span) * r1;
    const y1 = cy + Math.sin(baseAngle + span) * r1 * 0.92;
    const cpx = cx + Math.cos(baseAngle + span * 0.5) * (Math.max(r0, r1) + 18 + rand() * 14);
    const cpy =
      cy + Math.sin(baseAngle + span * 0.5) * (Math.max(r0, r1) + 18 + rand() * 14) * 0.92;

    const ink = Math.round(58 + rand() * 34);
    ctx.strokeStyle = `rgba(${ink}, ${ink - 4}, ${ink - 10}, ${0.42 + rand() * 0.34})`;
    ctx.lineWidth = 1.4 + rand() * 1.4;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(cpx, cpy, x1, y1);
    ctx.stroke();
  }

  // 内部疏朗交叉细枝笔触
  for (let i = 0; i < 16; i += 1) {
    const a0 = rand() * Math.PI * 2;
    const a1 = a0 + 0.8 + rand() * 1.2;
    const rad = 14 + rand() * 44;
    ctx.strokeStyle = `rgba(68, 62, 55, ${0.3 + rand() * 0.3})`;
    ctx.lineWidth = 1.1 + rand() * 1.1;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a0) * rad, cy + Math.sin(a0) * rad);
    ctx.quadraticCurveTo(
      cx + (rand() - 0.5) * 34,
      cy + (rand() - 0.5) * 34,
      cx + Math.cos(a1) * (rad * 0.85),
      cy + Math.sin(a1) * (rad * 0.85),
    );
    ctx.stroke();
  }

  return wrapTexture(canvas, "v03-foliage-sketch");
}

/** 3. 冷压水彩纸纹理：低频棉浆纤维起伏 + 细微暖纸色调。 */
function buildPaperGrainTexture(): Texture {
  const size = 256;
  const created = createCanvas(size, size);
  if (!created) return makeFallbackTexture(248, 244, 236, 255, true);
  const { canvas, ctx } = created;
  const rand = mulberry32(20260303);

  ctx.fillStyle = "#f7f3eb";
  ctx.fillRect(0, 0, size, size);

  // 柔和棉浆云斑（平铺无缝：在四周镜像绘制）
  for (let i = 0; i < 90; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 14 + rand() * 28;
    const bright = rand() > 0.5;
    const shade = bright ? "rgba(255,253,248,0.16)" : "rgba(218,208,192,0.14)";
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        if (x + ox + r < 0 || x + ox - r > size || y + oy + r < 0 || y + oy - r > size) continue;
        const g = ctx.createRadialGradient(x + ox, y + oy, 1, x + ox, y + oy, r);
        g.addColorStop(0, shade);
        g.addColorStop(1, "rgba(245,239,228,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // 极轻水平/垂直纸张纹理纤维
  for (let i = 0; i < 240; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 6 + rand() * 14;
    const horizontal = rand() > 0.45;
    ctx.strokeStyle = rand() > 0.5 ? "rgba(208,198,182,0.11)" : "rgba(255,254,250,0.14)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (horizontal ? len : 2), y + (horizontal ? 1 : len));
    ctx.stroke();
  }

  return wrapTexture(canvas, "v03-paper-grain", { repeat: true, srgb: true });
}

/** 4. 溪流水彩流动笔触：钴蓝/群青水彩条纹 + 柔白水光留白。 */
function buildWaterStrokeTexture(): Texture {
  const size = 256;
  const created = createCanvas(size, size);
  if (!created) return makeFallbackTexture(120, 165, 205, 255, true);
  const { canvas, ctx } = created;
  const rand = mulberry32(20260304);

  ctx.fillStyle = "#6e9bc4";
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 42; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const w = 48 + rand() * 96;
    const h = 5 + rand() * 14;
    const isHighlight = rand() > 0.58;
    const color = isHighlight
      ? `rgba(236, 244, 252, ${0.28 + rand() * 0.34})`
      : `rgba(54, 102, 162, ${0.26 + rand() * 0.32})`;

    for (const ox of [-size, 0, size]) {
      const grad = ctx.createLinearGradient(x + ox, y, x + ox + w, y);
      grad.addColorStop(0, "rgba(110,155,196,0)");
      grad.addColorStop(0.25, color);
      grad.addColorStop(0.75, color);
      grad.addColorStop(1, "rgba(110,155,196,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(x + ox + w * 0.5, y, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return wrapTexture(canvas, "v03-water-stroke", { repeat: true, srgb: true });
}

/** 5. 樱花花瓣轮廓贴图：柔边水彩缺口花瓣。 */
function buildPetalTexture(): Texture {
  const size = 128;
  const created = createCanvas(size, size);
  if (!created) return makeFallbackTexture(255, 210, 225, 255);
  const { canvas, ctx } = created;

  ctx.clearRect(0, 0, size, size);
  const cx = size * 0.5;
  const grad = ctx.createRadialGradient(cx, size * 0.55, 6, cx, size * 0.5, 50);
  grad.addColorStop(0, "rgba(255, 245, 248, 0.96)");
  grad.addColorStop(0.65, "rgba(250, 212, 226, 0.9)");
  grad.addColorStop(1, "rgba(240, 175, 200, 0)");

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(cx, size * 0.86);
  ctx.bezierCurveTo(size * 0.16, size * 0.68, size * 0.18, size * 0.24, cx - 7, size * 0.16);
  ctx.lineTo(cx, size * 0.24);
  ctx.lineTo(cx + 7, size * 0.16);
  ctx.bezierCurveTo(size * 0.82, size * 0.24, size * 0.84, size * 0.68, cx, size * 0.86);
  ctx.closePath();
  ctx.fill();

  return wrapTexture(canvas, "v03-petal", { srgb: true });
}

/** 6. 白桦树皮贴图：奶白底 + 横向深棕灰皮孔短纹。 */
function buildBirchBarkTexture(): Texture {
  const w = 128;
  const h = 256;
  const created = createCanvas(w, h);
  if (!created) return makeFallbackTexture(238, 234, 224, 255, true);
  const { canvas, ctx } = created;
  const rand = mulberry32(20260306);

  ctx.fillStyle = "#ece7dc";
  ctx.fillRect(0, 0, w, h);

  // 竖向极轻灰影
  for (let i = 0; i < 16; i += 1) {
    ctx.fillStyle = `rgba(195, 188, 176, ${0.12 + rand() * 0.15})`;
    ctx.fillRect(rand() * w, 0, 6 + rand() * 14, h);
  }

  // 横向黑褐桦树斑纹
  for (let i = 0; i < 42; i += 1) {
    const x = rand() * w;
    const y = rand() * h;
    const dashW = 10 + rand() * 28;
    const dashH = 2 + rand() * 4.5;
    ctx.fillStyle = `rgba(62, 54, 48, ${0.55 + rand() * 0.35})`;
    for (const ox of [-w, 0, w]) {
      ctx.beginPath();
      ctx.ellipse(x + ox, y, dashW * 0.5, dashH * 0.5, (rand() - 0.5) * 0.08, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return wrapTexture(canvas, "v03-birch-bark", { repeat: true, srgb: true });
}

export function createProceduralBrushPack(): ProceduralBrushPack {
  const foliagePaint = buildFoliagePaintTexture();
  const foliageSketch = buildFoliageSketchTexture();
  const paperGrain = buildPaperGrainTexture();
  const waterStroke = buildWaterStrokeTexture();
  const petal = buildPetalTexture();
  const birchBark = buildBirchBarkTexture();

  return {
    foliagePaint,
    foliageSketch,
    paperGrain,
    waterStroke,
    petal,
    birchBark,
    dispose(): void {
      foliagePaint.dispose();
      foliageSketch.dispose();
      paperGrain.dispose();
      waterStroke.dispose();
      petal.dispose();
      birchBark.dispose();
    },
  };
}
