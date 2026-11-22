import React, { useEffect, useState } from 'react';
import { Map as MapIcon, X } from 'lucide-react';
import { OAMARU_HISTORICAL_BUILDINGS } from '../sim/historicalBuildings';
import { CIRCUIT_CHECKPOINTS, CIRCUIT_LOOP_POINTS, SIDE_STREET_BLOCKADES } from '../sim/terrain';
import { VehicleState } from '../sim/types';

interface MinimapOverlayProps {
  telemetry: VehicleState;
  rivals?: { x: number; z: number }[];
  trainPos?: { x: number; z: number } | null;
  errandTarget?: { x: number; z: number; label: string; isDropoff: boolean } | null;
}

const VIEW_RADIUS = 135; // meters visible from center to edge
const MAP_SIZE = 196; // px

export const MinimapOverlay: React.FC<MinimapOverlayProps> = ({
  telemetry,
  rivals = [],
  trainPos = null,
  errandTarget = null,
}) => {
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!e.repeat && e.code === 'KeyM') {
        setClosed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (closed) {
    return (
      <button
        type="button"
        onClick={() => setClosed(false)}
        aria-label="Open circuit map"
        title="Open 1914 Circuit Map (M)"
        className="fixed top-5 right-6 z-20 flex items-center gap-1.5 rounded-lg border border-white/15 bg-[#161411]/92 px-3 py-1.5 text-xs font-medium text-[#F4EFE6] shadow-lg hover:bg-[#23201b] transition-colors cursor-pointer whitespace-nowrap"
      >
        <MapIcon className="h-3.5 w-3.5 text-[#E8C073]" />
        <span>Circuit Map</span>
      </button>
    );
  }

  const px = telemetry.x;
  const pz = telemetry.z;

  const toMapX = (wx: number) => ((wx - px) / (VIEW_RADIUS * 2)) * MAP_SIZE + MAP_SIZE * 0.5;
  const toMapY = (wz: number) => ((wz - pz) / (VIEW_RADIUS * 2)) * MAP_SIZE + MAP_SIZE * 0.5;

  const headingDeg = 180 - (telemetry.yaw * 180) / Math.PI;
  const scalePx = MAP_SIZE / (VIEW_RADIUS * 2);

  const nearbyBuildings = OAMARU_HISTORICAL_BUILDINGS.filter(
    (b) => Math.hypot(b.x - px, b.z - pz) <= VIEW_RADIUS + 28
  );

  let closestName = '';
  let closestDist = Infinity;
  for (const b of OAMARU_HISTORICAL_BUILDINGS) {
    const d = Math.hypot(b.x - px, b.z - pz);
    if (d < closestDist) {
      closestDist = d;
      closestName = b.name;
    }
  }

  const circuitPointsAttr = CIRCUIT_LOOP_POINTS.map(
    ([cx, cz]) => `${toMapX(cx).toFixed(1)},${toMapY(cz).toFixed(1)}`
  ).join(' ');
  const nextCp = CIRCUIT_CHECKPOINTS[telemetry.nextSector] ?? CIRCUIT_CHECKPOINTS[0];

  const errandDist = errandTarget ? Math.round(Math.hypot(errandTarget.x - px, errandTarget.z - pz)) : null;

  return (
    <aside
      aria-label="Oamaru Victorian Circuit Minimap"
      className="fixed top-5 right-6 z-20 w-[214px] rounded-xl border border-white/15 bg-[#161411]/92 p-2.5 shadow-xl"
    >
      <div className="mb-1.5 flex items-center justify-between gap-1 text-[11px] text-[#CFC5B4]">
        <span className="font-medium text-[#F4EFE6]">1914 Circuit Map</span>
        <div className="flex items-center gap-1.5">
          <span className="font-mono-tabular text-[#9E9280]">
            P{telemetry.racePosition} · Lap {telemetry.lapCount}
          </span>
          <button
            type="button"
            onClick={() => setClosed(true)}
            aria-label="Close circuit map"
            title="Close circuit map (M)"
            className="rounded p-0.5 text-[#9E9280] hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-lg border border-white/10 bg-[#23211d]">
        <svg
          width={MAP_SIZE}
          height={MAP_SIZE}
          viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`}
          className="block w-full h-auto"
        >
          {/* Oamaru Harbour Water (East of x=107) */}
          <rect x={toMapX(107)} y={-400} width={500} height={900} fill="#1f3a48" />

          {/* Sumpter Wharf Deck */}
          <rect
            x={toMapX(104)}
            y={toMapY(-7.2)}
            width={64 * scalePx}
            height={14.4 * scalePx}
            fill="#6c5840"
          />

          {/* Road Network */}
          <rect
            x={toMapX(-112)}
            y={toMapY(-7.2)}
            width={216 * scalePx}
            height={14.4 * scalePx}
            fill="#7b705e"
          />
          <rect
            x={toMapX(12)}
            y={toMapY(-7.2)}
            width={92 * scalePx}
            height={14.4 * scalePx}
            fill="#57534e"
          />
          <rect
            x={toMapX(-30.8)}
            y={toMapY(-95)}
            width={13.6 * scalePx}
            height={217 * scalePx}
            fill="#6e6454"
          />
          <rect
            x={toMapX(-159)}
            y={toMapY(-74.8)}
            width={261 * scalePx}
            height={13.6 * scalePx}
            fill="#7b705e"
          />
          <rect
            x={toMapX(-111.5)}
            y={toMapY(-105)}
            width={15 * scalePx}
            height={230 * scalePx}
            fill="#7b705e"
          />
          <rect
            x={toMapX(-159.2)}
            y={toMapY(-80)}
            width={14.4 * scalePx}
            height={205 * scalePx}
            fill="#7b705e"
          />
          <rect
            x={toMapX(88.2)}
            y={toMapY(-95)}
            width={13.6 * scalePx}
            height={230 * scalePx}
            fill="#7b705e"
          />
          <rect
            x={toMapX(-160)}
            y={toMapY(110.8)}
            width={262 * scalePx}
            height={14.4 * scalePx}
            fill="#7b705e"
          />
          <rect
            x={toMapX(12)}
            y={toMapY(-61.5)}
            width={74 * scalePx}
            height={16.5 * scalePx}
            fill="#4d3d2d"
          />

          {/* 6-Leg Race Circuit Route Outline */}
          <polygon
            points={circuitPointsAttr}
            fill="none"
            stroke="#D4A656"
            strokeWidth={1.7}
            strokeDasharray="4 3"
            opacity={0.78}
          />

          {/* Natural Side-Street Blockades */}
          {SIDE_STREET_BLOCKADES.map((blk) => {
            const bx = toMapX(blk.x);
            const by = toMapY(blk.z);
            const deg = (blk.yaw * 180) / Math.PI;
            return (
              <g key={blk.id} transform={`translate(${bx}, ${by}) rotate(${deg})`}>
                <rect x={-5.5} y={-1.6} width={11} height={3.2} rx={0.8} fill="#b84a39" stroke="#1b1612" strokeWidth={0.6} />
              </g>
            );
          })}

          {/* Start / Finish Banner Line at (-56, 0) */}
          <line
            x1={toMapX(-56)}
            y1={toMapY(-7.2)}
            x2={toMapX(-56)}
            y2={toMapY(7.2)}
            stroke="#F6F1E7"
            strokeWidth={2.2}
            strokeDasharray="2 1.5"
          />

          {/* Next Circuit Checkpoint Marker */}
          <circle
            cx={toMapX(nextCp.x)}
            cy={toMapY(nextCp.z)}
            r={4.2}
            fill="none"
            stroke="#73c991"
            strokeWidth={1.4}
          />

          {/* Historical Whitestone Buildings */}
          {nearbyBuildings.map((b) => {
            const bx = toMapX(b.x);
            const by = toMapY(b.z);
            const bw = 14;
            const bh = 14;
            const isNearest = b.name === closestName && closestDist < 42;
            return (
              <g key={b.id}>
                <rect
                  x={bx - bw * 0.5}
                  y={by - bh * 0.5}
                  width={bw}
                  height={bh}
                  rx={1.5}
                  fill={isNearest ? '#e6c278' : '#cfc2a6'}
                  stroke="#3b3328"
                  strokeWidth={1}
                />
                <text
                  x={bx}
                  y={by + bh * 0.5 + 7.5}
                  textAnchor="middle"
                  fontSize="7"
                  fontWeight={isNearest ? '600' : '400'}
                  fill={isNearest ? '#f4d58d' : '#c7bba7'}
                >
                  {b.name.split(' ')[0]}
                </text>
              </g>
            );
          })}

          {/* Harbour Shunting Steam Locomotive */}
          {trainPos && (
            <g transform={`translate(${toMapX(trainPos.x)}, ${toMapY(trainPos.z)})`}>
              <rect x={-5.5} y={-2.5} width={11} height={5} rx={1} fill="#8ea4b5" stroke="#161411" strokeWidth={0.8} />
            </g>
          )}

          {/* Moving Rival Touring Cars */}
          {rivals.map((rv, idx) => (
            <circle
              key={`rival-${idx}`}
              cx={toMapX(rv.x)}
              cy={toMapY(rv.z)}
              r={3.4}
              fill="#a84b44"
              stroke="#161411"
              strokeWidth={1}
            />
          ))}

          {/* Active 1914 Chauffeur Errand Target */}
          {errandTarget && (
            <g transform={`translate(${toMapX(errandTarget.x)}, ${toMapY(errandTarget.z)})`}>
              <circle
                cx={0}
                cy={0}
                r={7}
                fill="none"
                stroke={errandTarget.isDropoff ? '#f2b950' : '#5ecb8b'}
                strokeWidth={1.6}
              />
              <polygon
                points="0,-4.5 4.5,0 0,4.5 -4.5,0"
                fill={errandTarget.isDropoff ? '#f2b950' : '#5ecb8b'}
                stroke="#161411"
                strokeWidth={0.8}
              />
            </g>
          )}

          {/* Player Model T Directional Arrow */}
          <g transform={`translate(${MAP_SIZE * 0.5}, ${MAP_SIZE * 0.5}) rotate(${headingDeg})`}>
            <circle cx={0} cy={0} r={8.5} fill="rgba(212, 166, 86, 0.22)" />
            <polygon
              points="0,-7 5,5.5 0,2.8 -5,5.5"
              fill="#D4A656"
              stroke="#161411"
              strokeWidth={1.2}
            />
          </g>
        </svg>
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[11px] text-[#B7AB98]">
        <span className="truncate pr-2">
          {errandTarget ? `${errandTarget.isDropoff ? 'Dropoff' : 'Pickup'}: ${errandTarget.label}` : closestName}
        </span>
        <span className="font-mono-tabular shrink-0 text-[#9E9280]">
          {errandDist !== null ? `${errandDist}m` : `${Math.round(closestDist)}m`}
        </span>
      </div>
    </aside>
  );
};
