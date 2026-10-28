'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { CharacterItem } from '@/types/generator';

/**
 * 带「@ 引用形象」的提示词输入框。
 *
 * ── 为什么是叠加层，而不是 contenteditable ──
 * 仓库里的 `ui/textarea.tsx` 是原生 `<textarea>`，全仓库 `contentEditable` 零命中。
 * 原生 textarea 里**没法给一段文字单独上色**，所以高亮只能靠叠加：
 * 一层 `aria-hidden` 的 div 渲染同样的文本、把 token 包成带底色的 span，压在 textarea 上面。
 * div 里文字是 `text-transparent`（只为占位对齐），所以我们看到的是下层 textarea 的正文，
 * 只有 token 那块被叠了一层淡色。
 *
 * ★ 两层必须共享**完全一样**的排版（由下面的 LAYER 常量统一给出），
 *   差一个 px 或一点 line-height，高亮就会和文字错开。改这个组件时别只改一层。
 *
 * ── 为什么 token 写成 @[名字] ──
 * 中文名字没有空格分隔，`@小狐狸在森林里` 无法判断名字到哪结束，
 * 所以用方括号把边界钉死。方括号由插入逻辑自动补，用户只管敲 `@` 再选。
 */

/** 两层共用的排版。改这里就是改两层的对齐基准 */
const LAYER =
  'px-3 py-2 text-sm leading-6 whitespace-pre-wrap break-words font-[inherit]';

const TOKEN_RE = /@\[([^\]\n]+)\]/g;

interface Segment {
  text: string;
  /** 有值 = 这是个能对上已知形象的 token（对不上就是用户手敲的普通文字，不高亮） */
  name?: string;
  /** 该段在 value 里的起始下标。reselect 靠它定位，不能靠 indexOf —— 同一个形象可能被 @ 两次 */
  at: number;
}

function splitSegments(value: string, known: Set<string>): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of value.matchAll(TOKEN_RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: value.slice(last, at), at: last });
    const name = m[1];
    out.push({ text: m[0], name: known.has(name) ? name : undefined, at });
    last = at + m[0].length;
  }
  if (last < value.length) out.push({ text: value.slice(last), at: last });
  return out;
}

/**
 * 光标处是否正处在一个「还没写完的 @ 查询」里。
 * 返回 `@` 的位置和它后面已输入的字符，都不是就返回 null。
 */
function activeMention(
  value: string,
  caret: number,
): { start: number; q: string } | null {
  const before = value.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at < 0) return null;
  const q = before.slice(at + 1);
  // 中间出现 `]` 或换行，说明这不是在写查询（比如光标落在已有的 @[名字] 后面）
  if (/[\]\n]/.test(q)) return null;
  return { start: at, q };
}

export interface MentionTextareaProps {
  value: string;
  onChange: (v: string) => void;
  /** 可引用的形象。传空数组就等于一个普通 textarea */
  characters: CharacterItem[];
  /**
   * 当前模型**不收** subject 参考图。true 时图片形象在候选里变暗、不可选，
   * 点击只弹一句说明 —— 反正带不上图，不如当场讲清楚，而不是让用户选完
   * 提交后才发现只生效了描述。文字形象不受影响。
   */
  subjectUnsupported?: boolean;
  /** 外层外观（边框/圆角/背景）。两层文本区都不带边框，由这里统一给，保证两层内框一致 */
  chromeClassName?: string;
  /** 加到两层上的额外类，通常用来控制高度（min-h-24 之类） */
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  /** 与原生 textarea 同义：只决定初始高度 */
  rows?: number;
  /** 未消费的按键透传（调用方用它接 Ctrl/Cmd+Enter 提交） */
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  /**
   * 外框内部的追加内容（提交按钮、工具条之类）。
   * 放在外框**里面**是有意的 —— 弹窗锚在外框下方，这样它不会盖住这一行。
   */
  children?: React.ReactNode;
}

export function MentionTextarea({
  value,
  onChange,
  characters,
  subjectUnsupported,
  chromeClassName,
  className,
  placeholder,
  disabled,
  id,
  rows,
  onKeyDown,
  onPaste,
  children,
}: MentionTextareaProps) {
  const t = useTranslations('characters');
  const taRef = React.useRef<HTMLTextAreaElement>(null);
  const overlayRef = React.useRef<HTMLDivElement>(null);
  const [mention, setMention] = React.useState<{ start: number; q: string } | null>(null);
  const [active, setActive] = React.useState(0);
  /** 被当前模型挡下的形象名。非空时在候选面板底部显示说明 */
  const [blockedName, setBlockedName] = React.useState<string | null>(null);
  /** 插入 token 后要把光标放到哪儿 —— 必须等 React 把新 value 渲染完再设 */
  const pendingCaret = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (pendingCaret.current === null) return;
    const el = taRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(pendingCaret.current, pendingCaret.current);
      // 光标一动，之前算出来的 @ 查询就过期了
      setMention(activeMention(el.value, pendingCaret.current));
    }
    pendingCaret.current = null;
  }, [value]);

  const known = React.useMemo(
    () => new Set(characters.map((c) => c.name)),
    [characters],
  );
  const segments = React.useMemo(() => splitSegments(value, known), [value, known]);

  const matches = React.useMemo(() => {
    if (!mention) return [];
    const q = mention.q.trim().toLowerCase();
    if (!q) return characters;
    return characters.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q),
    );
  }, [mention, characters]);

  const open = Boolean(mention) && matches.length > 0;
  // 候选变了就把高亮归位，免得停在一个已经不存在的位置上；被挡提示同理，已经过期了
  React.useEffect(() => {
    setActive(0);
    setBlockedName(null);
  }, [mention?.q]);

  const syncScroll = () => {
    const ta = taRef.current;
    const ov = overlayRef.current;
    if (ta && ov) {
      ov.scrollTop = ta.scrollTop;
      ov.scrollLeft = ta.scrollLeft;
    }
  };

  const insert = (name: string) => {
    const ta = taRef.current;
    const caret = ta?.selectionStart ?? value.length;
    const start = mention?.start ?? caret;
    const next = `${value.slice(0, start)}@[${name}]${value.slice(caret)}`;
    pendingCaret.current = start + name.length + 3; // '@[' + name + ']'
    onChange(next);
    setMention(null);
    setBlockedName(null);
  };

  /** 点已有 token = 把它拆回一个 `@`，重新弹窗选 —— 这就是「随时切换」 */
  const reselect = (name: string, at: number) => {
    const token = `@[${name}]`;
    if (value.slice(at, at + token.length) !== token) return;
    const next = `${value.slice(0, at)}@${value.slice(at + token.length)}`;
    pendingCaret.current = at + 1;
    onChange(next);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (open) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => (i + 1) % matches.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => (i - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        insert(matches[active].name);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMention(null);
        return;
      }
    }
    // 弹窗开着时上面已经把 Enter 吃掉了，所以「回车不提交、Ctrl+回车才提交」不受影响
    onKeyDown?.(e);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    onChange(next);
    setMention(activeMention(next, e.target.selectionStart ?? next.length));
  };

  return (
    <div className="relative">
      <div className={cn('relative', chromeClassName)}>
        {/*
          ★ 文本区要单独包一层：叠加层是 inset-0，它的盒子必须**正好等于 textarea 的盒子**。
            直接挂在 chrome 上的话，chrome 里还有 children（工具条）的那一段高度，
            提示词一超出文本框，叠加层就会把溢出的那几行画到工具条上面去
            —— 正文是透明的看不出来，但 token 的底色会实实在在地盖住按钮。
        */}
        <div className="relative">
          <textarea
            ref={taRef}
            id={id}
            value={value}
            disabled={disabled}
            placeholder={placeholder}
            rows={rows}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={onPaste}
            onScroll={syncScroll}
            onClick={(e) =>
              setMention(
                activeMention(value, e.currentTarget.selectionStart ?? value.length),
              )
            }
            onBlur={() => setMention(null)}
            className={cn(
              LAYER,
              'block w-full resize-none border-0 bg-transparent outline-none',
              /**
               * ★ 隐藏 textarea 自己的滚动条（滚动本身仍在，滚轮/方向键照用）。
               *   不隐藏的话，内容超过高度时 Windows 上会出现一条占位滚动条，
               *   textarea 的内容宽度因此比叠加层窄十几像素 —— 换行位置不同，高亮就整段错位。
               *   叠加层是 overflow-hidden，本来就没有滚动条，所以两边都藏掉才是对齐的。
               *   两条写法都要：scrollbar-width 在 Chrome 121+ 生效，::-webkit- 兜老版本。
               */
              '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
              'placeholder:text-muted-foreground/70 disabled:cursor-not-allowed disabled:opacity-50',
              className,
            )}
          />
          {/*
            高亮层。压在 textarea 上面（绝对定位的元素天然盖住静态元素），
            文字透明只为占位；只有 token 的 span 有底色，并单独打开指针事件 ——
            其余地方 pointer-events-none，点击会穿透到下面的 textarea 去定位光标。
          */}
          <div
            ref={overlayRef}
            aria-hidden
            className={cn(
              LAYER,
              'pointer-events-none absolute inset-0 overflow-hidden border-0 text-transparent',
              className,
            )}
          >
            {segments.map((s, i) =>
              s.name ? (
                <span
                  key={i}
                  role="button"
                  tabIndex={-1}
                  title={t('clickToSwap')}
                  onClick={() => reselect(s.name!, s.at)}
                  className="pointer-events-auto cursor-pointer rounded bg-primary/25"
                >
                  {s.text}
                </span>
              ) : (
                <React.Fragment key={i}>{s.text}</React.Fragment>
              ),
            )}
            {/* 末尾补一个换行，让叠加层在内容以 \n 结尾时高度与 textarea 一致 */}
            {'\n'}
          </div>
        </div>

        {/* 工具条之类。放在文本区之后，弹窗锚在 chrome 下方，盖不到它 */}
        {children}
      </div>

      {open && (
        /*
          ★ 面板拆成两层：滚动容器只包住候选行，被挡提示挂在它**外面**。
            overflow-y-auto 会把 overflow-x 的 visible 一并计算成 auto，
            提示若放进 ul 里，会被裁掉，而且跟着列表一起滚。
        */
        <div className="absolute inset-x-0 top-full z-50 mt-1 rounded-lg border border-border bg-popover shadow-md">
          <ul role="listbox" className="max-h-64 overflow-y-auto p-1">
            {matches.map((c, i) => {
              // 图片形象（有参考图）在模型不收图时不可选；文字形象任何时候都能用
              const blocked = Boolean(subjectUnsupported) && c.assetId !== null;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    aria-disabled={blocked}
                    // onMouseDown 而不是 onClick：blur 会先一步把弹窗关掉
                    onMouseDown={(e) => {
                      e.preventDefault();
                      /**
                       * ★ 不可选必须在 onMouseDown 里就 return —— 插入本来就发生在这一刻，
                       *   光靠 disabled 样式挡不住。这里只弹说明，不动提示词。
                       */
                      if (blocked) {
                        setBlockedName(c.name);
                        return;
                      }
                      insert(c.name);
                    }}
                    onMouseEnter={() => setActive(i)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left',
                      blocked
                        ? 'cursor-not-allowed opacity-45'
                        : i === active
                          ? 'bg-accent text-accent-foreground'
                          : 'hover:bg-accent/50',
                    )}
                  >
                    {c.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.url}
                        alt=""
                        className="size-8 shrink-0 rounded object-cover"
                      />
                    ) : (
                      // 文字形象没有缩略图，用首字占位，免得渲染成破图
                      <span className="grid size-8 shrink-0 place-items-center rounded bg-muted text-xs text-muted-foreground">
                        {c.name.slice(0, 1)}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium">{c.name}</span>
                        <span className="shrink-0 rounded bg-muted px-1 py-px text-[10px] text-muted-foreground">
                          {t(c.assetId ? 'kindImage' : 'kindText')}
                        </span>
                      </span>
                      {c.description && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {c.description}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {blockedName && (
            <p className="border-t border-border px-3 py-2 text-xs text-amber-500">
              {t('imageBlockedHint', { name: blockedName })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
