import { NextResponse } from 'next/server';
import { prisma } from '@/server/db';
import { route } from '@/server/http';
import { requireUser } from '@/server/auth/guards';
import { errors } from '@/types/api';
import { storage } from '@/server/storage';
import { env } from '@/server/env';

export const runtime = 'nodejs';

/** 文件名里不能有路径分隔符和控制字符，否则 Content-Disposition 会被注入 */
function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 80) || 'image';
}

/**
 * 302 到带下载头的签名 URL —— 字节不经过应用服务器。
 * 生产接 OSS 后这里同样成立，`downloadName` 由 driver 翻译成
 * `response-content-disposition` 参数。
 */
export const GET = route(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await ctx.params;

    const image = await prisma.generationImage.findFirst({
      where: { id, userId: user.id, status: 'SUCCEEDED', deletedAt: null },
    });
    if (!image) throw errors.notFound('图片不存在或尚未生成完成');

    const ext = image.mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';
    const name = safeName(`pure-${image.id.slice(-8)}-${image.seed ?? image.index}`);

    const url = await storage.signedUrl(image.storageKey, {
      expiresIn: 600,
      downloadName: `${name}.${ext}`,
    });

    // local driver 返回的是相对路径，而 NextResponse.redirect 只接受绝对 URL。
    // ★ 基准必须用配置里的站点地址，不能用 req.url：容器里 req.url 的主机名是应用
    //   自己的监听地址（实测拼出 http://0.0.0.0:3000/...），浏览器根本连不上。
    const absolute = url.startsWith('http')
      ? url
      : new URL(url, env.NEXT_PUBLIC_SITE_URL).toString();
    return NextResponse.redirect(absolute, 302);
  },
);
