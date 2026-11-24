import React, { useEffect } from 'react';
import { BookOpen, ExternalLink, Play, X } from 'lucide-react';

export const APP_VERSION = 'v1.4.0';
export const GITHUB_REPO_URL = 'https://github.com/gdemaneuf/oamaru-1914-model-t';

interface StartShieldModalProps {
  open: boolean;
  hasStartedOnce: boolean;
  showInstructions: boolean;
  onToggleInstructions: () => void;
  onStart: () => void;
}

export const StartShieldModal: React.FC<StartShieldModalProps> = ({
  open,
  hasStartedOnce,
  showInstructions,
  onToggleInstructions,
  onStart,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && hasStartedOnce) {
        onStart();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, hasStartedOnce, onStart]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="start-shield-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0d0c0a]/78 p-2.5 sm:p-4"
    >
      <div className="flex max-h-[92vh] w-[min(680px,96vw)] flex-col overflow-hidden rounded-2xl border border-[#D4A656]/40 bg-[#161411] text-[#F4EFE6] shadow-2xl">
        {/* Top Heritage Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 pt-4 pb-3.5 sm:px-6 sm:pt-6 sm:pb-5">
          <div>
            <p className="font-mono-tabular text-[11px] sm:text-xs text-[#E8C073]">
              Version {APP_VERSION} <span aria-hidden="true">·</span> Gilles DEMANEUF &amp; AIStudio
            </p>
            <h1
              id="start-shield-title"
              className="mt-1 font-display text-2xl font-semibold tracking-tight text-[#F6F1E7] sm:mt-1.5 sm:text-4xl"
            >
              Oamaru, 1914
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-[#CFC5B4]">
              Ford Model T Touring Driving Simulation across the Victorian Whitestone Precinct
            </p>
          </div>

          {hasStartedOnce && (
            <button
              type="button"
              onClick={onStart}
              aria-label="Close guide and return to driving"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg p-1.5 text-[#B7AB98] hover:bg-white/10 hover:text-white transition-colors cursor-pointer shrink-0"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Scrollable Body */}
        <div className="overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 space-y-4 sm:space-y-5">
          <p className="text-sm leading-relaxed text-[#DFD5C5]">
            Take the wheel of a 1914 Ford Model T Touring along Harbour, Thames, Itchen, and Severn
            streets. Begin with Mechanic Arthur 20m ahead for a hands-on tour of the spark,
            throttle, hand-crank, and planetary pedals, then carry townsfolk and errands through
            changing Otago seasons.
          </p>

          {/* Action Row */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={onStart}
                className="min-h-[44px] flex items-center gap-2 rounded-lg bg-[#D4A656] px-5 py-2.5 text-sm font-semibold text-[#17130E] hover:bg-[#e1b76a] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Play className="h-4 w-4 fill-current" />
                <span>{hasStartedOnce ? 'Resume Driving' : 'Start Driving'}</span>
              </button>

              <button
                type="button"
                aria-expanded={showInstructions}
                onClick={onToggleInstructions}
                className="min-h-[44px] flex items-center gap-2 rounded-lg border border-white/15 bg-white/6 px-4 py-2.5 text-sm font-medium text-[#EAE2D3] hover:bg-white/12 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <BookOpen className="h-4 w-4 text-[#E8C073]" />
                <span>{showInstructions ? 'Hide Instructions' : 'Quick Instructions'}</span>
              </button>
            </div>

            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-medium text-[#E8C073] hover:text-[#f5d896] underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              <span>GitHub Repository</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>

          {/* Expandable Quick Instructions Panel */}
          {showInstructions && (
            <div className="space-y-4 border-t border-white/12 pt-4">
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <h2 className="font-display text-base font-semibold text-[#F6F1E7]">
                    Purpose &amp; Main Features
                  </h2>
                  <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-[#CFC5B4]">
                    <li>
                      <span className="font-semibold text-[#EAE2D3]">Planetary Model T Physics:</span>{' '}
                      Switch between accessible <span className="text-[#E8C073]">WASD</span> and
                      authentic <span className="text-[#E8C073]">3-Pedal</span> driving with hand
                      throttle, spark advance, radiator boiling, and hand-crank kickback.
                    </li>
                    <li>
                      <span className="font-semibold text-[#EAE2D3]">1914 Heritage Oamaru:</span>{' '}
                      Explore 30+ Whitestone buildings, open shopfronts, period advertisements,
                      steam train crossings, horse drays, rival tourers, and a Highland piper.
                    </li>
                    <li>
                      <span className="font-semibold text-[#EAE2D3]">Citizens &amp; Lessons:</span>{' '}
                      Drive safely to keep courtesy high, take Mechanic Arthur’s guided lesson, and
                      ferry passengers or chauffeur errands around the circuit.
                    </li>
                    <li>
                      <span className="font-semibold text-[#EAE2D3]">Cinema Orbit &amp; Recording:</span>{' '}
                      Watch roadside/balcony cinema angles and record video from any camera angle
                      independently of your active driving view.
                    </li>
                  </ul>
                </div>

                <div>
                  <h2 className="font-display text-base font-semibold text-[#F6F1E7]">
                    Driving &amp; Camera Controls
                  </h2>
                  <dl className="mt-2 space-y-1.5 text-xs text-[#CFC5B4]">
                    <div className="flex items-baseline justify-between gap-3 border-b border-white/6 pb-1">
                      <dt className="text-[#EAE2D3]">Drive / Brake</dt>
                      <dd className="font-mono-tabular text-[#E8C073]">W / S or ↑ / ↓</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 border-b border-white/6 pb-1">
                      <dt className="text-[#EAE2D3]">Steer</dt>
                      <dd className="font-mono-tabular text-[#E8C073]">A / D or ← / →</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 border-b border-white/6 pb-1">
                      <dt className="text-[#EAE2D3]">Reverse / Park Brake</dt>
                      <dd className="font-mono-tabular text-[#E8C073]">X / Space</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 border-b border-white/6 pb-1">
                      <dt className="text-[#EAE2D3]">Ignition / Hand-Crank</dt>
                      <dd className="font-mono-tabular text-[#E8C073]">I / C</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 border-b border-white/6 pb-1">
                      <dt className="text-[#EAE2D3]">Spark Retard / Advance</dt>
                      <dd className="font-mono-tabular text-[#E8C073]">Q / E</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 border-b border-white/6 pb-1">
                      <dt className="text-[#EAE2D3]">Horn / Passenger</dt>
                      <dd className="font-mono-tabular text-[#E8C073]">H / P</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 border-b border-white/6 pb-1">
                      <dt className="text-[#EAE2D3]">Cameras (1–4)</dt>
                      <dd className="font-mono-tabular text-[#E8C073]">Driver · Chase · Bonnet · Orbit</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 border-b border-white/6 pb-1">
                      <dt className="text-[#EAE2D3]">Lamps / Wiper / Reset</dt>
                      <dd className="font-mono-tabular text-[#E8C073]">L / V / R</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-[#EAE2D3]">Mobile Touchscreens</dt>
                      <dd className="font-mono-tabular text-[#E8C073]">Left: Steer · Right: Drive/Brake</dd>
                    </div>
                  </dl>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-[11px] text-[#9E9280]">
                <span>
                  Project: <span className="text-[#CFC5B4]">Oamaru, 1914</span> ·{' '}
                  <span className="font-mono-tabular">{APP_VERSION}</span> · Authors: Gilles DEMANEUF &amp; AIStudio
                </span>
                <a
                  href={GITHUB_REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono-tabular text-[#E8C073] hover:underline"
                >
                  github.com/gdemaneuf/oamaru-1914-model-t
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
