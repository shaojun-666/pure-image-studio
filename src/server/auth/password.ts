import bcrypt from 'bcryptjs';

// 纯 JS 实现，docker builder 阶段不需要 node-gyp 原生编译
const ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
