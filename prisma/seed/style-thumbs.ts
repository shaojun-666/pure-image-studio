import sharp from 'sharp';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import type { StyleCategory } from '@prisma/client';

/**
 * 风格缩略图：seed 时本地真出一张 512×512 的图，与 mock provider 同一套路子。
 *
 * 为什么不是随机光斑了事：风格画廊的全部意义就是「一眼看出这是什么风格」，
 * 33 张一模一样的随机色块等于没有缩略图。所以按 16 个分类各写一个画法。
 *
 * 两条与 explore 封面一致的硬约束：
 *   1. 不用 librsvg 滤镜（大尺寸下慢一个数量级），只用渐变 + 几何形状叠出观感
 *   2. 不画文字（seed 进程不保证装了 CJK 字体，画了就是豆腐块）
 */

/** 确定性哈希 + 线性同余：同一个 slug 每次跑都得到同一张图 */
function makeRandom(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = ((h ^ key.charCodeAt(i)) * 16777619) >>> 0;
  let s = h || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Ctx = { r: () => number; S: number; h: number; h2: number };

const rgb = (h: number, s: number, l: number) => `hsl(${Math.round(h)} ${s}% ${Math.round(l)}%)`;

/** 渐变 id 必须全局唯一：两张图坐标撞车时，同 id 会让后一个引用到前一个的颜色 */
let uid = 0;

/** 一团柔光：径向渐变圆，整张图的通用积木 */
function glow(cx: number, cy: number, rad: number, hue: number, l: number, a: number) {
  const id = `g${uid++}`;
  return `<radialGradient id="${id}"><stop offset="0%" stop-color="${rgb(hue, 80, l)}" stop-opacity="${a}"/><stop offset="100%" stop-color="${rgb(hue, 80, l)}" stop-opacity="0"/></radialGradient>
  <circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${rad.toFixed(0)}" fill="url(#${id})"/>`;
}

const vignette = (S: number, a = 0.55) =>
  `<radialGradient id="vig" cx="50%" cy="50%" r="72%"><stop offset="45%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="${a}"/></radialGradient>
  <rect width="${S}" height="${S}" fill="url(#vig)"/>`;

const base = (S: number, h: number, l: number) => `<rect width="${S}" height="${S}" fill="${rgb(h, 45, l)}"/>`;

/** 每个分类一个画法。返回 SVG 内层内容（外层 defs/背景由 thumbSvg 拼）。 */
const RECIPES: Record<StyleCategory, (c: Ctx) => string> = {
  // 赛璐璐：硬边大色块 + 星芒，高饱和
  ANIME: ({ r, S, h }) => {
    let s = `<rect width="${S}" height="${S}" fill="${rgb(h, 62, 18)}"/>`;
    for (let i = 0; i < 4; i++) {
      const y = (i / 4) * S;
      s += `<path d="M0 ${y} L${S} ${y - S * 0.12} L${S} ${y + S * 0.18} L0 ${y + S * 0.3} Z" fill="${rgb(h + i * 26, 78, 46 + i * 6)}" opacity="0.9"/>`;
    }
    const cx = S * 0.68;
    const cy = S * 0.3;
    const spikes = Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      const R = i % 2 ? S * 0.06 : S * 0.2;
      return `${(cx + Math.cos(a) * R).toFixed(0)},${(cy + Math.sin(a) * R).toFixed(0)}`;
    }).join(' ');
    return s + `<polygon points="${spikes}" fill="${rgb(h + 180, 95, 78)}"/>` + glow(cx, cy, S * 0.3, h + 180, 70, 0.5);
  },

  // 浅景深：暗底 + 一串散景光斑
  REALISTIC: ({ r, S, h }) => {
    let s = `<rect width="${S}" height="${S}" fill="${rgb(h, 30, 9)}"/>`;
    for (let i = 0; i < 22; i++) {
      s += glow(r() * S, r() * S, (0.06 + r() * 0.16) * S, h + r() * 60 - 30, 52 + r() * 26, 0.3 + r() * 0.4);
    }
    return s + vignette(S, 0.7);
  },

  // 棚拍球体：主光 + 高光点 + 地面软阴影
  THREE_D: ({ r, S, h }) => {
    const cx = S * 0.5;
    const cy = S * 0.46;
    const rad = S * 0.26;
    return `<rect width="${S}" height="${S}" fill="${rgb(h, 22, 14)}"/>
  <ellipse cx="${cx}" cy="${S * 0.8}" rx="${rad * 1.5}" ry="${rad * 0.22}" fill="#000" opacity="0.5"/>
  <radialGradient id="ball" cx="35%" cy="30%" r="78%"><stop offset="0%" stop-color="${rgb(h + 20, 70, 72)}"/><stop offset="55%" stop-color="${rgb(h, 66, 44)}"/><stop offset="100%" stop-color="${rgb(h - 20, 60, 16)}"/></radialGradient>
  <circle cx="${cx}" cy="${cy}" r="${rad}" fill="url(#ball)"/>
  <ellipse cx="${cx - rad * 0.34}" cy="${cy - rad * 0.42}" rx="${rad * 0.22}" ry="${rad * 0.15}" fill="#fff" opacity="0.55" transform="rotate(-28 ${cx - rad * 0.34} ${cy - rad * 0.42})"/>
  ${glow(cx + rad, cy + rad * 0.6, rad * 1.1, h + 40, 60, 0.35)}`;
  },

  // 扁平拼贴：无渐变的几何形状重叠
  ILLUSTRATION: ({ r, S, h }) => {
    let s = `<rect width="${S}" height="${S}" fill="${rgb(h + 40, 60, 88)}"/>`;
    const palette = [h, h + 45, h + 120, h + 200, h + 300];
    for (let i = 0; i < 9; i++) {
      const c = rgb(palette[i % palette.length], 70, 42 + r() * 18);
      const x = r() * S;
      const y = r() * S;
      const sz = (0.16 + r() * 0.34) * S;
      const kind = (i % 3) as number;
      s +=
        kind === 0
          ? `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(sz / 2).toFixed(0)}" fill="${c}"/>`
          : kind === 1
            ? `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${sz.toFixed(0)}" height="${sz.toFixed(0)}" fill="${c}" transform="rotate(${(r() * 40 - 20).toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})"/>`
            : `<polygon points="${x.toFixed(0)},${(y - sz / 2).toFixed(0)} ${(x + sz / 2).toFixed(0)},${(y + sz / 2).toFixed(0)} ${(x - sz / 2).toFixed(0)},${(y + sz / 2).toFixed(0)}" fill="${c}"/>`;
    }
    return s;
  },

  // 厚涂：大量旋转短笔触叠出来
  OIL_PAINTING: ({ r, S, h }) => {
    let s = `<rect width="${S}" height="${S}" fill="${rgb(h, 40, 20)}"/>`;
    for (let i = 0; i < 260; i++) {
      const x = r() * S;
      const y = r() * S;
      const w = 14 + r() * 34;
      const hh = 5 + r() * 9;
      s += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${w.toFixed(0)}" height="${hh.toFixed(0)}" rx="${(hh / 2).toFixed(1)}" fill="${rgb(h + r() * 70 - 35, 58, 26 + r() * 46)}" opacity="${(0.4 + r() * 0.5).toFixed(2)}" transform="rotate(${(r() * 180).toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})"/>`;
    }
    return s + vignette(S, 0.5);
  },

  // 霓虹透视网格 + 品红/青辉光 + 扫描线
  CYBERPUNK: ({ r, S }) => {
    const horizon = S * 0.52;
    let s = `<rect width="${S}" height="${S}" fill="#08060f"/>
  ${glow(S * 0.24, horizon - S * 0.1, S * 0.42, 300, 55, 0.55)}
  ${glow(S * 0.82, horizon - S * 0.06, S * 0.38, 185, 55, 0.5)}`;
    // 透视线：从地平线上一点向下方发散
    for (let i = -8; i <= 8; i++) {
      s += `<line x1="${S / 2}" y1="${horizon}" x2="${S / 2 + i * S * 0.22}" y2="${S}" stroke="#22d3ee" stroke-width="1.4" opacity="0.5"/>`;
    }
    // 横线按指数分布，营造纵深
    for (let i = 1; i <= 9; i++) {
      const y = horizon + (S - horizon) * Math.pow(i / 9, 2.2);
      s += `<line x1="0" y1="${y.toFixed(0)}" x2="${S}" y2="${y.toFixed(0)}" stroke="#e879f9" stroke-width="1.2" opacity="${(0.5 - i * 0.03).toFixed(2)}"/>`;
    }
    for (let i = 0; i < 5; i++) {
      s += `<rect x="${(r() * S).toFixed(0)}" y="${(r() * horizon).toFixed(0)}" width="${(6 + r() * 22).toFixed(0)}" height="${(2 + r() * 4).toFixed(0)}" fill="#67e8f9" opacity="0.8"/>`;
    }
    for (let y = 0; y < S; y += 4) {
      s += `<rect x="0" y="${y}" width="${S}" height="1" fill="#000" opacity="0.18"/>`;
    }
    return s;
  },

  // 水墨：留白宣纸 + 两三团墨晕 + 一枝细线
  CHINESE_WASH: ({ r, S }) => {
    let s = `<rect width="${S}" height="${S}" fill="#f2ede2"/>`;
    for (let i = 0; i < 3; i++) {
      const cx = S * (0.24 + r() * 0.5);
      const cy = S * (0.3 + r() * 0.42);
      s += glow(cx, cy, S * (0.16 + r() * 0.2), 210 + r() * 20, 24, 0.5 + r() * 0.3);
    }
    // 枝干：一条带弧度的细线
    const x0 = S * 0.16;
    const y0 = S * 0.82;
    s += `<path d="M${x0} ${y0} Q${S * 0.44} ${S * 0.6} ${S * 0.86} ${S * 0.22}" stroke="#1c1a17" stroke-width="3" fill="none" opacity="0.85"/>`;
    for (let i = 0; i < 5; i++) {
      const t = 0.2 + i * 0.15;
      const x = x0 + (S * 0.7) * t;
      const y = y0 - (S * 0.6) * t;
      s += `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${(10 + r() * 14).toFixed(0)}" ry="${(5 + r() * 7).toFixed(0)}" fill="#8d1f2a" opacity="${(0.5 + r() * 0.4).toFixed(2)}" transform="rotate(${(-40 + r() * 40).toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})"/>`;
    }
    return s;
  },

  // 水彩：半透明不规则色块叠色 + 纸纹
  WATERCOLOR: ({ r, S, h }) => {
    let s = `<rect width="${S}" height="${S}" fill="#f7f4ee"/>`;
    for (let i = 0; i < 7; i++) {
      const cx = r() * S;
      const cy = r() * S;
      const pts = Array.from({ length: 9 }, (_, k) => {
        const a = (k / 9) * Math.PI * 2;
        const rad = (0.1 + r() * 0.14) * S;
        return `${(cx + Math.cos(a) * rad).toFixed(0)},${(cy + Math.sin(a) * rad).toFixed(0)}`;
      }).join(' ');
      s += `<polygon points="${pts}" fill="${rgb(h + i * 34, 68, 50)}" opacity="0.3"/>`;
    }
    for (let i = 0; i < 900; i++) {
      s += `<rect x="${(r() * S).toFixed(0)}" y="${(r() * S).toFixed(0)}" width="1.5" height="1.5" fill="#8a7f6d" opacity="0.13"/>`;
    }
    return s;
  },

  // 像素：16×16 马赛克，两三簇颜色
  PIXEL_ART: ({ r, S, h }) => {
    const N = 16;
    const cell = S / N;
    const palette = [h, h + 40, h + 160, h + 210];
    let s = `<rect width="${S}" height="${S}" fill="${rgb(h, 40, 16)}"/>`;
    for (let i = 0; i < 3; i++) {
      const cx = Math.floor(r() * N);
      const cy = Math.floor(r() * N);
      const c = rgb(palette[i], 72, 46 + r() * 16);
      for (let k = 0; k < 26; k++) {
        const x = cx + Math.floor(r() * 7) - 3;
        const y = cy + Math.floor(r() * 7) - 3;
        if (x < 0 || y < 0 || x >= N || y >= N) continue;
        s += `<rect x="${(x * cell).toFixed(1)}" y="${(y * cell).toFixed(1)}" width="${cell.toFixed(1)}" height="${cell.toFixed(1)}" fill="${c}"/>`;
      }
    }
    return s;
  },

  // 摄影：冷调渐变 + 光斑 + 强暗角 + 颗粒
  PHOTOGRAPHY: ({ r, S, h }) => {
    let s = `<rect width="${S}" height="${S}" fill="${rgb(h, 26, 12)}"/>`;
    for (let i = 0; i < 14; i++) {
      s += glow(r() * S, r() * S * 0.8, (0.1 + r() * 0.2) * S, h + r() * 40 - 20, 46 + r() * 30, 0.24 + r() * 0.3);
    }
    for (let i = 0; i < 1400; i++) {
      s += `<rect x="${(r() * S).toFixed(0)}" y="${(r() * S).toFixed(0)}" width="1" height="1" fill="#fff" opacity="${(r() * 0.16).toFixed(2)}"/>`;
    }
    return s + vignette(S, 0.72);
  },

  // 概念设定：雾中层叠山形剪影
  CONCEPT_ART: ({ r, S, h }) => {
    let s = `<rect width="${S}" height="${S}" fill="${rgb(h, 34, 20)}"/>`;
    s += glow(S * 0.62, S * 0.34, S * 0.5, h + 30, 62, 0.5);
    for (let layer = 0; layer < 4; layer++) {
      const yBase = S * (0.52 + layer * 0.12);
      let d = `M0 ${S} L0 ${yBase.toFixed(0)}`;
      for (let x = 0; x <= S; x += S / 6) {
        d += ` L${x.toFixed(0)} ${(yBase - r() * S * 0.16).toFixed(0)}`;
      }
      d += ` L${S} ${S} Z`;
      s += `<path d="${d}" fill="${rgb(h, 30, 22 - layer * 4)}" opacity="0.92"/>`;
    }
    return s + `<rect y="${S * 0.5}" width="${S}" height="${S * 0.5}" fill="${rgb(h, 34, 30)}" opacity="0.24"/>`;
  },

  // 线稿：米白底 + 密集细线
  LINE_ART: ({ S, h }) => {
    let s = `<rect width="${S}" height="${S}" fill="#faf8f4"/>`;
    const cx = S * 0.5;
    const cy = S * 0.5;
    for (let i = 1; i <= 22; i++) {
      const rad = (i / 22) * S * 0.46;
      s += `<circle cx="${cx}" cy="${cy}" r="${rad.toFixed(1)}" fill="none" stroke="${rgb(h, 30, 26)}" stroke-width="${i % 5 === 0 ? 1.6 : 0.7}" opacity="0.6"/>`;
    }
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      s += `<line x1="${cx}" y1="${cy}" x2="${(cx + Math.cos(a) * S * 0.46).toFixed(1)}" y2="${(cy + Math.sin(a) * S * 0.46).toFixed(1)}" stroke="${rgb(h, 30, 26)}" stroke-width="0.5" opacity="0.35"/>`;
    }
    return s;
  },

  // 黏土：圆润形体 + 柔光，圆角开到底
  CLAYMATION: ({ r, S, h }) => {
    let s = `<rect width="${S}" height="${S}" fill="${rgb(h + 20, 44, 84)}"/>`;
    for (let i = 0; i < 7; i++) {
      const w = (0.2 + r() * 0.4) * S;
      const x = r() * S - w / 2;
      const y = r() * S - w / 2;
      s += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${w.toFixed(0)}" height="${(w * (0.5 + r() * 0.6)).toFixed(0)}" rx="${(w * 0.32).toFixed(0)}" fill="${rgb(h + r() * 120, 62, 54 + r() * 18)}"/>`;
    }
    return s + glow(S * 0.34, S * 0.26, S * 0.6, 40, 92, 0.45);
  },

  // 低多边形：抖动网格三角面片，逐片取色
  LOWPOLY: ({ r, S, h }) => {
    const N = 7;
    const pts: [number, number][][] = [];
    for (let y = 0; y <= N; y++) {
      pts[y] = [];
      for (let x = 0; x <= N; x++) {
        const jx = x === 0 || x === N ? 0 : (r() - 0.5) * (S / N) * 0.7;
        const jy = y === 0 || y === N ? 0 : (r() - 0.5) * (S / N) * 0.7;
        pts[y][x] = [(x / N) * S + jx, (y / N) * S + jy];
      }
    }
    const p = (x: number, y: number) => `${pts[y][x][0].toFixed(0)},${pts[y][x][1].toFixed(0)}`;
    let s = `<rect width="${S}" height="${S}" fill="${rgb(h, 50, 24)}"/>`;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const shade = 22 + ((x + y) / (N * 2)) * 40 + r() * 12;
        const c = rgb(h + r() * 40 - 20, 55, shade);
        s += `<polygon points="${p(x, y)} ${p(x + 1, y)} ${p(x, y + 1)}" fill="${c}"/>`;
        s += `<polygon points="${p(x + 1, y)} ${p(x + 1, y + 1)} ${p(x, y + 1)}" fill="${rgb(h + r() * 40 - 20, 55, shade + 8)}"/>`;
      }
    }
    return s;
  },

  // 海报：严格网格 + 粗横条 + 一个圆
  POSTER: ({ r, S }) => {
    const h = r() * 360;
    let s = `<rect width="${S}" height="${S}" fill="#f4f1ea"/>`;
    s += `<rect y="${S * 0.12}" width="${S}" height="${S * 0.1}" fill="${rgb(h, 78, 48)}"/>`;
    s += `<rect y="${S * 0.66}" width="${S * 0.62}" height="${S * 0.06}" fill="${rgb(h + 180, 78, 44)}"/>`;
    s += `<circle cx="${S * 0.68}" cy="${S * 0.44}" r="${S * 0.2}" fill="${rgb(h + 40, 82, 52)}"/>`;
    s += `<rect x="${S * 0.08}" y="${S * 0.26}" width="${S * 0.34}" height="${S * 0.3}" fill="${rgb(h + 300, 60, 34)}"/>`;
    for (let i = 0; i < 4; i++) {
      s += `<rect x="${S * 0.08}" y="${(S * 0.78 + i * S * 0.045).toFixed(0)}" width="${(S * (0.5 - i * 0.08)).toFixed(0)}" height="${S * 0.018}" fill="#1a1a1a" opacity="0.7"/>`;
    }
    return s;
  },

  // 其余：沿用探索封面的随机光斑
  OTHER: ({ r, S, h }) => {
    let s = `<rect width="${S}" height="${S}" fill="${rgb(h, 48, 14)}"/>`;
    for (let i = 0; i < 14; i++) {
      s += glow(r() * S, r() * S, (0.12 + r() * 0.28) * S, r() * 360, 52 + r() * 24, 0.34 + r() * 0.42);
    }
    return s + vignette(S, 0.6);
  },
};

function thumbSvg(slug: string, category: StyleCategory, S: number): string {
  const r = makeRandom(`${slug}:thumb`);
  const h = r() * 360;
  const ctx: Ctx = { r, S, h, h2: (h + 120) % 360 };
  const body = (RECIPES[category] ?? RECIPES.OTHER)(ctx);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs></defs>
  ${body}
</svg>`;
}

/**
 * 写 public/styles/{slug}.webp。与 explore 封面同一个根目录、同一个 public/ 前缀。
 * 确定性出图。但**已有文件就不覆盖**：scripts/gen-samples.ts 用真模型出的缩略图
 * 比这张占位图好得多，重跑 seed 不该把它盖回渐变块。
 */
export async function writeStyleThumb(slug: string, category: StyleCategory, size = 512) {
  const root = path.resolve(process.cwd(), process.env.STORAGE_LOCAL_ROOT ?? '.data/storage');
  const dir = path.join(root, 'public', 'styles');
  const dest = path.join(dir, `${slug}.webp`);
  if (existsSync(dest)) return;
  await mkdir(dir, { recursive: true });
  await sharp(Buffer.from(thumbSvg(slug, category, size)))
    .webp({ quality: 84 })
    .toFile(dest);
}
