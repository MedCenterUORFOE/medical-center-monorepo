import Link from 'next/link';
import { ArrowRight, Stethoscope } from 'lucide-react';

export default function Home() {
  return (
    <div className="auth-shell">
      <div className="absolute left-[-12%] top-[-12%] h-[26rem] w-[26rem] rounded-full bg-emerald-500/10 blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-8%] h-[22rem] w-[22rem] rounded-full bg-cyan-500/10 blur-[120px]" />

      <div className="auth-card">
        <div className="flex flex-col items-center text-center">
          <div className="brand-mark mb-6">
            <Stethoscope className="h-9 w-9 text-white" />
          </div>

          <h1 className="text-3xl font-extrabold tracking-[-0.06em] text-white md:text-[2.35rem]">
            University Medical Center
          </h1>
        </div>

        <div className="mt-8 flex justify-center">
          <Link
            href="/login"
            className="primary-cta inline-flex w-full items-center justify-center gap-2 px-5 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
          >
            Login
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
