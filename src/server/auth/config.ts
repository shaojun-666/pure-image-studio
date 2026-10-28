import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import GitHub from 'next-auth/providers/github';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { z } from 'zod';
import { prisma } from '../db';
import { env } from '../env';
import type { RoleToken } from '@/types/session';
import { verifyPassword } from './password';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const providers: NextAuthConfig['providers'] = [
  Credentials({
    name: 'credentials',
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Password', type: 'password' },
    },
    async authorize(raw) {
      const parsed = credentialsSchema.safeParse(raw);
      if (!parsed.success) return null;

      const { email, password } = parsed.data;
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });
      if (!user?.passwordHash) return null;
      if (user.status !== 'ACTIVE') return null;

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) return null;

      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
      };
    },
  }),
];

// 只有配了凭据才挂 GitHub，否则登录页会出现一个点不通的按钮
if (env.AUTH_GITHUB_ID && env.AUTH_GITHUB_SECRET) {
  providers.push(
    GitHub({
      clientId: env.AUTH_GITHUB_ID,
      clientSecret: env.AUTH_GITHUB_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

export const authConfig = {
  adapter: PrismaAdapter(prisma),
  // Credentials provider 只能用 JWT 会话
  session: { strategy: 'jwt' },
  pages: { signIn: '/zh/login' },
  providers,
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      // 自定义字段挂在 token 上（JWT 类型未做增强，见 src/types/session.ts）
      const t = token as typeof token & RoleToken;
      // 角色不常变，登录时取一次即可
      if (user?.id && !t.role) {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { role: true },
        });
        t.role = dbUser?.role ?? 'USER';
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.role = (token as typeof token & RoleToken).role ?? 'USER';
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
