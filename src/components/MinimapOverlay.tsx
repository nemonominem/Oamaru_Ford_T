import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, GripHorizontal, Map as MapIcon, X } from 'lucide-react';
import { OAMARU_HISTORICAL_BUILDINGS } from '../sim/historicalBuildings';
import { WaitingMapPoint } from '../sim/passengers';
import { CIRCUIT_CHECKPOINTS, CIRCUIT_LOOP_POINTS, SIDE_STREET_BLOCKADES } from '../sim/terrain';
import { VehicleState } from '../sim/types';

interface MinimapOverlayProps {
  telemetry: VehicleState;
  rivals?: { x: number; z: number }[];
  trainPos?: { x: number; z: number } | null;
  piperPos?: { x: number; z: number; down: boolean } | null;
  waitingPassengers?: WaitingMapPoint[];
  passengerTarget?: { x: number; z: number; label: string; name: string } | null;
  errandTarget?: { x: number; z: number; label: string; isDropoff: boolean } | null;
  hasStartedOnce?: boolean;
}

const VIEW_RADIUS = 135; // meters visible from center to edge
const MAP_SIZE = 196; // px

export const MinimapOverlay: React.FC<MinimapOverlayProps> = ({
  telemetry,
  rivals = [],
  trainPos = null,
  piperPos = null,
  waitingPassengers = [],
  passengerTarget = null,
  errandTarget = null,
  hasStartedOnce = false,
}) => {
  const [closed, setClosed] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const [collapsed, setCollapsed] = useState(false);
  // Movable & Resizable Map Panel
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [mapWidth, setMapWidth] = useState<number>(typeof window !== 'undefined' ? Math.min(214, window.innerWidth - 32) : 214);
  const [mapHeight, setMapHeight] = useState<number>(250);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    origLeft: number;
    origTop: number;
  } | null>(null);

  const resizeStateRef = useRef<{
    edge: 'right' | 'bottom';
    startX: number;
    startY: number;
    origWidth: number;
    origHeight: number;
  } | null>(null);

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

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const rs = resizeStateRef.current;
      if (rs) {
        const dx = e.clientX - rs.startX;
        const dy = e.clientY - rs.startY;
        if (rs.edge === 'right') {
          const maxW = Math.min(400, window.innerWidth - 40);
          const minW = 140;
          setMapWidth(Math.max(minW, Math.min(maxW, Math.round(rs.origWidth + dx))));
        } else if (rs.edge === 'bottom') {
          const maxH = Math.min(500, window.innerHeight - 40);
          const minH = 120;
          setMapHeight(Math.max(minH, Math.min(maxH, Math.round(rs.origHeight + dy))));
        }
        return;
      }
      const ds = dragStateRef.current;
      if (!ds || !mapRef.current) return;
      const dx = e.clientX - ds.startX;
      const dy = e.clientY - ds.startY;
      mapRef.current.style.left = `${Math.max(8, ds.origLeft + dx)}px`;
      mapRef.current.style.top = `${Math.max(8, ds.origTop + dy)}px`;
    };
    const onPointerUp = () => {
      resizeStateRef.current = null;
      dragStateRef.current = null;
      setIsResizing(false);
      setIsDragging(false);
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  if (closed) {
    return (
      <button
        type="button"
        onClick={() => setClosed(false)}
        aria-label="Open circuit map"
        title="Open 1914 Circuit Map (M)"
        className="fixed top-3 right-3 sm:top-5 sm:right-6 z-20 flex min-h-[44px] sm:min-h-0 items-center gap-1.5 rounded-lg border border-white/15 bg-[#161411]/92 px-3 py-1.5 text-xs font-medium text-[#F4EFE6] shadow-lg hover:bg-[#23201b] transition-colors cursor-pointer whitespace-nowrap"
      >
        <MapIcon className="h-3.5 w-3.5 text-[#E8C073]" />
        <span className="hidden sm:inline">Circuit Map</span>
        <span className="sm:hidden">Map</span>
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

  let nearestHail: WaitingMapPoint | null = null;
  let nearestHailDist = Infinity;
  for (const wp of waitingPassengers) {
    const d = Math.hypot(wp.x - px, wp.z - pz);
    if (d < nearestHailDist) {
      nearestHailDist = d;
      nearestHail = wp;
    }
  }

  const compassDir = (tx: number, tz: number) => {
    const dx = tx - px;
    const dz = tz - pz;
    // In world coordinates +X is East (Harbour), +Z is South (Wanbrow)
    const angle = Math.atan2(dx, -dz); // 0 = North (-Z), +PI/2 = East (+X)
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const idx = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
    return dirs[idx];
  };

  return (
    <aside
      ref={mapRef}
      aria-label="Oamaru Victorian Circuit Minimap"
      className={`fixed top-3 right-3 z-25 rounded-xl border border-white/15 bg-[#161411]/92 shadow-xl ${collapsed ? 'min-h-[36px]' : 'overflow-hidden'}`}
      style={{
        width: collapsed ? 'auto' : `${mapWidth}px`,
        height: collapsed ? 'auto' : `${mapHeight}px`,
        maxWidth: 'calc(100vw - 16px)',
        maxHeight: 'calc(100vh - 16px)',
        left: collapsed ? 'auto' : undefined,
        top: collapsed ? 'auto' : undefined,
      }}
    >
      <div
        className="mb-1.5 flex items-center justify-between gap-1 text-[11px] text-[#CFC5B4]"
        onPointerDown={(e) => {
          if (e.button !== 0 || !mapRef.current) return;
          e.preventDefault();
          const rect = mapRef.current.getBoundingClientRect();
          dragStateRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            origLeft: rect.left,
            origTop: rect.top,
          };
          setIsDragging(true);
        }}
        style={{ cursor: collapsed ? 'default' : 'move', userSelect: collapsed ? 'none' : 'none' }}
      >
        <span className="font-medium text-[#F4EFE6] truncate">1914 Map</span>
        <div className="flex items-center gap-1.5">
          <span className="font-mono-tabular text-[#9E9280]">
            P{telemetry.racePosition} · L{telemetry.lapCount}
          </span>
          <button
            type="button"
            onClick={() => setCollapsed((prev) => !prev)}
            aria-label={collapsed ? 'Expand circuit map' : 'Collapse circuit map'}
            title={collapsed ? 'Expand map' : 'Collapse map'}
            className="min-h-[32px] min-w-[32px] sm:min-h-0 sm:min-w-0 flex items-center justify-center rounded p-1 text-[#9E9280] hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          >
            {collapsed ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setClosed(true)}
            aria-label="Close circuit map"
            title="Close circuit map (M)"
            className="min-h-[32px] min-w-[32px] sm:min-h-0 sm:min-w-0 flex items-center justify-center rounded p-1 text-[#9E9280] hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
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
          {hasStartedOnce && (
          <line
            x1={toMapX(-56)}
            y1={toMapY(-7.2)}
            x2={toMapX(-56)}
            y2={toMapY(7.2)}
            stroke="#F6F1E7"
            strokeWidth={2.2}
            strokeDasharray="2 1.5"
          />
          )}

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

          {/* Scottish Bagpiper Marker */}
          {piperPos && (
            <circle
              cx={toMapX(piperPos.x)}
              cy={toMapY(piperPos.z)}
              r={piperPos.down ? 2.4 : 3.2}
              fill={piperPos.down ? '#9e473f' : '#2f9460'}
              stroke="#f2e6c9"
              strokeWidth={0.9}
            />
          )}

          {/* Waiting Hitchhiking Passengers (in-bounds markers + off-map edge compass pins) */}
          {waitingPassengers.map((wp) => {
            const mx = toMapX(wp.x);
            const my = toMapY(wp.z);
            const dx = mx - MAP_SIZE * 0.5;
            const dy = my - MAP_SIZE * 0.5;
            const margin = 10;
            const maxHalf = MAP_SIZE * 0.5 - margin;
            const isOffMap = Math.abs(dx) > maxHalf || Math.abs(dy) > maxHalf;

            if (!isOffMap) {
              return (
                <g key={wp.id} transform={`translate(${mx}, ${my})`}>
                  <title>{`${wp.name} (${wp.roleLabel}) — ${wp.pickupLabel}`}</title>
                  {wp.isInstructor && (
                    <circle cx={0} cy={0} r={7.2} fill="none" stroke="#f0c65d" strokeWidth={1.1} strokeDasharray="2 1.5" />
                  )}
                  <circle
                    cx={0}
                    cy={0}
                    r={5.0}
                    fill={wp.color}
                    stroke={wp.isInstructor ? '#fff3cf' : '#161411'}
                    strokeWidth={1.1}
                  />
                  <text
                    x={0}
                    y={2.1}
                    textAnchor="middle"
                    fontSize="6.2"
                    fontWeight="800"
                    fill="#161411"
                  >
                    {wp.initial}
                  </text>
                </g>
              );
            }

            const scale = Math.max(Math.abs(dx), Math.abs(dy)) / maxHalf;
            const ex = MAP_SIZE * 0.5 + dx / scale;
            const ey = MAP_SIZE * 0.5 + dy / scale;
            const angDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
            return (
              <g key={wp.id} transform={`translate(${ex}, ${ey})`}>
                <title>{`${wp.name} (${Math.round(Math.hypot(wp.x - px, wp.z - pz))}m ${compassDir(wp.x, wp.z)})`}</title>
                <g transform={`rotate(${angDeg})`}>
                  <polygon points="8,0 3,-3.2 3,3.2" fill={wp.color} stroke="#161411" strokeWidth={0.7} />
                </g>
                <circle cx={0} cy={0} r={5.4} fill={wp.color} stroke="#161411" strokeWidth={1.0} />
                <text x={0} y={2.1} textAnchor="middle" fontSize="6.2" fontWeight="800" fill="#161411">
                  {wp.initial}
                </text>
              </g>
            );
          })}

          {/* Active Passenger Destination Target (with off-map edge clamp) */}
          {passengerTarget &&
            (() => {
              const tx = toMapX(passengerTarget.x);
              const ty = toMapY(passengerTarget.z);
              const dx = tx - MAP_SIZE * 0.5;
              const dy = ty - MAP_SIZE * 0.5;
              const maxHalf = MAP_SIZE * 0.5 - 11;
              const offMap = Math.abs(dx) > maxHalf || Math.abs(dy) > maxHalf;
              const sc = offMap ? Math.max(Math.abs(dx), Math.abs(dy)) / maxHalf : 1;
              const pxPlot = MAP_SIZE * 0.5 + dx / sc;
              const pyPlot = MAP_SIZE * 0.5 + dy / sc;
              return (
                <g transform={`translate(${pxPlot}, ${pyPlot})`}>
                  <title>{`Dropoff: ${passengerTarget.label}`}</title>
                  <circle cx={0} cy={0} r={6.8} fill="none" stroke="#5ec2e6" strokeWidth={1.5} />
                  <polygon points="0,-4 4,0 0,4 -4,0" fill="#5ec2e6" stroke="#161411" strokeWidth={0.8} />
                </g>
              );
            })()}

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
          {errandTarget
            ? `${errandTarget.isDropoff ? 'Dropoff' : 'Pickup'}: ${errandTarget.label}`
            : passengerTarget
              ? `Drop: ${passengerTarget.label}`
              : nearestHail
                ? `Hail: ${nearestHail.name}`
                : closestName}
        </span>
        <span className="font-mono-tabular shrink-0 text-[#9E9280]">
          {errandDist !== null
            ? `${errandDist}m`
            : passengerTarget
              ? `${Math.round(Math.hypot(passengerTarget.x - px, passengerTarget.z - pz))}m ${compassDir(
                  passengerTarget.x,
                  passengerTarget.z
                )}`
              : nearestHail
                ? `${Math.round(nearestHailDist)}m ${compassDir(nearestHail.x, nearestHail.z)}`
                : `${Math.round(closestDist)}m`}
        </span>
      </div>

      {waitingPassengers.length > 0 && (
        <div className="mt-1 border-t border-white/10 pt-1 text-[10px] leading-tight text-[#9E9280]">
          <span className="text-[#e8b948] font-semibold">A</span> Tutor ·{' '}
          <span className="text-[#f3ede0] font-semibold">B</span> Sheep ·{' '}
          <span className="text-[#d97b93] font-semibold">K</span> Lady ·{' '}
          <span className="text-[#69c292] font-semibold">T</span> Boy ·{' '}
          <span className="text-[#6aa9d9] font-semibold">C</span> Capt
        </div>
      )}
      {!collapsed && (
        <>
          {/* Resize Edge Handles: Right (width) + Bottom (height), double-click to reset default size */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize map width"
        title="Drag to resize map width · Double-click to reset"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          resizeStateRef.current = {
            edge: 'right',
            startX: e.clientX,
            startY: e.clientY,
            origWidth: mapWidth,
            origHeight: mapHeight,
          };
          setIsResizing(true);
        }}
        onDoubleClick={() => setMapWidth(Math.min(214, window.innerWidth - 32))}
        className="group absolute top-0 bottom-0 -right-1 z-20 w-2 cursor-ew-resize touch-none select-none"
      />
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize map height"
        title="Drag to resize map height · Double-click to reset"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          resizeStateRef.current = {
            edge: 'bottom',
            startX: e.clientX,
            startY: e.clientY,
            origWidth: mapWidth,
            origHeight: mapHeight,
          };
          setIsResizing(true);
        }}
        onDoubleClick={() => setMapHeight(250)}
        className="group absolute left-0 right-0 -bottom-1 z-20 h-2 cursor-ns-resize touch-none select-none"
      />
      </>
    )}
      </>
    )}
    </aside>
  );
};
