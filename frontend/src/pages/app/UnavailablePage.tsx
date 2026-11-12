import { FolderLock, HardDriveDownload, Network } from 'lucide-react';
import { UnavailableModule } from '../../components/shell/AppShell';

const MODULES = {
  'file-protection': {
    title: 'File protection',
    icon: FolderLock,
    subtitle: 'Encryption and tamper alerts for files at rest.',
    requirements: [
      'Agent support for per-folder integrity hashes and change detection.',
      'Backend storage for file manifests and their signed baselines.',
      'A restore path that can prove a recovered file matches the original.'
    ]
  },
  network: {
    title: 'Network monitor',
    icon: Network,
    subtitle: 'Unexpected connections and traffic anomalies.',
    requirements: [
      'Agent telemetry for established connections and their owning processes.',
      'A baseline of known-good destinations per device.',
      'Backend correlation so anomalies are scored, not just listed.'
    ]
  },
  restore: {
    title: 'Restore center',
    icon: HardDriveDownload,
    subtitle: 'Recover evidence and original files to a clean device.',
    requirements: [
      'File protection manifests to know what should exist.',
      'A verified transfer channel between the agent and the API.',
      'An audit trail for every restore action you approve.'
    ]
  }
} as const;

function UnavailablePage({ moduleKey }: { moduleKey: keyof typeof MODULES }) {
  const module = MODULES[moduleKey];
  return (
    <div className="space-y-5">
      <div>
        <p className="hud-label">Planned module</p>
        <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">{module.title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">{module.subtitle}</p>
      </div>
      <UnavailableModule title={module.title} icon={module.icon} requirements={[...module.requirements]} />
    </div>
  );
}

export default UnavailablePage;
