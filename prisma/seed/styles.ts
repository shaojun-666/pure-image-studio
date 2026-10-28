import type { PrismaClient, StyleCategory } from '@prisma/client';
import { writeStyleThumb } from './style-thumbs';

type SeedStyle = {
  slug: string;
  zh: string;
  en: string;
  category: StyleCategory;
  tags: string[];
  suffix: string;
  negative?: string;
};

/**
 * 精选风格预设。promptSuffix 会追加到用户提示词之后。
 * 缩略图约定放在 public/styles/{slug}.webp，缺失时前端回退为渐变占位。
 */
const STYLES: SeedStyle[] = [
  // ── 动漫 ──
  { slug: 'anime-cel', zh: '日系赛璐璐', en: 'Anime Cel', category: 'ANIME', tags: ['动漫', '二次元'],
    suffix: '2d anime illustration, cel shading with flat color blocks and hard shadow edges, bold clean black line art, vivid saturated colors, anime key visual' },
  { slug: 'anime-90s', zh: '90 年代复古动画', en: 'Retro 90s Anime', category: 'ANIME', tags: ['动漫', '复古'],
    suffix: 'hand-drawn 1990s TV anime screenshot, cel animation, visible film grain, faded pastel palette, soft VHS color bleed', negative: 'modern, 3d render' },
  // 下面 7 个是照着主流生图站（SeaArt / Niji / Leonardo）的动漫分类补的。
  // 一律用描述性说法，不写「吉卜力」「新海诚」这类商标词 —— 商业站不冒这个险。
  { slug: 'anime-handpaint', zh: '手绘水彩动画', en: 'Hand-painted Anime', category: 'ANIME', tags: ['动漫', '手绘'],
    suffix: 'hand-painted anime film still, soft watercolor background washes, rounded gentle character design, warm nostalgic palette, lush detailed nature, gentle ambient light', negative: 'harsh contrast, cgi' },
  { slug: 'anime-shoujo', zh: '少女漫画', en: 'Shoujo Manga', category: 'ANIME', tags: ['动漫', '少女'],
    suffix: 'shoujo manga illustration, large sparkling eyes with layered highlights, delicate thin ink linework, soft pastel palette, floral and sparkle accents, screentone shading, romantic dreamy mood', negative: 'harsh shadows' },
  { slug: 'anime-chibi', zh: 'Q 版大头', en: 'Chibi', category: 'ANIME', tags: ['动漫', 'Q版'],
    suffix: 'chibi super-deformed anime illustration, oversized head on a tiny simplified body, exaggerated cute expression, thick clean outlines, flat pastel colors, simple rounded shapes' },
  { slug: 'anime-webtoon', zh: '韩系网漫', en: 'Korean Webtoon', category: 'ANIME', tags: ['动漫', '网漫'],
    suffix: 'korean webtoon manhwa illustration, clean inked linework with soft cel-shaded gradients, glossy multi-layer eye highlights, luminous smooth skin, soft studio lighting, modern romance comic panel', negative: 'rough sketch' },
  { slug: 'anime-mecha', zh: '机甲', en: 'Mecha', category: 'ANIME', tags: ['动漫', '机甲'],
    suffix: 'mecha anime key visual, hard-edged mechanical design with panel lines and exposed joint articulation, brushed metal highlights, dynamic low-angle perspective, industrial detail, dramatic rim light' },
  { slug: 'anime-sky', zh: '现代光影动画', en: 'Modern Light Anime', category: 'ANIME', tags: ['动漫', '光影'],
    suffix: 'modern anime background art, hyper-detailed scenery with luminous saturated sky, lens flare and light bloom, god rays through clouds, photorealistic environment painted in anime style, emotional atmosphere', negative: 'flat lighting' },
  { slug: 'anime-ukiyoe', zh: '浮世绘', en: 'Ukiyo-e', category: 'ANIME', tags: ['动漫', '浮世绘'],
    suffix: 'ukiyo-e woodblock print, flat color planes with bold contour lines, visible washi paper grain, traditional japanese composition, muted indigo and vermilion palette, decorative wave and cloud patterns' },

  // ── 写实 ──
  { slug: 'photo-real', zh: '超写实摄影', en: 'Photorealistic', category: 'REALISTIC', tags: ['写实'],
    suffix: 'photorealistic photograph, ultra detailed skin and material texture, natural lighting, 85mm lens, shallow depth of field, sharp focus' },
  { slug: 'cinematic', zh: '电影感', en: 'Cinematic', category: 'REALISTIC', tags: ['写实', '电影'],
    suffix: 'cinematic film still, widescreen composition, dramatic low-key lighting, teal and orange grade, anamorphic flare, volumetric haze', negative: 'flat lighting' },

  // ── 3D ──
  { slug: 'pixar-3d', zh: '皮克斯 3D', en: 'Pixar 3D', category: 'THREE_D', tags: ['3D', '卡通'],
    suffix: 'stylized 3d character render, pixar style, rounded appealing shapes, soft global illumination, subsurface scattering' },
  { slug: 'octane-3d', zh: 'OC 渲染', en: 'Octane Render', category: 'THREE_D', tags: ['3D', '渲染'],
    suffix: 'octane render, physically based materials, ray traced reflections, studio hdri lighting, high poly detail' },

  // ── 插画 ──
  { slug: 'flat-vector', zh: '扁平矢量', en: 'Flat Vector', category: 'ILLUSTRATION', tags: ['插画', '扁平'],
    suffix: 'flat vector illustration, solid color fills, bold geometric shapes, hard edges, no gradients, no outlines, limited palette' },
  { slug: 'children-book', zh: '绘本插画', en: 'Children Book', category: 'ILLUSTRATION', tags: ['插画', '童书'],
    suffix: 'whimsical children book illustration, soft watercolor and colored pencil texture, warm palette, gentle friendly characters' },

  // ── 油画 ──
  { slug: 'oil-classic', zh: '古典油画', en: 'Classical Oil', category: 'OIL_PAINTING', tags: ['油画'],
    suffix: 'classical oil painting, impasto brushwork, chiaroscuro lighting, aged varnish' },
  { slug: 'impressionist', zh: '印象派', en: 'Impressionist', category: 'OIL_PAINTING', tags: ['油画', '印象派'],
    suffix: 'impressionist oil painting, visible broken brushstrokes, luminous color, plein air' },

  // ── 赛博朋克 ──
  { slug: 'cyberpunk-neon', zh: '赛博朋克霓虹', en: 'Cyberpunk Neon', category: 'CYBERPUNK', tags: ['赛博朋克', '霓虹'],
    suffix: 'cyberpunk cityscape, neon signage, rain-slick streets, volumetric fog, magenta and cyan' },
  { slug: 'biomech', zh: '生体机械', en: 'Biomechanical', category: 'CYBERPUNK', tags: ['赛博朋克', '科幻'],
    suffix: 'biomechanical design, chrome and organic fusion, mechanical greebles, exposed hydraulics, industrial sci-fi' },

  // ── 国风 ──
  { slug: 'chinese-ink', zh: '国风水墨', en: 'Chinese Ink Wash', category: 'CHINESE_WASH', tags: ['国风', '水墨'],
    suffix: 'traditional chinese ink wash painting, xieyi brushwork, rice paper texture, generous negative space, muted ink tones' },
  { slug: 'gongbi', zh: '工笔重彩', en: 'Gongbi Fine Line', category: 'CHINESE_WASH', tags: ['国风', '工笔'],
    suffix: 'gongbi fine-line painting, meticulous outlines, mineral pigments, silk texture, gold outline, chinese court painting' },

  // ── 水彩 ──
  { slug: 'watercolor-soft', zh: '清透水彩', en: 'Soft Watercolor', category: 'WATERCOLOR', tags: ['水彩'],
    suffix: 'delicate watercolor, wet-on-wet bleeding, paper grain, translucent washes' },
  { slug: 'gouache', zh: '水粉厚涂', en: 'Gouache', category: 'WATERCOLOR', tags: ['水彩', '水粉'],
    suffix: 'opaque gouache painting, matte flat color blocks, visible paper texture' },

  // ── 像素 ──
  { slug: 'pixel-16', zh: '16 位像素', en: '16-bit Pixel', category: 'PIXEL_ART', tags: ['像素', '复古'],
    suffix: 'pixel art, 16-bit video game graphics, large visible square pixels, hard pixel edges, limited retro palette, dithered shading, low resolution sprite art, no anti-aliasing' },
  { slug: 'isometric-pixel', zh: '等距像素场景', en: 'Isometric Pixel', category: 'PIXEL_ART', tags: ['像素', '等距'],
    suffix: 'isometric pixel art, 45 degree top-down game view, large visible square pixels, hard pixel edges, limited palette, crisp dithering, retro game asset' },

  // ── 摄影 ──
  { slug: 'film-portrait', zh: '胶片人像', en: 'Film Portrait', category: 'PHOTOGRAPHY', tags: ['摄影', '胶片'],
    suffix: '35mm analog film portrait photograph, kodak portra grain, soft window light, natural skin tones, subtle halation' },
  { slug: 'product-studio', zh: '商业产品图', en: 'Product Studio', category: 'PHOTOGRAPHY', tags: ['摄影', '产品'],
    suffix: 'commercial product photograph, seamless backdrop, softbox lighting, razor sharp focus, subtle contact reflection' },

  // ── 概念艺术 ──
  { slug: 'concept-env', zh: '概念场景', en: 'Concept Environment', category: 'CONCEPT_ART', tags: ['概念', '场景'],
    suffix: 'epic concept art environment, digital matte painting, atmospheric perspective, sense of scale' },
  { slug: 'character-sheet', zh: '角色设定', en: 'Character Design', category: 'CONCEPT_ART', tags: ['概念', '角色'],
    suffix: 'character design reference sheet, full body turnaround, plain flat background, clear readable silhouette, animation model sheet layout, concept art' },

  // ── 线稿 ──
  { slug: 'lineart-clean', zh: '干脆线稿', en: 'Clean Line Art', category: 'LINE_ART', tags: ['线稿'],
    suffix: 'clean black line art on pure white background, uniform stroke weight, crisp outlines, no shading, no color' },
  { slug: 'storyboard', zh: '分镜草图', en: 'Storyboard Sketch', category: 'LINE_ART', tags: ['线稿', '分镜'],
    suffix: 'rough storyboard sketch, loose graphite pencil gesture lines, construction lines left visible, monochrome, quick thumbnail drawing' },

  // ── 黏土 / 低多边形 ──
  { slug: 'claymation', zh: '黏土定格', en: 'Claymation', category: 'CLAYMATION', tags: ['黏土', '定格'],
    suffix: 'claymation stop-motion photograph, plasticine clay with visible thumbprint texture, miniature practical set, soft studio lighting' },
  { slug: 'lowpoly', zh: '低多边形', en: 'Low Poly', category: 'LOWPOLY', tags: ['低多边形'],
    suffix: 'low poly 3d render, visible triangular facets, flat shaded polygons, minimal geometry, clean gradient sky' },

  // ── 海报 / 其他 ──
  { slug: 'poster-swiss', zh: '瑞士国际主义海报', en: 'Swiss Poster', category: 'POSTER', tags: ['海报', '排版'],
    suffix: 'swiss international typographic style poster, strict modular grid, bold helvetica typography blocks, high contrast, generous negative space, flat geometric shapes' },
  { slug: 'vintage-poster', zh: '复古旅行海报', en: 'Vintage Travel Poster', category: 'POSTER', tags: ['海报', '复古'],
    suffix: 'vintage 1930s travel poster, screen-printed flat colors, art deco framing, aged paper texture, limited retro palette' },
  { slug: 'paper-cut', zh: '分层纸雕', en: 'Layered Paper Cut', category: 'OTHER', tags: ['纸雕'],
    suffix: 'layered paper cut art, crisp cut paper edges, stacked depth layers, soft drop shadows, visible paper material' },
  { slug: 'stained-glass', zh: '彩绘玻璃', en: 'Stained Glass', category: 'OTHER', tags: ['玻璃'],
    suffix: 'stained glass window art, leaded black came lines, backlit saturated colored glass, jewel tones, gothic panel' },
];

export async function seedStyles(prisma: PrismaClient) {
  let i = 0;
  for (const s of STYLES) {
    // 缩略图本地真出一张（确定性，重复跑覆盖写），否则画廊 33 张卡片全是渐变兜底
    await writeStyleThumb(s.slug, s.category);

    const data = {
      nameI18n: { zh: s.zh, en: s.en },
      category: s.category,
      tags: s.tags,
      thumbnailKey: `public/styles/${s.slug}.webp`,
      promptSuffix: s.suffix,
      negativeSuffix: s.negative,
      isCurated: true,
      sortOrder: (i += 10),
      enabled: true,
    };

    await prisma.stylePreset.upsert({
      where: { slug: s.slug },
      update: data,
      create: { slug: s.slug, ...data },
    });
  }
  console.log(`  ✓ 风格 ${STYLES.length} 个`);
}
