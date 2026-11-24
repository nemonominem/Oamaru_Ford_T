export interface ErrandStop {
  label: string;
  x: number;
  z: number;
  prompt: string;
}

export interface ChauffeurErrand {
  id: string;
  title: string;
  pickup: ErrandStop;
  dropoff: ErrandStop;
  rewardNote: string;
}

export interface ActiveErrandState {
  errandIndex: number;
  phase: 'idle' | 'to-pickup' | 'to-dropoff' | 'completed';
  completedCount: number;
  cleanStreak: number;
  statusMessage: string | null;
}

export const OAMARU_ERRANDS: ChauffeurErrand[] = [
  {
    id: 'post-wharf',
    title: 'Royal Mail Dispatch',
    pickup: {
      label: 'Chief Post Office',
      x: -104,
      z: -20,
      prompt: 'Stop by the Chief Post Office on Thames St to collect the mail sacks.',
    },
    dropoff: {
      label: 'Sumpter Wharf Gate',
      x: 98,
      z: 0,
      prompt: 'Deliver the Royal Mail sacks to the SS Oamaru steamer gate at East Harbour.',
    },
    rewardNote: 'Mail aboard the SS Oamaru right on schedule!',
  },
  {
    id: 'harbour-wanbrow',
    title: 'Harbour Master Survey',
    pickup: {
      label: 'Oamaru Harbour Board',
      x: 82,
      z: -4,
      prompt: 'Collect the Harbour Master outside the Harbour Board offices.',
    },
    dropoff: {
      label: 'Wanbrow Ridge Lookout',
      x: -8,
      z: 118,
      prompt: 'Drive smoothly up Cape Wanbrow Ridge without spooking the Merino flock.',
    },
    rewardNote: 'Harbour Master inspected the bay in grand comfort!',
  },
  {
    id: 'grain-courthouse',
    title: 'Otago Wheat Sample',
    pickup: {
      label: "Meek's Grain Store",
      x: 24,
      z: 0,
      prompt: "Pick up the graded Otago wheat sample outside Meek's Grain Store.",
    },
    dropoff: {
      label: 'Waitaki Courthouse',
      x: -149,
      z: 52,
      prompt: 'Deliver the sealed grain ledger to the Waitaki Courthouse on Severn St.',
    },
    rewardNote: 'Wheat sample lodged with the Magistrate!',
  },
  {
    id: 'lighthouse-oil',
    title: 'Breakwater Lamp Oil Run',
    pickup: {
      label: 'Sumpter Produce & Oil Store',
      x: 49,
      z: 0,
      prompt: 'Collect kerosene tins for the Cape Wanbrow lighthouse outside Sumpter Produce.',
    },
    dropoff: {
      label: 'Cape Wanbrow Lighthouse',
      x: 42,
      z: 196,
      prompt: 'Climb the 12% Cape Wanbrow grade in Low gear to reach the Summit Lighthouse.',
    },
    rewardNote: 'Lighthouse keeper lit the beacon right before dusk!',
  },
];

const STORAGE_KEY = 'oamaru_1914_records_v1';

export interface StoredTrialRecords {
  bestLapSec: number | null;
  bestCourtesy: number;
  errandsCompleted: number;
}

export function loadTrialRecords(): StoredTrialRecords {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { bestLapSec: null, bestCourtesy: 100, errandsCompleted: 0 };
    const parsed = JSON.parse(raw) as Partial<StoredTrialRecords>;
    return {
      bestLapSec: typeof parsed.bestLapSec === 'number' && parsed.bestLapSec > 5 ? parsed.bestLapSec : null,
      bestCourtesy: typeof parsed.bestCourtesy === 'number' ? parsed.bestCourtesy : 100,
      errandsCompleted: typeof parsed.errandsCompleted === 'number' ? parsed.errandsCompleted : 0,
    };
  } catch {
    return { bestLapSec: null, bestCourtesy: 100, errandsCompleted: 0 };
  }
}

export function saveTrialRecords(records: StoredTrialRecords): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // ignore storage quota errors
  }
}
