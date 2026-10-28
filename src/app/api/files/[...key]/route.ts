import { Readable } from 'node:stream';
import { isLocalStorage, storage } from '@/server/storage';
import { verifyKey } from '@/server/storage/local';
import { toErrorResponse } from '@/server/http';
import { errors } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 仅本地驱动使用的文件出口。
 * 生产走 OSS 时这个路由 404 —— 图片字节永远不经过应用容器。
 *
 * public/* 免签名（对应 OSS 桶策略的匿名只读前缀），其余必须带有效 HMAC。
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ key: string[] }> },
) {
  try {
    if (!isLocalStorage) throw errors.notFound();

    const { key } = await ctx.params;
    /**
     * 逐段挡掉 `..` / `.` / 反斜杠，然后才拿它去判定权限。
     *
     * ★ 说清楚，免得后来人（包括我）再推一遍同样的错论：
     *   **`..` 和 `.` 这两条实际上永远不会触发。** 我一度认定
     *   `/api/files/public/%2e%2e/<私有 key>` 能绕过签名 —— 理由是这样既满足
     *   startsWith('public/') 免掉签名、又被驱动解析成 public 之外的私有路径。
     *   实测下来是错的：Next 在**路由匹配之前**就规范化点段，连 `%2e%2e` 也会被折叠
     *   （`/api/files/x/%2e%2e/public/<公开文件>` 返回的字节数与合法访问一模一样），
     *   拿到手时 `..` 已经没了，isPublic 判的仍然是真实的私有串 → 403。
     *   所以那两条是保险而非修复，留着是防将来前面多一层不改写的代理。
     *
     * ★ 真正会触发的是**反斜杠**那条：`%5c` 解码出的 `\` 不是 URL 语义的分隔符，
     *   不参与点段规范化，于是能活着走到这里；它满足 startsWith('public/') 免掉签名，
     *   而在 **Windows** 上 path.resolve 把 `\` 当分隔符，能落到根内的私有路径 ——
     *   resolveKey 只保证「不越出根」，并不保证「落在 public/ 下」。
     *   线上是 Linux，`\` 只是普通文件名字符，不受影响：这是本地开发才敞着的窄口子。
     */
    if (key.some((s) => s === '..' || s === '.' || s.includes('\\'))) {
      throw errors.notFound();
    }
    const path = key.join('/');
    const url = new URL(req.url);
    const isPublic = path.startsWith('public/');

    if (!isPublic) {
      const exp = Number(url.searchParams.get('exp'));
      const sig = url.searchParams.get('sig') ?? '';
      if (!verifyKey(path, exp, sig)) {
        throw errors.forbidden('链接已失效，请刷新页面重试');
      }
    }

    const obj = await storage.get(path);
    if (!obj) throw errors.notFound();

    const downloadName = url.searchParams.get('name');
    const headers = new Headers({
      'content-type': obj.contentType,
      // ★ public/* 不是不可变的：scripts/gen-samples.ts 会原地重写同名缩略图。
      //   原来发 immutable + 一年，结果重出图后老用户永远看不到变化（缓存里是旧图，
      //   浏览器根本不来问）。改成短时效 + 必须校验，配合下面的 ETag 回 304。
      'cache-control': isPublic
        ? 'public, max-age=300, must-revalidate'
        : 'private, max-age=3600',
    });
    if (obj.etag) headers.set('etag', obj.etag);
    if (obj.lastModified) headers.set('last-modified', obj.lastModified.toUTCString());
    if (downloadName) {
      headers.set(
        'content-disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
      );
    }

    // 内容没变就回 304，不重传整张图。本地驱动的 ETag 由 get() 里已有的 stat 现算。
    const inm = req.headers.get('if-none-match');
    if (obj.etag && inm?.split(',').some((t) => t.trim() === obj.etag)) {
      return new Response(null, { status: 304, headers });
    }

    return new Response(
      Readable.toWeb(obj.body) as unknown as ReadableStream,
      { headers },
    );
  } catch (e) {
    return toErrorResponse(e);
  }
}
