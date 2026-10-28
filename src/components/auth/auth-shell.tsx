import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** 登录/注册共用外壳：居中的玻璃卡片 + 背景光晕。 */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-16">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-60"
        style={{
          background:
            'radial-gradient(60rem 30rem at 50% -10%, hsl(var(--primary) / 0.20), transparent 70%)',
        }}
        aria-hidden
      />
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription>{subtitle}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}
