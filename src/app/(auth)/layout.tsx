import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4 py-12 pt-[max(3rem,env(safe-area-inset-top))]">
      {/* Subtle accent glow; decorative only. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-80 max-w-xl rounded-full bg-primary/10 blur-3xl"
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        {children}
      </div>
    </main>
  );
}
