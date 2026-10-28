import type { PrismaClient } from '@prisma/client';

type SeedPrompt = {
  slug: string;
  zh: string;
  en: string;
  prompt: string;
  negative?: string;
  category: string;
  tags: string[];
  modelId?: string;
};

/**
 * 精选提示词组。prompt 正文只写英文——它是产物，不参与本地化；
 * 只有标题做双语（titleI18n）。用户点「套用」即原样填入提示词框。
 *
 * ★ 条数上限是 **60**，不是随便多少：usePrompts 固定发 `limit=60`，
 *   而「提示词库」弹窗的分类筛选是在客户端拿这一页数据现算的
 *   （prompt-library.tsx 的 CATEGORIES.filter）。超过 60 条会有条目
 *   **悄无声息地不出现**，且分类标签也会跟着少。要再加就得先改成分页。
 *
 * ★ category 是受控词表，与 prompt-library.tsx 的 CATEGORIES 常量、
 *   messages/{zh,en}.json 的 generator.library.categories 三处必须同步，
 *   缺一处就显示成一个键名。
 */
const PROMPTS: SeedPrompt[] = [
  // ── 人像 ──
  { slug: 'p-portrait-studio', zh: '影棚人像', en: 'Studio Portrait', category: 'portrait', tags: ['人像', '影棚'],
    modelId: 'mock-pro',
    prompt: 'editorial studio portrait of a young woman, three-quarter view, soft key light with subtle rim, seamless dark grey backdrop, 85mm f/1.8, natural skin texture, sharp catchlights in the eyes',
    negative: 'over-smoothed skin, plastic, extra fingers, watermark' },
  { slug: 'p-portrait-street', zh: '街头抓拍', en: 'Street Candid', category: 'portrait', tags: ['人像', '街拍'],
    prompt: 'candid street photograph, person walking through a crowded night market, motion blur in the background, neon signage reflections on wet asphalt, 35mm, available light, grainy' },
  { slug: 'p-portrait-cyberpunk', zh: '赛博朋克人像', en: 'Cyberpunk Portrait', category: 'portrait', tags: ['人像', '赛博朋克'],
    modelId: 'mock-ultra',
    prompt: 'cyberpunk portrait, chrome cybernetic implants along the jawline, magenta and cyan rim lighting, rain, holographic advertisements bokeh behind, cinematic, hyper detailed' },
  { slug: 'p-portrait-film', zh: '胶片人像', en: 'Film Portrait', category: 'portrait', tags: ['人像', '胶片'],
    prompt: 'analog film portrait of a man leaning against a weathered brick wall, harsh afternoon sunlight through a window blind casting striped shadows, Kodak Portra 400 grain, muted warm tones, slight halation' },
  { slug: 'p-portrait-rembrandt', zh: '伦勃朗光人像', en: 'Rembrandt Light Portrait', category: 'portrait', tags: ['人像', '古典'],
    modelId: 'mock-pro',
    prompt: 'classical portrait lit in the Rembrandt manner, single warm key from upper left, deep chiaroscuro, the triangle of light on the shadowed cheek, dark umber background, oil painting finish, old master composition',
    negative: 'flat lighting, harsh flash' },

  // ── 风景 ──
  { slug: 'p-landscape-epic', zh: '史诗风光', en: 'Epic Landscape', category: 'landscape', tags: ['风景', '大气'],
    modelId: 'mock-ultra',
    prompt: 'vast mountain valley at golden hour, low clouds clinging to the ridgelines, a single winding river catching the light, god rays through the peaks, shot on a medium format camera, extreme depth' },
  { slug: 'p-landscape-misty', zh: '晨雾山林', en: 'Misty Forest', category: 'landscape', tags: ['风景', '雾气'],
    prompt: 'dense pine forest in early morning fog, layered hills fading into pale blue, faint sun disc, minimal composition, muted cool palette, long exposure' },
  { slug: 'p-landscape-seascape', zh: '长曝海景', en: 'Long Exposure Seascape', category: 'landscape', tags: ['风景', '海'],
    prompt: 'long exposure seascape, smooth silky water around dark basalt rocks, overcast sky, monochrome with a cold blue cast, 10-stop neutral density filter' },
  { slug: 'p-landscape-desert', zh: '沙漠星轨', en: 'Desert Star Trails', category: 'landscape', tags: ['风景', '星空'],
    modelId: 'mock-ultra',
    prompt: 'star trail photograph over a rippled sand dune, concentric arcs wheeling around the north celestial pole, faint airglow on the horizon, foreground dune rim-lit by moonlight, ultra wide, deep blacks' },
  { slug: 'p-landscape-autumn', zh: '秋日倒影', en: 'Autumn Reflection', category: 'landscape', tags: ['风景', '秋天'],
    prompt: 'still alpine lake at dawn holding a mirror reflection of larch trees in full autumn colour, thin mist on the surface, a single smooth stone in the foreground, symmetrical composition, soft pastel palette' },

  // ── 插画 ──
  { slug: 'p-illust-children', zh: '童话绘本页', en: 'Storybook Page', category: 'illustration', tags: ['插画', '童话'],
    prompt: 'children storybook illustration, a small fox in a red scarf walking through an autumn forest, warm palette, soft coloured pencil texture, gentle expression, white border' },
  { slug: 'p-illust-isometric', zh: '等距小场景', en: 'Isometric Mini Scene', category: 'illustration', tags: ['插画', '等距'],
    prompt: 'isometric miniature diorama of a cozy bookshop cafe, tiny plants and reading nooks, soft ambient occlusion, warm lamp glow, clean 3d illustration, pastel palette' },
  { slug: 'p-illust-vector', zh: '扁平矢量插画', en: 'Flat Vector Illustration', category: 'illustration', tags: ['插画', '矢量'],
    prompt: 'flat vector illustration of a remote worker at a tidy desk, bold geometric shapes, limited four-colour palette of indigo coral cream and charcoal, subtle grain texture, generous whitespace, editorial tech blog cover' },
  { slug: 'p-illust-watercolor', zh: '水彩植物', en: 'Watercolour Botanicals', category: 'illustration', tags: ['插画', '水彩'],
    prompt: 'loose watercolour study of eucalyptus and wild poppies, wet-on-wet blooms, visible paper tooth, bleeding edges, spatter, plenty of negative space, botanical sketchbook page' },

  // ── 动漫 ──
  { slug: 'p-anime-keyvisual', zh: '动漫主视觉', en: 'Anime Key Visual', category: 'anime', tags: ['动漫', '主视觉'],
    modelId: 'mock-pro',
    prompt: 'anime key visual, a lone student standing on a rooftop at sunset, hair and uniform lifted by the wind, dramatic clouds, lens flare, highly detailed background, cel shaded' },
  { slug: 'p-anime-90s', zh: '90 年代赛璐璐', en: 'Retro 90s Cel', category: 'anime', tags: ['动漫', '复古'],
    prompt: '1990s TV anime cel, a detective in a trench coat under a streetlamp in the rain, hand-painted background, visible cel paint texture and film grain, faded pastel palette, soft VHS colour bleed, 4:3 framing' },
  { slug: 'p-anime-chibi', zh: 'Q 版角色', en: 'Chibi Character', category: 'anime', tags: ['动漫', 'Q版'],
    prompt: 'chibi character illustration, oversized head and tiny body, exaggerated happy expression, thick clean outlines, flat pastel shading, simple radial burst background, sticker-ready with a bold white outline' },
  { slug: 'p-anime-mecha-girl', zh: '机甲少女', en: 'Mecha Pilot Girl', category: 'anime', tags: ['动漫', '机甲'],
    modelId: 'mock-ultra',
    prompt: 'anime illustration of a mecha pilot girl in a form-fitting flight suit, sleek white and orange armour panels docked behind her, cockpit hangar with warning lights, dynamic low angle, glossy highlights, highly detailed mechanical greebles' },

  // ── 产品 ──
  { slug: 'p-product-cosmetic', zh: '美妆产品图', en: 'Cosmetic Product', category: 'product', tags: ['产品', '美妆'],
    modelId: 'mock-flash',
    prompt: 'luxury cosmetic bottle on a wet acrylic pedestal, dramatic side lighting, water droplets, soft gradient background, commercial advertising photography, razor sharp, subtle reflection' },
  { slug: 'p-product-watch', zh: '腕表微距', en: 'Watch Macro', category: 'product', tags: ['产品', '腕表'],
    modelId: 'mock-flash',
    prompt: 'macro product shot of a mechanical chronograph watch, brushed steel case and sapphire crystal, visible movement through the exhibition caseback, dramatic gradient lighting, dark stone surface, focus stacked, advertising grade' },
  { slug: 'p-product-sneaker', zh: '球鞋广告', en: 'Sneaker Campaign', category: 'product', tags: ['产品', '球鞋'],
    prompt: 'hero sneaker suspended mid-air against a bold colour-blocked backdrop, hard directional light throwing a crisp shadow, sole detail in sharp focus, floating dust particles, high-energy sportswear campaign photography' },
  { slug: 'p-product-tech', zh: '数码产品图', en: 'Tech Product', category: 'product', tags: ['产品', '数码'],
    modelId: 'mock-flash',
    prompt: 'minimal tech product photograph on a seamless light grey sweep, matte black device with a single glowing status LED, soft top light plus a subtle fill card, no props, catalogue clean, perfectly level, sharp edge-to-edge' },

  // ── 美食 ──
  // slug 保留 p-product-food：改 slug 会在库里留下一条 upsert 覆盖不到的旧行，
  // 弹窗里就多出一条重复的「美食特写」。分类换掉即可，slug 用户看不见。
  { slug: 'p-product-food', zh: '美食特写', en: 'Food Close-up', category: 'food', tags: ['美食', '特写'],
    prompt: 'overhead food photograph of a steaming bowl of ramen, soft-boiled egg halved, scattered scallions, chopsticks lifting noodles, warm directional light, dark slate table, shallow depth of field' },
  { slug: 'p-food-coffee', zh: '手冲咖啡', en: 'Pour-over Coffee', category: 'food', tags: ['美食', '咖啡'],
    prompt: 'hands pouring from a gooseneck kettle into a V60 dripper, thin stream catching the light, steam curling upward, scattered coffee beans and a linen cloth, warm morning window light, dark wood counter, shallow depth of field' },
  { slug: 'p-food-dessert', zh: '甜品摆盘', en: 'Plated Dessert', category: 'food', tags: ['美食', '甜品'],
    modelId: 'mock-flash',
    prompt: 'fine dining dessert plated with tweezers precision, a quenelle of sorbet on a smear of berry gel, scattered crumbs and edible flowers, matte ceramic plate, soft overhead light, michelin star presentation, macro clarity' },
  { slug: 'p-food-hotpot', zh: '火锅俯拍', en: 'Hotpot Flat Lay', category: 'food', tags: ['美食', '中式'],
    prompt: 'top-down flat lay of a bubbling split hotpot surrounded by small plates of raw vegetables, sliced meat, and dipping sauces, visible steam and chilli oil sheen, dark wooden table, warm ambient light, festive communal table' },

  // ── 海报 ──
  { slug: 'p-poster-swiss', zh: '瑞士风海报', en: 'Swiss Poster', category: 'poster', tags: ['海报', '排版'],
    prompt: 'swiss international typographic style poster, strict modular grid, oversized helvetica headline, one red accent block against off-white, generous negative space, print grain' },
  { slug: 'p-poster-movie', zh: '电影海报', en: 'Movie Poster', category: 'poster', tags: ['海报', '电影'],
    modelId: 'mock-pro',
    prompt: 'minimal movie poster, lone silhouette against a vast orange sky, single strong vertical composition, negative space at the bottom for a title, subtle film grain, high contrast' },
  { slug: 'p-poster-music', zh: '音乐节海报', en: 'Music Festival Poster', category: 'poster', tags: ['海报', '音乐'],
    prompt: 'psychedelic music festival poster, warped liquid typography, acid green and hot magenta on deep violet, melting sun and concentric rings, screen print misregistration, 1970s concert handbill energy' },
  { slug: 'p-poster-exhibition', zh: '展览海报', en: 'Exhibition Poster', category: 'poster', tags: ['海报', '展览'],
    prompt: 'contemporary art museum exhibition poster, a single sculptural form photographed in raking light, enormous quiet whitespace, small refined sans-serif type block in the lower left, paper texture, restrained and editorial' },

  // ── 室内 ──
  { slug: 'p-interior-japandi', zh: '日式北欧室内', en: 'Japandi Interior', category: 'interior', tags: ['室内', '空间'],
    modelId: 'mock-pro',
    prompt: 'japandi living room interior, low oak furniture, linen sofa, paper lantern, large window with sheer curtains, soft diffused daylight, muted beige and sage palette, architectural digest photography' },
  { slug: 'p-arch-brutalist', zh: '粗野主义建筑', en: 'Brutalist Architecture', category: 'interior', tags: ['建筑', '混凝土'],
    prompt: 'brutalist concrete building photographed from a low angle, strong geometric repetition, overcast flat light, deep shadows, monochrome, slight wide-angle distortion, fine art architecture' },
  { slug: 'p-interior-loft', zh: '工业风阁楼', en: 'Industrial Loft', category: 'interior', tags: ['室内', '工业风'],
    prompt: 'converted industrial loft at dusk, exposed brick and blackened steel beams, tall factory windows, leather chesterfield, warm pool of lamp light against cool blue exterior, wide angle interior photography, lived-in and moody' },
  { slug: 'p-interior-cafe', zh: '咖啡馆空间', en: 'Cafe Interior', category: 'interior', tags: ['室内', '商业'],
    prompt: 'specialty coffee shop interior, long terrazzo counter, brass espresso machine, hanging plants and warm pendant bulbs, customers softly out of focus, golden hour light through the storefront, inviting and authentic' },

  // ── 概念 ──
  { slug: 'p-concept-mech', zh: '机甲设定', en: 'Mech Design', category: 'concept', tags: ['概念', '机甲'],
    modelId: 'mock-pro',
    prompt: 'industrial mech concept design, weathered paint and hydraulic detail, three-quarter stance in a maintenance bay, cool key light with warm practicals, hard surface modeling reference sheet quality' },
  { slug: 'p-concept-space', zh: '太空场景', en: 'Deep Space Scene', category: 'concept', tags: ['概念', '太空'],
    modelId: 'mock-ultra',
    prompt: 'a derelict generation ship drifting past a ringed gas giant, volumetric starlight, tiny scale cue of a shuttle, hard sci-fi, matte painting, ultra wide composition' },
  { slug: 'p-concept-creature', zh: '生物设定', en: 'Creature Design', category: 'concept', tags: ['概念', '生物'],
    prompt: 'alien megafauna concept art, six-legged grazer with bioluminescent plates and moss-covered hide, calm neutral pose on a misty plain, believable anatomy and weight, field-guide presentation, natural overcast light' },
  { slug: 'p-concept-vehicle', zh: '载具设定', en: 'Vehicle Concept', category: 'concept', tags: ['概念', '载具'],
    modelId: 'mock-pro',
    prompt: 'near-future armoured transport vehicle concept, chunky modular plating and exposed suspension, dust cloud and heat haze behind, desert salt flat, low three-quarter hero angle, industrial design presentation render' },

  // ── 国风 ──
  { slug: 'p-cn-inkland', zh: '国风山水', en: 'Chinese Ink Landscape', category: 'chinese', tags: ['国风', '山水'],
    modelId: 'mock-pro',
    prompt: 'traditional chinese ink wash landscape, towering karst peaks wrapped in mist, a lone fisherman in a small boat, vast empty water, sparse brushwork, seal-red accent, rice paper texture' },
  { slug: 'p-cn-hanfu', zh: '汉服人像', en: 'Hanfu Portrait', category: 'chinese', tags: ['国风', '人像'],
    prompt: 'elegant portrait of a woman in layered hanfu, silk with subtle embroidery, hairpin and flowing sleeves, soft window light in a classical courtyard, muted celadon and ivory palette, fine-line gongbi style' },
  { slug: 'p-cn-porcelain', zh: '青花瓷静物', en: 'Blue-and-White Porcelain', category: 'chinese', tags: ['国风', '静物'],
    modelId: 'mock-flash',
    prompt: 'still life of blue-and-white porcelain vases on a dark lacquered table, cobalt underglaze patterns of lotuses and clouds, a spray of plum blossom, single soft window light, deep shadows, museum lighting, ultra sharp glaze detail' },
  { slug: 'p-cn-dragon', zh: '龙纹插画', en: 'Dragon Motif', category: 'chinese', tags: ['国风', '龙'],
    modelId: 'mock-ultra',
    prompt: 'coiling oriental dragon rendered in fine gongbi linework with gold leaf accents, scales and whiskers meticulously detailed, swirling auspicious clouds, deep vermilion and ink black, silk scroll composition, symmetrical and ceremonial' },

  // ── 抽象 ──
  { slug: 'p-abstract-liquid', zh: '流体渐变', en: 'Liquid Gradient', category: 'abstract', tags: ['抽象', '背景'],
    modelId: 'mock-flash',
    prompt: 'abstract liquid gradient, iridescent chrome and violet flowing forms, smooth glossy reflections, dark background, high resolution 3d render, suitable as a website hero background' },
  { slug: 'p-abstract-ink', zh: '墨迹扩散', en: 'Ink Bloom', category: 'abstract', tags: ['抽象', '水墨'],
    prompt: 'macro photograph of black ink blooming in clear water, delicate tendrils, suspended pigment, pure white background, high shutter speed freeze frame, minimal' },
  { slug: 'p-abstract-geometry', zh: '几何构成', en: 'Geometric Composition', category: 'abstract', tags: ['抽象', '几何'],
    prompt: 'bauhaus geometric composition, intersecting circles rectangles and arcs, primary red blue and yellow on a warm grey ground, flat matte planes, subtle paper texture, perfectly balanced asymmetrical layout' },
  { slug: 'p-abstract-particles', zh: '粒子光效', en: 'Particle Field', category: 'abstract', tags: ['抽象', '光效'],
    prompt: 'swirling field of luminous particles forming a soft helix, thin depth of field with bright bokeh spheres, teal to magenta gradient falloff, pure black background, long exposure light painting, cinematic and weightless' },

  // ── 时尚 ──
  { slug: 'p-fashion-editorial', zh: '时装大片', en: 'Fashion Editorial', category: 'fashion', tags: ['时尚', '大片'],
    modelId: 'mock-pro',
    prompt: 'high fashion editorial photograph, model in sculptural avant-garde outerwear against a seamless concrete wall, hard directional light with a crisp cast shadow, bold pose, vogue quality, medium format, muted desaturated palette' },
  { slug: 'p-fashion-runway', zh: '秀场造型', en: 'Runway Look', category: 'fashion', tags: ['时尚', '秀场'],
    prompt: 'runway photograph mid-stride, model in a flowing pleated gown, motion in the fabric, blown-out white background, front row bokeh, direct flash look, caught at the decisive moment, full length, sharp' },
  { slug: 'p-fashion-jewelry', zh: '珠宝特写', en: 'Jewellery Macro', category: 'fashion', tags: ['时尚', '珠宝'],
    modelId: 'mock-flash',
    prompt: 'macro jewellery photograph of a diamond solitaire ring, brilliant facet sparkle and fire, polished platinum band, resting on black velvet, controlled specular highlights, focus stacked, luxury catalogue grade' },
  { slug: 'p-fashion-street', zh: '潮流街拍', en: 'Street Style', category: 'fashion', tags: ['时尚', '街拍'],
    prompt: 'street style photograph outside a fashion week venue, layered oversized tailoring and chunky sneakers, subject mid-gesture, blurred crowd behind, overcast even light, candid documentary framing, full body vertical' },
];

export async function seedPrompts(prisma: PrismaClient) {
  let i = 0;
  for (const p of PROMPTS) {
    const data = {
      titleI18n: { zh: p.zh, en: p.en },
      prompt: p.prompt,
      negativePrompt: p.negative,
      category: p.category,
      tags: p.tags,
      recommendedModelId: p.modelId,
      isCurated: true,
      sortOrder: (i += 10),
      enabled: true,
    };

    await prisma.promptPreset.upsert({
      where: { slug: p.slug },
      update: data,
      create: { slug: p.slug, ...data },
    });
  }
  console.log(`  ✓ 提示词组 ${PROMPTS.length} 条`);
}
