import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import { resolveDimensions } from '../../src/lib/ai/aspect';
import type { AspectRatio } from '../../src/lib/ai/contracts';

type SeedPost = {
  slug: string;
  zh: string;
  en: string;
  descZh: string;
  descEn: string;
  prompt: string;
  negative?: string;
  category: string;
  /** 标签不入本地化（与 prisma/seed/prompts.ts 一致，中文站优先） */
  tags: string[];
  /** 封面由 scripts/gen-samples.ts 用真实模型出的，这里必须与之一致，否则「一键同款」会跑出另一张图 */
  modelId: string;
  aspect: AspectRatio;
  seed: string;
  guidance?: number;
  featured?: boolean;
};

/**
 * 探索广场的官方精选。prompt 只写英文——它是产物，不参与本地化；
 * titleI18n / descriptionI18n 才做双语。
 *
 * params 里的 seed 是「一键同款」能复现的关键，必须写进去。
 */
const POSTS: SeedPost[] = [
  { slug: 'highland-dawn', zh: '高原晨光', en: 'Highland Dawn', category: 'landscape',
    descZh: '低云压在脊线上，一条河把晨光兜住。', descEn: 'Low cloud on the ridgelines, one river catching the dawn.',
    tags: ['风景', '大气'], modelId: 'qwen-image-3', aspect: '16:9', seed: '884213', guidance: 7, featured: true,
    prompt: 'vast highland valley at golden hour, low clouds clinging to the ridgelines, a single winding river catching the light, god rays between the peaks, extreme depth',
    negative: 'oversaturated, hdr halo' },

  { slug: 'ink-range', zh: '千里江山', en: 'Ink Range', category: 'chinese',
    descZh: '留白占了大半张纸，山只用了三笔。', descEn: 'Most of the paper is empty; the mountains took three strokes.',
    tags: ['国风', '山水'], modelId: 'qwen-image-3', aspect: '21:9', seed: '109267', guidance: 6, featured: true,
    prompt: 'traditional chinese ink wash landscape, towering karst peaks wrapped in mist, a lone fisherman in a small boat, vast empty water, sparse brushwork, rice paper texture' },

  { slug: 'neon-alley', zh: '霓虹深巷', en: 'Neon Alley', category: 'cyberpunk',
    descZh: '雨夜的招牌反光，把人行道照成了另一条河。', descEn: 'Signage reflections on a wet night, the sidewalk turned into a second river.',
    tags: ['赛博朋克', '夜景'], modelId: 'qwen-image-3', aspect: '9:16', seed: '731904', guidance: 8,
    prompt: 'narrow cyberpunk alley at night, rain, stacked neon signage in magenta and cyan, wet asphalt reflections, steam from a vent, anamorphic flare, cinematic' },

  { slug: 'chrome-portrait', zh: '镀铬人像', en: 'Chrome Portrait', category: 'portrait',
    descZh: '下颌的植入体只反光，不发光。', descEn: 'The jawline implants only reflect; they never emit.',
    tags: ['人像', '科幻'], modelId: 'qwen-image-3', aspect: '3:4', seed: '559038', guidance: 7, featured: true,
    prompt: 'editorial portrait with chrome cybernetic implants along the jawline, hard side key light, dark seamless backdrop, natural skin texture, sharp catchlights' },

  { slug: 'mech-bay', zh: '机库整备', en: 'Mech Bay', category: 'concept',
    descZh: '掉漆比涂装更能说明它打过仗。', descEn: 'The chipped paint says more about combat than the livery does.',
    tags: ['概念', '机甲'], modelId: 'qwen-image-3', aspect: '3:2', seed: '246810', guidance: 7,
    prompt: 'industrial mech concept design, weathered paint and hydraulic detail, three-quarter stance in a maintenance bay, cool key light with warm practicals, hard surface reference sheet' },

  { slug: 'rooftop-sunset', zh: '天台落日', en: 'Rooftop Sunset', category: 'anime',
    descZh: '风把校服和云都吹向同一个方向。', descEn: 'The wind pushes the uniform and the clouds the same way.',
    tags: ['动漫', '主视觉'], modelId: 'qwen-image-3', aspect: '16:9', seed: '334521', guidance: 7,
    prompt: 'anime key visual, a lone student standing on a rooftop at sunset, hair and uniform lifted by the wind, dramatic clouds, lens flare, cel shaded, detailed background' },

  { slug: 'concrete-monolith', zh: '混凝土巨构', en: 'Concrete Monolith', category: 'architecture',
    descZh: '阴天的平光最适合暴露它有多重。', descEn: 'Flat overcast light is what best exposes how heavy it is.',
    tags: ['建筑', '混凝土'], modelId: 'qwen-image-3', aspect: '2:3', seed: '607152', guidance: 6,
    prompt: 'brutalist concrete building from a low angle, strong geometric repetition, overcast flat light, deep shadows, monochrome, slight wide-angle distortion' },

  { slug: 'liquid-chrome', zh: '液态铬', en: 'Liquid Chrome', category: 'abstract',
    descZh: '霓虹与紫罗兰在铬面上互相追赶。', descEn: 'Magenta and violet chasing each other across chrome.',
    tags: ['抽象', '背景'], modelId: 'qwen-image-3', aspect: '1:1', seed: '918273', guidance: 8, featured: true,
    prompt: 'abstract liquid gradient, iridescent chrome and violet flowing forms, smooth glossy reflections, dark background, high resolution 3d render, hero background' },

  { slug: 'quiet-room', zh: '静室', en: 'Quiet Room', category: 'interior',
    descZh: '纸灯把一天的光都滤软了。', descEn: 'A paper lantern softens whatever light the day has left.',
    tags: ['室内', '空间'], modelId: 'qwen-image-3', aspect: '4:3', seed: '482910', guidance: 6,
    prompt: 'japandi living room, low oak furniture, linen sofa, paper lantern, large window with sheer curtains, diffused daylight, muted beige and sage palette' },

  { slug: 'autumn-fox', zh: '秋日小狐', en: 'Autumn Fox', category: 'illustration',
    descZh: '红围巾是整张画里唯一的暖色。', descEn: 'The red scarf is the only warm note in the frame.',
    tags: ['插画', '童话'], modelId: 'qwen-image-3', aspect: '1:1', seed: '775311', guidance: 7,
    prompt: 'children storybook illustration, a small fox in a red scarf walking through an autumn forest, warm palette, soft coloured pencil texture, white border' },

  { slug: 'bowl-of-steam', zh: '一碗热气', en: 'Bowl of Steam', category: 'food',
    descZh: '溏心蛋切开的瞬间，热气正好被逆光打亮。', descEn: 'The steam lights up the instant the soft egg is halved.',
    tags: ['美食', '特写'], modelId: 'qwen-image-3', aspect: '4:3', seed: '150938', guidance: 7,
    prompt: 'overhead food photograph of a steaming bowl of ramen, soft-boiled egg halved, scattered scallions, chopsticks lifting noodles, warm directional light, dark slate table' },

  { slug: 'ringed-giant', zh: '环带巨行星', en: 'Ringed Giant', category: 'scifi',
    descZh: '一艘补给穿梭机，把行星的尺度钉死。', descEn: 'One supply shuttle, and the scale of the planet is settled.',
    tags: ['科幻', '太空'], modelId: 'qwen-image-3', aspect: '21:9', seed: '640027', guidance: 7, featured: true,
    prompt: 'a derelict generation ship drifting past a ringed gas giant, volumetric starlight, tiny scale cue of a shuttle, hard sci-fi, matte painting, ultra wide composition' },

  // ── 第二批（2026-09-20）：用免费的 z-image-turbo 补的，探索广场 12 → 24 条 ──
  // 题材刻意与第一批错开（茶山 vs 高原、早茶 vs 拉面、温室 vs 混凝土、绞缬 vs 液态铬…），
  // 分类则复用第一批那 12 个，免得前端筛选器冒出没见过的类目。
  // 不写 guidance：z-image-turbo 的 supportsGuidance 是 false，补个默认值等于在 params 里
  // 留一个不会生效的参数，「一键同款」回填时会骗到用户。
  // 页面单页就是 24 条（explore/page.tsx 的 limit=24），所以 24 条正好一页，不会翻页。
  { slug: 'misty-tea-fields', zh: '雾中茶山', en: 'Misty Tea Fields', category: 'landscape',
    descZh: '雾从谷底往上爬，把茶垄切成一层层。', descEn: 'Mist climbs out of the valley and cuts the terraces into layers.',
    tags: ['风景', '晨雾'], modelId: 'z-image-turbo', aspect: '16:9', seed: '317452',
    prompt: 'terraced tea hills in morning mist, layered green rows receding into fog, a single picker with a conical hat on a narrow path, soft diffused light, muted greens' },

  { slug: 'snow-pavilion', zh: '雪中亭', en: 'Snow Pavilion', category: 'chinese',
    descZh: '雪把亭子的轮廓描了一遍，湖面全空着。', descEn: 'Snow traced the pavilion outline; the lake is entirely empty.',
    tags: ['国风', '雪景'], modelId: 'z-image-turbo', aspect: '21:9', seed: '205816',
    prompt: 'traditional chinese fine-brush painting, a small pavilion on a frozen lake under falling snow, bare plum branches, vast empty space, muted ink and white, silk texture' },

  { slug: 'drone-market', zh: '空中市集', en: 'Aerial Market', category: 'cyberpunk',
    descZh: '摊位吊在塔楼之间，雨从最上面那层往下漏。', descEn: 'Stalls hang between the towers; rain leaks down from the topmost tier.',
    tags: ['赛博朋克', '市集'], modelId: 'z-image-turbo', aspect: '9:16', seed: '863170',
    prompt: 'vertical cyberpunk composition, a floating night market strung between skyscrapers on cables, hanging lanterns and tarps, rain falling through the levels, dense signage, teal and amber' },

  { slug: 'hanfu-portrait', zh: '汉服肖像', en: 'Hanfu Portrait', category: 'portrait',
    descZh: '侧光只打亮半张脸，刺绣的纹理全留下了。', descEn: 'Side light catches half the face and keeps every thread of the embroidery.',
    tags: ['人像', '国风'], modelId: 'z-image-turbo', aspect: '3:4', seed: '492735',
    prompt: 'studio portrait of a young woman in ming dynasty hanfu, soft window light from the left, neutral warm grey backdrop, intricate silk embroidery detail, natural skin texture, calm expression' },

  { slug: 'ice-crawler', zh: '冰原载具', en: 'Ice Crawler', category: 'concept',
    descZh: '履带印是这张图里唯一的时间刻度。', descEn: 'The track marks are the only clock in the frame.',
    tags: ['概念', '载具'], modelId: 'z-image-turbo', aspect: '3:2', seed: '608341',
    prompt: 'hard surface concept design of a tracked polar exploration vehicle crossing a glacier, weathered panels, long shadow, overcast white light, industrial reference sheet, three-quarter view' },

  { slug: 'train-window', zh: '列车车窗', en: 'Train Window', category: 'anime',
    descZh: '电线杆一根根过去，她一直没回头。', descEn: 'The poles go by one at a time; she never turns around.',
    tags: ['动漫', '日常'], modelId: 'z-image-turbo', aspect: '16:9', seed: '371928',
    prompt: 'anime key visual, a girl sitting by a train window at dusk, countryside and power lines passing outside, warm interior light against blue evening, cel shaded, detailed background' },

  { slug: 'glass-greenhouse', zh: '玻璃温室', en: 'Glass Greenhouse', category: 'architecture',
    descZh: '水汽挂在玻璃上，光被拆成一条条的。', descEn: 'Condensation on the glass splits the light into strips.',
    tags: ['建筑', '光影'], modelId: 'z-image-turbo', aspect: '2:3', seed: '740265',
    prompt: 'interior of a victorian glass greenhouse, tall iron ribs, ferns and palms, condensation on panes, shafts of dusty light, symmetrical vertical composition' },

  { slug: 'silk-shibori', zh: '绞缬', en: 'Silk Shibori', category: 'abstract',
    descZh: '靛蓝在折痕里积得最深。', descEn: 'The indigo pools darkest in the folds.',
    tags: ['抽象', '材质'], modelId: 'z-image-turbo', aspect: '1:1', seed: '186409',
    prompt: 'macro photograph of indigo shibori dyed silk, tight folds and dye gradients, visible fibre texture, raking light, deep blue fading to pale white, minimal composition' },

  { slug: 'bookshop-nook', zh: '书店一角', en: 'Bookshop Nook', category: 'interior',
    descZh: '一盏灯、一把旧椅子，灰尘在光里浮着。', descEn: 'One lamp, one worn chair, dust floating in the light.',
    tags: ['室内', '氛围'], modelId: 'z-image-turbo', aspect: '4:3', seed: '529073',
    prompt: 'cluttered second-hand bookshop reading nook, floor to ceiling shelves, a worn leather armchair, warm brass lamp, dust motes in the light beam, cosy and lived in' },

  { slug: 'paper-kite-festival', zh: '纸鸢', en: 'Paper Kites', category: 'illustration',
    descZh: '线在手里绷紧了，屋顶上全是仰着的脸。', descEn: 'The line goes taut; every face on the rooftop is looking up.',
    tags: ['插画', '日常'], modelId: 'z-image-turbo', aspect: '1:1', seed: '914682',
    prompt: 'flat gouache illustration of children flying paper kites from the rooftops of an old town, warm late afternoon, simple shapes, limited palette, slight paper grain' },

  { slug: 'morning-dim-sum', zh: '早茶', en: 'Morning Dim Sum', category: 'food',
    descZh: '揭盖那一瞬间，蒸汽先把镜头糊住了。', descEn: 'The steam fogs the lens the moment the lid comes off.',
    tags: ['美食', '中式'], modelId: 'z-image-turbo', aspect: '4:3', seed: '253740',
    prompt: 'overhead photograph of a cantonese morning tea table, bamboo steamer baskets opened to reveal har gow and siu mai dumplings, thick steam rising, a small teapot pouring tea into a cup off to the side, chopsticks, warm light, worn tabletop' },

  { slug: 'arctic-station', zh: '极地科考站', en: 'Arctic Station', category: 'scifi',
    descZh: '极光在天上，屋里只有一盏值班灯。', descEn: 'Aurora overhead; inside, a single duty lamp.',
    tags: ['科幻', '极地'], modelId: 'z-image-turbo', aspect: '21:9', seed: '680152',
    prompt: 'ultra wide shot of a small polar research station on an ice shelf at night, green aurora overhead, one lit window, tracked vehicle parked outside, tiny human silhouette for scale, hard sci-fi realism' },
];

/** 只用确定性的哈希 + 线性同余，种出来的封面每次跑都一样 */
function makeRandom(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = ((h ^ key.charCodeAt(i)) * 16777619) >>> 0;
  let s = h || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * 封面用径向渐变光斑而不是高斯模糊滤镜 —— 与 mock provider 同一套画法：
 * librsvg 的滤镜在大尺寸下慢一个数量级。
 * 不画文字：seed 进程不保证装了 CJK 字体，画了就是豆腐块。
 */
function coverSvg(slug: string, w: number, h: number): string {
  const rand = makeRandom(slug);
  const min = Math.min(w, h);
  const hue = Math.floor(rand() * 360);
  const hue2 = (hue + 60 + Math.floor(rand() * 180)) % 360;

  const blobs = Array.from({ length: 14 }, (_, i) => {
    const cx = Math.round(rand() * w);
    const cy = Math.round(rand() * h);
    const r = Math.round((0.12 + rand() * 0.3) * min);
    const bh = Math.floor(rand() * 360);
    const light = 52 + Math.floor(rand() * 22);
    const alpha = (0.32 + rand() * 0.42).toFixed(2);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#c${i})" opacity="${alpha}"/>
    <radialGradient id="c${i}">
      <stop offset="0%" stop-color="hsl(${bh} 78% ${light}%)"/>
      <stop offset="100%" stop-color="hsl(${bh} 78% ${light}%)" stop-opacity="0"/>
    </radialGradient>`;
  }).join('\n  ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue} 55% ${10 + Math.floor(rand() * 8)}%)"/>
      <stop offset="100%" stop-color="hsl(${hue2} 60% ${14 + Math.floor(rand() * 12)}%)"/>
    </linearGradient>
    <radialGradient id="vig" cx="50%" cy="50%" r="72%">
      <stop offset="45%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.6"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <g>
  ${blobs}
  </g>
  <rect width="${w}" height="${h}" fill="url(#vig)"/>
</svg>`;
}

export async function seedExplore(prisma: PrismaClient) {
  const root = path.resolve(process.cwd(), process.env.STORAGE_LOCAL_ROOT ?? '.data/storage');
  // 封面落在 public/ 前缀下：本地驱动免签名、生产由桶策略匿名只读并可走 CDN
  const dir = path.join(root, 'public', 'explore');
  await mkdir(dir, { recursive: true });

  if ((process.env.STORAGE_DRIVER ?? 'local') !== 'local') {
    console.log('  ! STORAGE_DRIVER 非 local，封面只写到了本地磁盘，需要另传到对象存储');
  }

  let i = 0;
  for (const p of POSTS) {
    const { width, height } = resolveDimensions(p.aspect, '1K');
    const coverKey = `public/explore/${p.slug}.webp`;
    // 已经有封面就不覆盖：真模型出的封面（scripts/gen-samples.ts）不能被占位图盖回去
    const coverPath = path.join(dir, `${p.slug}.webp`);
    if (!existsSync(coverPath)) {
      await sharp(Buffer.from(coverSvg(p.slug, width, height)))
        .webp({ quality: 82 })
        .toFile(coverPath);
    }

    const rand = makeRandom(`${p.slug}:stats`);
    const data = {
      titleI18n: { zh: p.zh, en: p.en },
      descriptionI18n: { zh: p.descZh, en: p.descEn },
      coverKey,
      galleryKeys: [] as string[],
      prompt: p.prompt,
      negativePrompt: p.negative,
      modelId: p.modelId,
      // seed 必须留在 params 里，详情页的「一键同款」全靠它复现
      // guidance 只在作品真的声明了才写 —— z-image-turbo 的 supportsGuidance 是 false，
      // 给它补个默认值等于在 params 里留一个不会生效的参数
      params: {
        seed: p.seed,
        aspectRatio: p.aspect,
        resolution: '1K',
        ...(p.guidance !== undefined && { guidance: p.guidance }),
      },
      tags: p.tags,
      category: p.category,
      status: 'PUBLISHED' as const,
      featured: p.featured ?? false,
      sortOrder: (i += 10),
      viewCount: 60 + Math.floor(rand() * 900),
      likeCount: 8 + Math.floor(rand() * 160),
      remixCount: Math.floor(rand() * 60),
      // 发布时间拉开，让「最新」排序有意义
      publishedAt: new Date(Date.now() - i * 20 * 3600 * 1000),
    };

    await prisma.explorePost.upsert({
      where: { slug: p.slug },
      update: data,
      create: { slug: p.slug, ...data },
    });
  }
  console.log(`  ✓ 探索内容 ${POSTS.length} 条（含封面）`);
}
