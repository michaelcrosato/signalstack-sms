import { LogoutPanel } from "./logout-panel";

export const dynamic = "force-dynamic";

export default function LogoutPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <section className="w-full max-w-md space-y-5 rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-semibold text-slate-950">Sign out</h1>
        <LogoutPanel />
      </section>
    </main>
  );
}
