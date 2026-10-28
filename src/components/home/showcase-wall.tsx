'use client';

import * as React from 'react';
import { useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { pickI18n } from '@/lib/i18n';
import { useExplore } from '@/lib/hooks/use-catalog';
import type { ExploreCardDTO } from '@/types/generator';

/**
 * 首页作品墙：拿探索广场的真实封面，而不是画占位方块。
 *
 * 首页是营销页、要能被 CDN 长期缓存，所以这里不查库（`force-dynamic` 会毁掉缓存），
 * 走客户端取数和探索广场同一个接口、同一份数据。
 */

/** '16:9' → '16/9'，供 aspect-ratio 用 */
const ratio = (r: string) => r.replace(':', '/');

/**
 * 鼠标视差：直接写 CSS 变量，不走 React state —— 每帧 setState 会让整墙重渲染，
 * 而这里只需要浏览器重算 transform。容器上的 --px/--py ∈ [-0.5, 0.5]。
 */
function useParallax<T extends HTMLElement>(depth = 1) {
  const ref = React.useRef<T>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 尊重系统的「减少动态效果」，别给前庭敏感的人添麻烦
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--px', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
      el.style.setProperty('--py', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
    };
    const onLeave = () => {
      el.style.setProperty('--px', '0');
      el.style.setProperty('--py', '0');
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [depth]);

  return ref;
}

/**
 * 两处展示共用一份数据：同一个 queryKey，TanStack 会去重成一次请求，
 * 所以数量的差异在客户端切，而不是各发一次带不同 limit 的请求。
 */
function useShowcase(take: number) {
  const { data, isPending } = useExplore({ sort: 'popular' });
  const items = (data?.items ?? []) as ExploreCardDTO[];
  return { items: items.slice(0, take), isPending };
}

/** 首屏那排倾斜的封面：鼠标移动时每层按不同系数位移，做出纵深 */
export function HeroShowcase() {
  const locale = useLocale();
  const ref = useParallax<HTMLDivElement>();
  const { items, isPending } = useShowcase(4);

  return (
    <div ref={ref} className="relative mx-auto mt-16 max-w-4xl [perspective:1400px]">
      {/* 跟随鼠标的紫青光晕。放大到容器之外，让标题区也被照到；纯装饰，不参与布局 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-40 -bottom-16 -top-56 opacity-70 blur-3xl [background:radial-gradient(38rem_24rem_at_calc(50%_+_var(--px,0)*22rem)_calc(45%_+_var(--py,0)*12rem),hsl(var(--primary)/0.28),transparent_70%)]"
      />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 [transform-style:preserve-3d] [transform:rotateX(calc(var(--py,0)*7deg))_rotateY(calc(var(--px,0)*-9deg))]">
        {isPending || items.length === 0
          ? [0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="shimmer aspect-square rounded-2xl border border-border/60 bg-gradient-to-br from-primary/10 to-accent/10"
                style={{ animationDelay: `${i * 180}ms` }}
              />
            ))
          : items.map((p, i) => (
              <Link
                key={p.id}
                href={`/explore/${p.slug}`}
                className="group relative aspect-square overflow-hidden rounded-2xl border border-border/60 shadow-lg shadow-black/40 transition-[border-color,box-shadow] duration-300 hover:z-10 hover:border-primary/50 focus-visible:z-10"
                // 每列给不同的位移系数：整排一起动会像一张图，各动各的才有纵深。
                // 这里只能用内联 transform —— 它会盖住 Tailwind 的 scale/translate 工具类，
                // 所以悬停反馈走图片自身的 group-hover:scale，边框走 hover:border-*。
                style={{
                  transform: `translate3d(calc(var(--px,0) * ${(i - 1.5) * 10}px), calc(var(--py,0) * ${i % 2 ? 14 : 8}px), 0)`,
                }}
              >
                <img
                  src={p.coverUrl}
                  alt={pickI18n(p.titleI18n, locale)}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading={i < 2 ? 'eager' : 'lazy'}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <span className="absolute inset-x-3 bottom-3 translate-y-2 text-left text-xs font-medium text-white opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                  {pickI18n(p.titleI18n, locale)}
                </span>
              </Link>
            ))}
      </div>
    </div>
  );
}

/** 作品流：真封面的瀑布流，宽高比按作品自己的 aspectRatio 走 */
export function ShowcaseWall() {
  const locale = useLocale();
  const { items, isPending } = useShowcase(12);

  if (isPending) {
    return (
      <div className="mt-14 columns-2 gap-4 md:columns-3 lg:columns-4">
        {[56, 72, 64, 48, 80, 60, 52, 72].map((h, i) => (
          <div
            key={i}
            className="shimmer mb-4 break-inside-avoid rounded-2xl border border-border/60 bg-gradient-to-br from-primary/10 to-accent/10"
            style={{ height: `${h * 4}px`, animationDelay: `${i * 120}ms` }}
          />
        ))}
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="mt-14 columns-2 gap-4 md:columns-3 lg:columns-4">
      {items.map((p) => (
        <Link
          key={p.id}
          href={`/explore/${p.slug}`}
          className="group relative mb-4 block break-inside-avoid overflow-hidden rounded-2xl border border-border/60"
        >
          <img
            src={p.coverUrl}
            alt={pickI18n(p.titleI18n, locale)}
            className="w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            style={{ aspectRatio: ratio(p.aspectRatio) }}
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          <div className="absolute inset-x-3 bottom-3 translate-y-2 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
            <p className="text-sm font-medium text-white">{pickI18n(p.titleI18n, locale)}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
