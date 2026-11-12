import { Link } from 'react-router-dom';
import { ArrowRight, Building2, ShieldCheck, Target } from 'lucide-react';
import PublicNav from '../components/PublicNav';

function AboutPage({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <div className="min-h-screen text-white">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-4 sm:px-6 sm:py-6">
        <PublicNav isAuthenticated={isAuthenticated} />

        <section className="holo-panel holo-corner p-8 text-center sm:p-14">
          <span className="mx-auto flex h-14 w-14 items-center justify-center border border-brand-green/40 bg-brand-green/10 text-brand-green">
            <Building2 size={26} />
          </span>
          <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.26em] text-brand-green/80">operator dossier</p>
          <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">About Us</h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-slate-300 sm:text-base">
            MalmegaVille Sentinel is built around a simple idea: the moment a device goes missing shouldn't also be
            the moment you lose all visibility into it. We build lightweight endpoint security software that
            quietly watches over your own computers and hands you real evidence — a photo, a location, a login
            record — the instant something looks wrong.
          </p>
        </section>

        <section className="grid gap-6 sm:grid-cols-2">
          <Link
            to="/services"
            className="holo-panel holo-corner group block p-6 transition hover:-translate-y-0.5 hover:border-brand-green/40 sm:p-8"
          >
            <span className="flex h-11 w-11 items-center justify-center border border-brand-green/30 bg-brand-green/10 text-brand-green">
              <Target size={20} />
            </span>
            <h2 className="mt-4 text-xl font-semibold text-white">Our mission</h2>
            <p className="mt-3 text-sm text-slate-400">
              Device recovery tools used to be a luxury bundled into expensive enterprise fleets. We think anyone
              protecting a personal laptop or a small team's hardware deserves the same visibility — without
              needing an IT department to set it up.
            </p>
            <span className="mt-4 inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.18em] text-brand-green">
              See the capabilities <ArrowRight size={10} />
            </span>
          </Link>

          <Link
            to="/download"
            className="holo-panel holo-corner group block p-6 transition hover:-translate-y-0.5 hover:border-brand-green/40 sm:p-8"
          >
            <span className="flex h-11 w-11 items-center justify-center border border-brand-green/30 bg-brand-green/10 text-brand-green">
              <ShieldCheck size={20} />
            </span>
            <h2 className="mt-4 text-xl font-semibold text-white">How we build</h2>
            <p className="mt-3 text-sm text-slate-400">
              The Sentinel agent, dashboard, and alerting pipeline are developed and maintained directly by the
              MalmegaVille team. We ship fixes and new detection features continuously, and every account is
              backed by the same infrastructure we run our own monitoring on.
            </p>
            <span className="mt-4 inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.18em] text-brand-green">
              Get the agent <ArrowRight size={10} />
            </span>
          </Link>
        </section>

        <Link
          to="/services"
          className="holo-panel holo-corner group block p-6 text-center transition hover:border-brand-green/40 sm:p-10"
        >
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Questions about how it works?</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-400 sm:text-base">
            Take a look at what Sentinel monitors on the Services page, or install the agent and see your first
            sync land in the dashboard within minutes.
          </p>
          <span className="mt-4 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-brand-green">
            Open services <ArrowRight size={11} className="transition group-hover:translate-x-0.5" />
          </span>
        </Link>
      </div>
    </div>
  );
}

export default AboutPage;
