import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: 'USER' | 'ADMIN';
    } & DefaultSession['user'];
  }

  interface User {
    role?: 'USER' | 'ADMIN';
  }
}

/**
 * JWT 不做模块增强：`declare module 'next-auth/jwt'` 在 TS 5.9 + moduleResolution
 * "bundler" 下会报 TS2664（该路径只经 package exports 暴露），而 @auth/core 又没被
 * pnpm 提升到顶层，无处可增强。改为在 config.ts 里用一个窄类型断言，效果相同。
 */
export type SessionRole = 'USER' | 'ADMIN';

export interface RoleToken {
  role?: SessionRole;
}
