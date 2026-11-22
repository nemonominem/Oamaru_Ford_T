import React from 'react';
import { OAMARU_HISTORICAL_BUILDINGS } from '../sim/historicalBuildings';
import { VehicleState } from '../sim/types';

interface MinimapOverlayProps {
  telemetry: VehicleState;
}

// Map bounds covering Oamaru Victorian Precinct (meters)
const VIEW_RADIUS = 115; // meters visible from center to edge
const MAP_SIZE = 196; // px

export const MinimapOverlay: React.FC<MinimapOverlayProps> = ({ telemetry }) => {
  const px = telemetry.x;
  const pz = telemetry.z;

  // Convert world (wx, wz) to minimap SVG coordinates centered on player (North = -Z up, East = +X right)
  const toMapX = (wx: number) => ((wx - px) / (VIEW_RADIUS * 2)) * MAP_SIZE + MAP_SIZE * 0.5;
  const toMapY = (wz: number) => ((wz - pz) / (VIEW_RADIUS * 2)) * MAP_SIZE + MAP_SIZE * 0.5;

  // Player heading: yaw=0 faces +Z (South = down in map), yaw=PI/2 faces +X (East = right)
  // SVG rotate(deg): 0deg points UP (-Z). Since fwd=(sin(yaw), cos(yaw)), in map (dx=sin(yaw), dy=cos(yaw)),
  // angle from UP (-Y) clockwise is atan2(sin(yaw), -cos(yaw)) = 180 - yaw_deg
  const headingDeg = 180 - (telemetry.yaw * 180) / Math.PI;

  const nearbyBuildings = OAMARU_HISTORICAL_BUILDINGS.filter(
    (b) => Math.hypot(b.x - px, b.z - pz) <= VIEW_RADIUS + 26
  );

  // Find closest historical building for subtle bottom label
  let closestName = '';
  let closestDist = Infinity;
  for (const b of OAMARU_HISTORICAL_BUILDINGS) {
    const d = Math.hypot(b.x - px, b.z - pz);
    if (d < closestDist) {
      closestDist = d;
      closestName = b.name;
    }
  }

  return (
    <aside
      aria-label="Oamaru Victorian Precinct Minimap"
      className="fixed top-5 right-6 z-20 w-[214px] rounded-xl border border-white/15 bg-[#161411]/92 p-2.5 shadow-xl"
    >
      <div className="mb-1.5 flex items-center justify-between text-[11px] text-[#CFC5B4]">
        <span className="font-medium text-[#F4EFE6]">Precinct Map</span>
        <span className="font-mono-tabular text-[#9E9280]">N ↑</span>
      </div>

      <div className="relative overflow-hidden rounded-lg border border-white/10 bg-[#23211d]">
        <svg
          width={MAP_SIZE}
          height={MAP_SIZE}
          viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`}
          className="block w-full h-auto"
        >
          {/* Oamaru Harbour Water (East of x=107) */}
          <rect
            x={toMapX(107)}
            y={-400}
            width={500}
            height={900}
            fill="#1f3a48"
          />

          {/* Sumpter Wharf Deck */}
          <rect
            x={toMapX(104)}
            y={toMapY(-7.2)}
            width={(64 / (VIEW_RADIUS * 2)) * MAP_SIZE}
            height={(14.4 / (VIEW_RADIUS * 2)) * MAP_SIZE}
            fill="#6c5840"
          />

          {/* Road Network: Harbour St, Tyne St, Itchen St, Thames St, Quay */}
          {/* Harbour St Macadam + Cobbles */}
          <rect
            x={toMapX(-112)}
            y={toMapY(-7.2)}
            width={(216 / (VIEW_RADIUS * 2)) * MAP_SIZE}
            height={(14.4 / (VIEW_RADIUS * 2)) * MAP_SIZE}
            fill="#7b705e"
          />
          <rect
            x={toMapX(12)}
            y={toMapY(-7.2)}
            width={(92 / (VIEW_RADIUS * 2)) * MAP_SIZE}
            height={(14.4 / (VIEW_RADIUS * 2)) * MAP_SIZE}
            fill="#57534e"
          />
          {/* Tyne St */}
          <rect
            x={toMapX(-30.8)}
            y={toMapY(-95)}
            width={(13.6 / (VIEW_RADIUS * 2)) * MAP_SIZE}
            height={(190 / (VIEW_RADIUS * 2)) * MAP_SIZE}
            fill="#7b705e"
          />
          {/* Itchen St */}
          <rect
            x={toMapX(-112)}
            y={toMapY(-74.8)}
            width={(214 / (VIEW_RADIUS * 2)) * MAP_SIZE}
            height={(13.6 / (VIEW_RADIUS * 2)) * MAP_SIZE}
            fill="#7b705e"
          />
          {/* Thames St */}
          <rect
            x={toMapX(-111.5)}
            y={toMapY(-105)}
            width={(15 / (VIEW_RADIUS * 2)) * MAP_SIZE}
            height={(200 / (VIEW_RADIUS * 2)) * MAP_SIZE}
            fill="#7b705e"
          />
          {/* Quay / Esplanade & Cape Wanbrow Track */}
          <rect
            x={toMapX(88.2)}
            y={toMapY(-95)}
            width={(13.6 / (VIEW_RADIUS * 2)) * MAP_SIZE}
            height={(267 / (VIEW_RADIUS * 2)) * MAP_SIZE}
            fill="#7b705e"
          />
          {/* Muddy Rail Siding */}
          <rect
            x={toMapX(12)}
            y={toMapY(-61.5)}
            width={(74 / (VIEW_RADIUS * 2)) * MAP_SIZE}
            height={(16.5 / (VIEW_RADIUS * 2)) * MAP_SIZE}
            fill="#4d3d2d"
          />

          {/* Historical Whitestone Buildings */}
          {nearbyBuildings.map((b) => {
            const bx = toMapX(b.x);
            const by = toMapY(b.z);
            const bw = 17;
            const bh = 17;
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
                  y={by + bh * 0.5 + 8}
                  textAnchor="middle"
                  fontSize="7.5"
                  fontWeight={isNearest ? '600' : '400'}
                  fill={isNearest ? '#f4d58d' : '#c7bba7'}
                >
                  {b.name.split(' ')[0]}
                </text>
              </g>
            );
          })}

          {/* Player Model T Directional Arrow (Always centered in map) */}
          <g transform={`translate(${MAP_SIZE * 0.5}, ${MAP_SIZE * 0.5}) rotate(${headingDeg})`}>
            <circle cx={0} cy={0} r={9} fill="rgba(212, 166, 86, 0.22)" />
            <polygon
              points="0,-7.5 5.5,6 0,3.2 -5.5,6"
              fill="#D4A656"
              stroke="#161411"
              strokeWidth={1.2}
            />
          </g>
        </svg>
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[11px] text-[#B7AB98]">
        <span className="truncate pr-2">{closestName}</span>
        <span className="font-mono-tabular shrink-0 text-[#9E9280]">{Math.round(closestDist)}m</span>
      </div>
    </aside>
  );
};
