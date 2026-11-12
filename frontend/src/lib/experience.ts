import { useEffect, useState } from 'react';

export type ExperienceSettings = {
  reducedMotion: boolean;
  lowEffects: boolean;
};

const STORAGE_KEY = 'sentinel_experience_settings';
const DEFAULTS: ExperienceSettings = { reducedMotion: false, lowEffects: false };

function read(): ExperienceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<ExperienceSettings>;
    return {
      reducedMotion: Boolean(parsed.reducedMotion) || window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      lowEffects: Boolean(parsed.lowEffects)
    };
  } catch {
    return DEFAULTS;
  }
}

function apply(settings: ExperienceSettings) {
  document.documentElement.dataset.motion = settings.reducedMotion ? 'reduced' : 'full';
  document.documentElement.dataset.effects = settings.lowEffects ? 'low' : 'full';
}

export function useExperienceSettings() {
  const [settings, setSettings] = useState<ExperienceSettings>(() => {
    const initial = read();
    apply(initial);
    return initial;
  });

  useEffect(() => {
    apply(settings);
  }, [settings]);

  const update = (patch: Partial<ExperienceSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  return { settings, update };
}

export function getExperienceSettings(): ExperienceSettings {
  return read();
}
