import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/**
 * 语言感知的导航原语：用它们替代 next/link、next/navigation 的 useRouter 等，
 * 这样切换语言时能保留当前路由。
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
