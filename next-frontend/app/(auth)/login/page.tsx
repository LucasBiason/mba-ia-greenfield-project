import { AuthFooter } from "@/components/auth/auth-footer"
import { BrandLogo } from "@/components/auth/brand-logo"
import { LoginForm } from "@/components/auth/login-form"
import { Card } from "@/components/ui/card"

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-background px-6 py-10">
      <Card className="w-full max-w-[448px] items-center gap-6 px-6 py-10">
        <BrandLogo size="lg" />

        <h1 className="text-h1 text-foreground text-center">Sign in</h1>

        <LoginForm className="w-full" />

        {process.env.NODE_ENV !== "production" && (
          <div className="w-full p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-400 space-y-1">
            <div className="font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
              <span>Credenciais de Demonstração (Desenvolvimento)</span>
            </div>
            <div className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 space-y-0.5">
              <div>
                E-mail:{" "}
                <strong className="text-zinc-700 dark:text-zinc-300">
                  demo@streamtube.com
                </strong>
              </div>
              <div>
                Senha:{" "}
                <strong className="text-zinc-700 dark:text-zinc-300">
                  Password123!
                </strong>
              </div>
            </div>
          </div>
        )}

        <AuthFooter
          question="Don't have an account?"
          linkLabel="Sign up"
          linkHref="/signup"
        />
      </Card>
    </main>
  )
}
