import * as THREE from 'three';
import { createCharacterPool } from './characterModels';
import { ModelTInstrumentKey } from './modelTGeometry';
import { getTerrainHeightAndSurface } from './terrain';
import { ControlMode, VehicleState } from './types';

export type PassengerId = 'mechanic' | 'sheep' | 'lady' | 'schoolboy' | 'captain';

export interface PassengerSpec {
  id: PassengerId;
  name: string;
  shortName: string;
  roleLabel: string;
  badgeSubtitle: string;
  mapInitial: string;
  voiceRole: string;
  pickupX: number;
  pickupZ: number;
  pickupYaw: number;
  pickupLabel: string;
  approachX: number;
  approachZ: number;
  approachYaw: number;
  dropoffX: number;
  dropoffZ: number;
  dropoffLabel: string;
  mapColor: string;
  greetingLine: string;
  fullCarLine: string;
  dropoffSuccessLine: string;
  earlyUnloadLine: string;
}

export interface WaitingMapPoint {
  id: PassengerId;
  x: number;
  z: number;
  color: string;
  name: string;
  initial: string;
  roleLabel: string;
  pickupLabel: string;
  isInstructor: boolean;
}

export interface ArthurLessonStep {
  key: ModelTInstrumentKey;
  title: string;
  instruction: string;
  controlHint: string;
  camOffset: [number, number, number];
  lookOffset: [number, number, number];
  fov: number;
  interiorShot: boolean;
}

export const ARTHUR_LESSON_STEPS: ArthurLessonStep[] = [
  {
    key: 'ignition',
    title: '1. Ignition Coil Box & Switch',
    instruction:
      "Flip the brass ignition switch ON first so the four wooden trembler coils hum with magneto current.",
    controlHint: 'Press I or click Start Engine',
    camOffset: [-0.14, 1.24, -0.34],
    lookOffset: [0.14, 0.85, 0.08],
    fov: 44,
    interiorShot: true,
  },
  {
    key: 'sparkThrottle',
    title: '2. Spark Advance & Hand Throttle',
    instruction:
      "Left brass lever sets Spark timing; right lever sets Hand Throttle. Always retard Spark left before cranking!",
    controlHint: 'Q / E for Spark · Throttle slider or W',
    camOffset: [-0.03, 1.28, -0.45],
    lookOffset: [-0.23, 1.04, -0.14],
    fov: 42,
    interiorShot: true,
  },
  {
    key: 'crank',
    title: '3. Front Hand-Crank',
    instruction:
      "Step in front of the brass radiator and give the crank a brisk upward pull. Keep Spark retarded or she'll kick back!",
    controlHint: 'Press C or click Hand-Crank',
    camOffset: [0.78, 0.80, 2.52],
    lookOffset: [0, 0.43, 1.40],
    fov: 44,
    interiorShot: false,
  },
  {
    key: 'pedals',
    title: '4. Three Planetary Floor Pedals',
    instruction:
      "No stick shift here! Left pedal (Shift) holds Low gear, middle (X) reverses, and right (S) brakes the transmission.",
    controlHint: '3-Pedal: Shift (Low) · X (Rev) · S (Brake)',
    camOffset: [-0.12, 1.18, -0.44],
    lookOffset: [-0.23, 0.56, 0.08],
    fov: 45,
    interiorShot: true,
  },
  {
    key: 'handbrake',
    title: '5. Handbrake & High-Clutch Lever',
    instruction:
      "Pull back to Park, upright for Neutral when starting, or forward to lock High gear once rolling.",
    controlHint: 'Space toggles High / Neutral / Park in 3-Pedal',
    camOffset: [-1.08, 1.18, -0.42],
    lookOffset: [-0.43, 0.78, -0.05],
    fov: 44,
    interiorShot: false,
  },
  {
    key: 'gauges',
    title: '6. Speedometer & Magneto Ammeter',
    instruction:
      "Check the Stewart-Warner dial up to 45 mph and watch the ammeter needle charge as engine revs rise.",
    controlHint: 'Keep cool on Cape Wanbrow in Low gear',
    camOffset: [-0.14, 1.07, -0.28],
    lookOffset: [-0.15, 0.87, 0.13],
    fov: 42,
    interiorShot: true,
  },
];

export interface PassengerHudState {
  onboardId: PassengerId | null;
  onboardName: string | null;
  onboardRole: string | null;
  dropoffLabel: string | null;
  dropoffX: number | null;
  dropoffZ: number | null;
  nearbyWaitingId: PassengerId | null;
  nearbyWaitingName: string | null;
  nearbyWaitingRole: string | null;
  nearbyWaitingDist: number | null;
  waitingPoints: WaitingMapPoint[];
  coachTip: string | null;
  coachFocusKey: ModelTInstrumentKey | null;
  noticeText: string | null;
}

export const PASSENGERS: PassengerSpec[] = [
  {
    id: 'mechanic',
    name: "Arthur 'Spanner' O'Malley",
    shortName: 'Mechanic Arthur',
    roleLabel: 'Ford T Driving Instructor',
    badgeSubtitle: 'Ford T Driving Tutor · Press P',
    mapInitial: 'A',
    voiceRole: 'Mechanic',
    pickupX: -36,
    pickupZ: -7.5,
    pickupYaw: 0,
    pickupLabel: 'Harbour St Garage Steps',
    approachX: -45,
    approachZ: -3.0,
    approachYaw: Math.PI / 2,
    dropoffX: 90,
    dropoffZ: -5.5,
    dropoffLabel: 'Sumpter Wharf Sheds',
    mapColor: '#e8b948',
    greetingLine:
      "G'day driver! Hopping in—I'm Arthur. Let me show you how Henry Ford's planetary pedals and levers really sing!",
    fullCarLine:
      "Oi, only room for one in that front bench! Unload your current passenger first if you want a Ford T lesson!",
    dropoffSuccessLine:
      "Right outside the Wharf Sheds! You've got the knack of Lizzie now—mind that spark lever!",
    earlyUnloadLine:
      "Righto, I'll hop out here! Remember: retard that spark before cranking, or she'll kick your thumb into next Tuesday!",
  },
  {
    id: 'sheep',
    name: 'Baa-bara',
    shortName: 'Baa-bara the Ewe',
    roleLabel: 'Prize Merino Ewe',
    badgeSubtitle: 'Prize Merino Ewe · Press P',
    mapInitial: 'B',
    voiceRole: 'Sheep',
    pickupX: 24,
    pickupZ: 109.2,
    pickupYaw: Math.PI,
    pickupLabel: 'Cape Wanbrow Paddock Edge',
    approachX: 31,
    approachZ: 114,
    approachYaw: -Math.PI / 2,
    dropoffX: -2,
    dropoffZ: -6.5,
    dropoffLabel: 'Loan & Mercantile Wool Store',
    mapColor: '#f3ede0',
    greetingLine:
      'Baaa! (Translation: Thank woolly goodness! Kindly drive me down to the Loan & Mercantile—my hooves are killing me.)',
    fullCarLine:
      "Baaa-aa! Hey! My fleece won't fit alongside whoever's hogging the leather seat!",
    dropoffSuccessLine:
      "Maaaa! The Wool Store! Wait... why are those gentlemen holding giant shears?! Bye, driver!",
    earlyUnloadLine:
      'Baaa! Lovely ride—four stars for the suspension, minus one for cornering like a sheepdog!',
  },
  {
    id: 'lady',
    name: 'Mrs. Clara Kensington',
    shortName: 'Mrs. Kensington',
    roleLabel: 'Edwardian Tea-Party Lady',
    badgeSubtitle: 'Tea-Party Lady · Press P',
    mapInitial: 'K',
    voiceRole: 'Lady',
    pickupX: -102,
    pickupZ: -18,
    pickupYaw: Math.PI / 2,
    pickupLabel: 'Oamaru Opera House',
    approachX: -104,
    approachZ: -26,
    approachYaw: 0,
    dropoffX: -54,
    dropoffZ: 6.8,
    dropoffLabel: 'Criterion Hotel Parlour',
    mapColor: '#d97b93',
    greetingLine:
      'Oh, how splendid! Do be a dear and convey me to the Criterion Hotel—and pray mind my sponge cake and floral hat!',
    fullCarLine:
      'Good gracious! A gentleman does not stack passengers like wool bales! Unload your companion first!',
    dropoffSuccessLine:
      'Arrived with every lamington intact! You are a credit to North Otago motoring, driver!',
    earlyUnloadLine:
      'Well! I suppose I shall promenade the remainder of the way. Good day to you, chauffeur!',
  },
  {
    id: 'schoolboy',
    name: 'Master Tommy Pritchard',
    shortName: 'Tommy (Schoolboy)',
    roleLabel: 'Truant Schoolboy',
    badgeSubtitle: 'Truant Schoolboy · Press P',
    mapInitial: 'T',
    voiceRole: 'Schoolboy',
    pickupX: -144,
    pickupZ: 48,
    pickupYaw: Math.PI / 2,
    pickupLabel: 'Waitaki Courthouse Corner',
    approachX: -149.5,
    approachZ: 40,
    approachYaw: 0,
    dropoffX: 92,
    dropoffZ: 5.5,
    dropoffLabel: 'Sumpter Wharf Steamers',
    mapColor: '#69c292',
    greetingLine:
      "Crikey, thanks mister! Step on it before the Latin master catches me—take me down to the harbour steamers!",
    fullCarLine:
      "Aw man, your front seat's already taken! Kick 'em out so I can ride shotgun!",
    dropoffSuccessLine:
      "Wicked ride, mister! Look at the size of that steamer funnel! Don't tell my mum you saw me!",
    earlyUnloadLine:
      'Cheers for the lift! Bet you ten marbles Constable Finch is still looking for us!',
  },
  {
    id: 'captain',
    name: "Capt. 'Barnacle' Pike",
    shortName: 'Captain Pike',
    roleLabel: 'Retired Harbour Master',
    badgeSubtitle: 'Harbour Master · Press P',
    mapInitial: 'C',
    voiceRole: 'Captain',
    pickupX: 84,
    pickupZ: 8,
    pickupYaw: -Math.PI / 2,
    pickupLabel: 'Sumpter Wharf Quay',
    approachX: 76,
    approachZ: 3.2,
    approachYaw: Math.PI / 2,
    dropoffX: -6,
    dropoffZ: 117.5,
    dropoffLabel: 'Wanbrow Ridge Lookout',
    mapColor: '#6aa9d9',
    greetingLine:
      'Ahoy, helmsman! Come about and set course for Cape Wanbrow Ridge—time to inspect the Pacific swell!',
    fullCarLine:
      "Belay that! Only one berth on this land-schooner's bridge—put your passenger ashore first!",
    dropoffSuccessLine:
      'Drop anchor! Grand view of the bay, Mr. Mate—this black tin frigate handles better than a steam tug!',
    earlyUnloadLine:
      'Fair winds and dry macadam to ye, helmsman! Keep a weather eye for harbour potholes!',
  },
];

export function getPassengerById(id: PassengerId): PassengerSpec {
  return PASSENGERS.find((p) => p.id === id) ?? PASSENGERS[0];
}

export function getMechanicLiveTipWithFocus(
  state: VehicleState,
  controlMode: ControlMode,
  lastImpactAtAgeSec: number
): { text: string; focusKey: ModelTInstrumentKey | null } {
  if (!state.ignitionOn) {
    return {
      text: "Step 1: Flip Ignition ON (press I), retard the Spark lever left (Q), then pull the Hand-Crank (C)!",
      focusKey: 'ignition',
    };
  }
  if (state.crankKickbackWarning) {
    return {
      text: "Ouch—kickback! Always retard Spark (Q) below 65% before cranking, or she'll snap your wrist!",
      focusKey: 'sparkThrottle',
    };
  }
  if (!state.engineRunning) {
    return {
      text:
        state.crankingProgress > 0
          ? 'Turn that crank briskly—wait for the 4 cylinders to catch!'
          : "Ignition's buzzing! Pull the Hand-Crank (C) to fire up the 2.9L flathead!",
      focusKey: 'crank',
    };
  }
  if (state.isOverheating || state.engineTempC > 96) {
    return {
      text: "Radiator's steaming! No water pump in a '14 Lizzie—ease the throttle or press Shift for Low gear to cool her down!",
      focusKey: 'gauges',
    };
  }
  if (state.knocking) {
    return {
      text: "Hear that metallic ping? That's spark knock—slide Spark Advance back slightly (Q) under heavy load!",
      focusKey: 'sparkThrottle',
    };
  }
  if (state.gear === 'HIGH' && state.slopePercent > 4.5 && state.speedMph < 13) {
    return {
      text: "She's lugging uphill in High! Hold Shift (Low pedal) for the 2.75:1 planetary reduction—don't stall!",
      focusKey: 'pedals',
    };
  }
  if (lastImpactAtAgeSec < 3.0) {
    return {
      text: 'Easy on the hickory spokes! Watch out for potholes and timber crates on Harbour Street!',
      focusKey: null,
    };
  }
  if (state.speedMph > 24) {
    return {
      text: 'Steady! Two-wheel rear transmission brakes only—give yourself plenty of distance before corners!',
      focusKey: null,
    };
  }
  if (state.speedMph < 1.2) {
    return controlMode === 'authentic'
      ? {
          text: '3-Pedal Lesson: Advance Spark (E), open Throttle slightly, release Handbrake (Space) to High or hold Shift for Low!',
          focusKey: 'pedals',
        }
      : {
          text: 'WASD Lesson: Hold W to glide off in Low then auto-shift to High; use S to brake or double-back into Reverse!',
          focusKey: 'pedals',
        };
  }
  if (state.currentSurface === 'cobbles') {
    return {
      text: 'Bluestone cobbles ahead—grip the wooden steering rim lightly and let the transverse leaf springs soak the rattle!',
      focusKey: null,
    };
  }
  if (state.currentSurface === 'mud' || state.currentSurface === 'grass') {
    return {
      text: 'Off the limestone road! Keep steady throttle and gentle steering—sharp turns will spin the rear axle!',
      focusKey: null,
    };
  }
  if (state.sparkAdvance < 0.35 && state.rpm > 1050) {
    return {
      text: "Once she's cruising nicely, advance the Spark lever (E) rightwards for crisper power and cooler exhaust!",
      focusKey: 'sparkThrottle',
    };
  }
  return {
    text: 'Purring like a sewing machine! Keep revs smooth, advance Spark (E) at cruise, and watch your radiator temp!',
    focusKey: null,
  };
}

export function getMechanicLiveLesson(
  state: VehicleState,
  controlMode: ControlMode,
  lastImpactAtAgeSec: number
): string {
  return getMechanicLiveTipWithFocus(state, controlMode, lastImpactAtAgeSec).text;
}

export type PassengerRideEvent =
  | 'bump'
  | 'speeding'
  | 'horn'
  | 'skid'
  | 'slow_cruise'
  | 'near_piper';

export function pickPassengerRideLine(
  id: PassengerId,
  event: PassengerRideEvent,
  cursor: number,
  state: VehicleState,
  controlMode: ControlMode
): string {
  if (id === 'mechanic') {
    if (event === 'bump') {
      return "Crikey, what a crater! Good thing Henry built these axles out of vanadium steel—watch those potholes!";
    }
    if (event === 'skid') {
      return "Whoa! Counter-steer gently and lift off the hand throttle—never stamp the brake mid-skid!";
    }
    if (event === 'horn') {
      return "Lovely brass bulb horn! Gives the horses fair warning before we chug past!";
    }
    if (event === 'near_piper') {
      return "Hear old Angus on the pipes? Keep wide of him—his knees move faster than a Model T in Low!";
    }
    const mechanicLessons = [
      getMechanicLiveLesson(state, controlMode, 99),
      "Tip: In 1914 you don't shift a stick—everything's planetary bands! Low pedal, Reverse pedal, Brake pedal, and Handbrake!",
      "Tip: Uphill on Cape Wanbrow, High gear heats the thermosyphon fast. Hold Low (Shift) and let her spin!",
      "Tip: Before parking, pull the Handbrake all the way back to Neutral/Park and shut off the coil switch (I)!",
      "Tip: If you snap throttle shut from high RPM, unburnt petrol pops in the exhaust—a classic Model T backfire!",
    ];
    return mechanicLessons[cursor % mechanicLessons.length];
  }

  if (id === 'sheep') {
    const pools: Record<PassengerRideEvent, string[]> = {
      bump: [
        'BAAA-AAAH! My prized Merino curls just bounced out of position!',
        'Maaaa! Watch that pothole—I am a pedigree ewe, not a sack of turnips!',
      ],
      speeding: [
        'BAAA! Ears flapping in the slipstream—we’re faster than a border collie!',
        'Baa-aa-aaa! Slow down before Constable Finch shears my wool licence!',
      ],
      horn: [
        'Baa! Honk back at old Toby the collie—show him who rides up front now!',
        'Maaa! That brass horn harmonizes splendidly with my baritone bleat!',
      ],
      skid: [
        'BAAA! Hooves don’t grip tufted leather when you drift round corners like that!',
        'Maaaa-aa! Sideways down Harbour Street—I regret skipping breakfast tussock!',
      ],
      near_piper: [
        'BAAA! Look out, it’s Angus! Bagpipes sound eerily like my cousin Nigel in trouble!',
        'Maaa! Run, Scotsman, run! Keep my fleece clear of those tassels!',
      ],
      slow_cruise: [
        'Baa~ Gently does it. Far nicer than walking up Wanbrow Ridge.',
        'Baa! (Translation: Is there any clover in the glovebox? No? Only brass spanners?)',
        'Maaa~ All the other ewes in the paddock are going to be green with envy.',
      ],
    };
    const pool = pools[event];
    return pool[cursor % pool.length];
  }

  if (id === 'lady') {
    const pools: Record<PassengerRideEvent, string[]> = {
      bump: [
        'Oh heavens above! My floral hat just struck the canvas canopy!',
        'Goodness gracious! Kindly steer around the craters—my sponge cake is trembling!',
      ],
      speeding: [
        'Mercy me! Twenty miles an hour?! My poor pearls are flying backwards!',
        'Slow down at once, driver! Ladies do not travel at hurricane velocity!',
      ],
      horn: [
        'Oh! Must you blast that brass trumpet so near my ear, young man?',
        'Well—at least the merchants know someone of distinction is approaching!',
      ],
      skid: [
        'AIIEE! My lamingtons! Straighten this horseless carriage immediately!',
        'Gracious! Are we motored to the Criterion Hotel or spun like a cream separator?!',
      ],
      near_piper: [
        'Oh, how cultural—Wait, driver, do NOT aim the radiator at that tartan gentleman!',
        'Goodness, poor Angus looks positively terrified of our headlamps!',
      ],
      slow_cruise: [
        'How utterly civilized. Nearly as smooth as a railway parlour car.',
        'Look at the fine Whitestone carving along Thames Street—lovely afternoon for a drive.',
        'Do keep an eye out for my friend Evelyn near the Opera House steps.',
      ],
    };
    const pool = pools[event];
    return pool[cursor % pool.length];
  }

  if (id === 'schoolboy') {
    const pools: Record<PassengerRideEvent, string[]> = {
      bump: [
        'WOOHOO!! Did you feel the front springs bottom out?! Hit another pothole!',
        'AWESOME! My Latin textbook just flew out onto the running board—good riddance!',
      ],
      speeding: [
        'GO FASTER, MISTER! Give her full hand throttle—let’s beat that red touring car!',
        'CRIKEY, THIS IS BRILLIANT! Thirty miles an hour feels like an aeroplane!',
      ],
      horn: [
        'HONK IT AGAIN!! HAHA! Look at that gentleman drop his bowler hat!',
        'TOOT TOOT! Best brass horn in all of North Otago!',
      ],
      skid: [
        'WHOA!! BROADSIDE SLIDE! Wait till I tell the fifth-form boys on Monday!',
        'EPIC DRIFT! Do a donut outside the Waitaki Courthouse!',
      ],
      near_piper: [
        'HAHAHA! Look at the bagpiper sprint! Squeeze his pipes with a horn toot!',
        'RACE THE BAGPIPER! Bet his kilt flaps faster than our fan belt!',
      ],
      slow_cruise: [
        'Aw, why are we creeping along? Pull the throttle lever right down!',
        'Look out, is that the Headmaster near the Post Office? Duck down!',
        'When I grow up, I’m gonna buy a black Model T and drive it through the playground!',
      ],
    };
    const pool = pools[event];
    return pool[cursor % pool.length];
  }

  // Captain Pike
  const pools: Record<PassengerRideEvent, string[]> = {
    bump: [
      'Belay! Heavy chop off the port bow—steer clear of them macadam reefs!',
      'By Neptune’s beard! That pothole felt like crossing the Oamaru breakwater in a gale!',
    ],
    speeding: [
      'Full steam ahead, Mr. Mate! She’s making twenty-five knots on a dry road!',
      'Steady the helm! Reef the canvas top before we take flight over Wanbrow!',
    ],
    horn: [
      'Sound the foghorn! Clear the channel for the SS Model T!',
      'Aye, give ’em two short blasts—starboard passing signal!',
    ],
    skid: [
      'Hard a-starboard! She’s broaching to in the gravel swell—bring her head up!',
      'Whoa there! Drops the stern like a barque rounding Cape Saunders!',
    ],
    near_piper: [
      'Avast! Highland piper off the bow! Give him plenty of sea room, helmsman!',
      'Ha! That Scotsman tacks faster than a harbour pilot cutter!',
    ],
    slow_cruise: [
      'Smooth sailing, lad. Fair winds and calm tarmac down Harbour Street.',
      'Aye, Mr. Ford’s engine beats shoveling Westport coal into a donkey boiler!',
      'Keep her steady on course—I can smell the Pacific brine from here.',
    ],
  };
  const pool = pools[event];
  return pool[cursor % pool.length];
}

interface BuiltCharacterRig {
  group: THREE.Group;
  headPivot: THREE.Object3D;
  armPivots: THREE.Object3D[];
  legPivots: THREE.Object3D[];
  propPivot?: THREE.Object3D;
}

export interface PassengerSystemHandle {
  group: THREE.Group;
  update: (
    dt: number,
    elapsed: number,
    state: VehicleState
  ) => {
    nearbyWaiting: PassengerSpec | null;
    nearbyDist: number;
    atPreferredDropoff: boolean;
  };
  getOnboardId: () => PassengerId | null;
  getWaitingMapPoints: () => WaitingMapPoint[];
  boardPassenger: (spec: PassengerSpec) => void;
  unloadPassenger: (currentX: number, currentZ: number, atDropoff: boolean) => PassengerSpec | null;
  resetAll: () => void;
  dispose: () => void;
}

export function buildPassengerSystem(seatParent: THREE.Group): PassengerSystemHandle {
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const group = new THREE.Group();
  const charPool = track(createCharacterPool());
  const hankyGeo = track(new THREE.PlaneGeometry(0.24, 0.22));

  const createPassengerMesh = (id: PassengerId, seated: boolean): BuiltCharacterRig => {
    if (id === 'sheep') {
      const sheepRig = charPool.buildSheep({
        seated,
        hasRibbon: true,
        withHorns: false,
      });
      return {
        group: sheepRig.group,
        headPivot: sheepRig.headPivot,
        armPivots: [sheepRig.legPivots[0]],
        legPivots: sheepRig.legPivots,
      };
    }

    const humanRig = charPool.buildHuman(id, 0, { seated });
    if (!seated) {
      // Bright waving hail handkerchief attached to sculpted hand on right forearm
      const hankyMat = track(
        new THREE.MeshBasicMaterial({
          color: id === 'mechanic' ? 0xf5d173 : 0xfaf7ef,
          side: THREE.DoubleSide,
        })
      );
      const hanky = new THREE.Mesh(hankyGeo, hankyMat);
      hanky.position.set(0.02, -0.30, 0.04);
      hanky.rotation.z = 0.25;
      humanRig.rightElbow.add(hanky);
    }

    return {
      group: humanRig.group,
      headPivot: humanRig.headPivot,
      armPivots: [humanRig.leftArm, humanRig.rightArm],
      legPivots: [humanRig.leftLeg, humanRig.rightLeg],
      propPivot: humanRig.propPivot,
    };
  };

  const createPlacardSprite = (
    title: string,
    subtitle: string,
    accentHex: string,
    bgHex = 'rgba(22, 20, 17, 0.90)'
  ): THREE.Sprite => {
    const canvas = document.createElement('canvas');
    canvas.width = 420;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Rounded sign plate
      const x = 8;
      const y = 8;
      const w = canvas.width - 16;
      const h = canvas.height - 24;
      const r = 18;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + w * 0.54, y + h);
      ctx.lineTo(x + w * 0.5, y + h + 14);
      ctx.lineTo(x + w * 0.46, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();

      ctx.fillStyle = bgHex;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = accentHex;
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillStyle = '#f8f3e8';
      ctx.font = 'bold 31px Georgia, serif';
      ctx.fillText(title, canvas.width * 0.5, 50);

      ctx.fillStyle = accentHex;
      ctx.font = '600 22px system-ui, sans-serif';
      ctx.fillText(subtitle, canvas.width * 0.5, 86);
    }
    const tex = track(new THREE.CanvasTexture(canvas));
    tex.needsUpdate = true;
    const mat = track(
      new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
      })
    );
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.45, 0.75, 1);
    return sprite;
  };

  interface PassengerRuntime {
    spec: PassengerSpec;
    waitingRig: BuiltCharacterRig;
    waitingAnchor: THREE.Group;
    beaconRing: THREE.Mesh;
    beaconColumn: THREE.Mesh;
    placardSprite: THREE.Sprite;
    basePlacardY: number;
    seatedRig: BuiltCharacterRig;
    cooldownUntilElapsed: number;
  }

  const beaconGeo = track(new THREE.RingGeometry(0.68, 0.96, 28));
  beaconGeo.rotateX(-Math.PI / 2);
  const columnGeo = track(new THREE.CylinderGeometry(0.14, 0.62, 4.6, 14, 1, true));

  const runtimes: PassengerRuntime[] = PASSENGERS.map((spec) => {
    const waitingAnchor = new THREE.Group();
    const wy = getTerrainHeightAndSurface(spec.pickupX, spec.pickupZ).height;
    waitingAnchor.position.set(spec.pickupX, wy, spec.pickupZ);

    const waitingRig = createPassengerMesh(spec.id, false);
    waitingRig.group.rotation.y = spec.pickupYaw;
    waitingAnchor.add(waitingRig.group);

    const accentColor = spec.id === 'mechanic' ? 0xe8b948 : 0x5ecb8b;
    const accentCss = spec.id === 'mechanic' ? '#f0c65d' : '#73e09f';

    const beaconMat = track(
      new THREE.MeshBasicMaterial({
        color: accentColor,
        transparent: true,
        opacity: 0.78,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    const beaconRing = new THREE.Mesh(beaconGeo, beaconMat);
    beaconRing.position.set(0, 0.05, 0);
    waitingAnchor.add(beaconRing);

    const columnMat = track(
      new THREE.MeshBasicMaterial({
        color: accentColor,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    const beaconColumn = new THREE.Mesh(columnGeo, columnMat);
    beaconColumn.position.set(0, 2.32, 0);
    waitingAnchor.add(beaconColumn);

    const basePlacardY = spec.id === 'sheep' ? 2.15 : 2.68;
    const placardSprite = createPlacardSprite(spec.shortName, spec.badgeSubtitle, accentCss);
    placardSprite.position.set(0, basePlacardY, 0);
    waitingAnchor.add(placardSprite);

    group.add(waitingAnchor);

    // Front left passenger bench seat inside Ford Model T (driver is right-hand drive at x = -0.23)
    const seatedRig = createPassengerMesh(spec.id, true);
    seatedRig.group.position.set(0.24, 0.64, -0.27);
    seatedRig.group.rotation.y = -0.14;
    seatedRig.group.visible = false;
    seatParent.add(seatedRig.group);

    return {
      spec,
      waitingRig,
      waitingAnchor,
      beaconRing,
      beaconColumn,
      placardSprite,
      basePlacardY,
      seatedRig,
      cooldownUntilElapsed: -1,
    };
  });

  // Ground dropoff destination beacon + floating marker (shown whenever a passenger is onboard)
  const dropoffGroup = new THREE.Group();
  const dropoffBeacon = new THREE.Mesh(
    track(new THREE.RingGeometry(1.15, 1.55, 28)),
    track(
      new THREE.MeshBasicMaterial({
        color: 0x5ec2e6,
        transparent: true,
        opacity: 0.76,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    )
  );
  dropoffBeacon.rotation.x = -Math.PI / 2;
  const dropoffColumn = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.22, 1.05, 6.2, 16, 1, true)),
    track(
      new THREE.MeshBasicMaterial({
        color: 0x5ec2e6,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    )
  );
  dropoffColumn.position.set(0, 3.1, 0);
  const dropoffPlacard = createPlacardSprite('Passenger Dropoff', 'Stop Here to Unload', '#7bd3f4');
  dropoffPlacard.position.set(0, 3.6, 0);
  dropoffGroup.add(dropoffBeacon, dropoffColumn, dropoffPlacard);
  dropoffGroup.visible = false;
  group.add(dropoffGroup);

  let onboardId: PassengerId | null = null;
  let lastElapsed = 0;

  return {
    group,
    update: (_dt: number, elapsed: number, state: VehicleState) => {
      lastElapsed = elapsed;
      let nearbyWaiting: PassengerSpec | null = null;
      let nearbyDist = Infinity;

      for (let i = 0; i < runtimes.length; i++) {
        const rt = runtimes[i];
        const isOnboard = onboardId === rt.spec.id;
        const onCooldown = elapsed < rt.cooldownUntilElapsed;
        const showWaiting = !isOnboard && !onCooldown;

        rt.waitingAnchor.visible = showWaiting;
        rt.seatedRig.group.visible = isOnboard;

        if (showWaiting) {
          const dist = Math.hypot(state.x - rt.spec.pickupX, state.z - rt.spec.pickupZ);
          if (dist < 10.5 && dist < nearbyDist) {
            nearbyDist = dist;
            nearbyWaiting = rt.spec;
          }

          // Keep floating nameplate readable down the street without cluttering far horizon
          const placardScale = THREE.MathUtils.clamp(0.95 + dist * 0.025, 0.95, 2.5);
          rt.placardSprite.scale.set(2.45 * placardScale, 0.75 * placardScale, 1);
          rt.placardSprite.position.y =
            rt.basePlacardY + Math.sin(elapsed * 2.4 + i) * 0.08 + Math.min(1.4, dist * 0.02);
          rt.placardSprite.visible = dist < 95;

          if (dist < 42) {
            // Turn toward the oncoming Model T and wave enthusiastically!
            const faceYaw = Math.atan2(state.x - rt.spec.pickupX, state.z - rt.spec.pickupZ);
            rt.waitingRig.group.rotation.y = faceYaw;

            if (rt.spec.id === 'sheep') {
              const hop = Math.abs(Math.sin(elapsed * 5.2)) * 0.08;
              rt.waitingRig.group.position.y = hop;
              if (rt.waitingRig.armPivots[0]) {
                rt.waitingRig.armPivots[0].rotation.x = -0.65 + Math.sin(elapsed * 11) * 0.55;
              }
              rt.waitingRig.headPivot.rotation.z = Math.sin(elapsed * 4.5) * 0.14;
            } else {
              rt.waitingRig.group.position.y = Math.abs(Math.sin(elapsed * 4.2 + i)) * 0.035;
              const waveAngle = -2.45 + Math.sin(elapsed * 9.5 + i) * 0.45;
              if (rt.waitingRig.armPivots[1]) {
                rt.waitingRig.armPivots[1].rotation.z = -0.35;
                rt.waitingRig.armPivots[1].rotation.x = waveAngle;
              }
              if (rt.spec.id === 'schoolboy' && rt.waitingRig.armPivots[0]) {
                rt.waitingRig.armPivots[0].rotation.z = 0.35;
                rt.waitingRig.armPivots[0].rotation.x = -2.3 + Math.cos(elapsed * 9.5) * 0.45;
              }
              rt.waitingRig.headPivot.rotation.y = Math.sin(elapsed * 2.5 + i) * 0.18;
            }
          } else {
            rt.waitingRig.group.rotation.y = rt.spec.pickupYaw;
            rt.waitingRig.group.position.y = 0;
            if (rt.waitingRig.armPivots[1]) {
              rt.waitingRig.armPivots[1].rotation.x = Math.sin(elapsed * 2.2 + i) * 0.12;
              rt.waitingRig.armPivots[1].rotation.z = 0;
            }
          }
        }

        if (isOnboard) {
          // Subtle lively passenger riding animation inside the Model T front bench
          const speedLean = Math.min(0.18, state.speedMps * 0.012);
          const bumpJolt = Math.sin(elapsed * 14) * Math.min(0.05, state.speedMps * 0.004);
          rt.seatedRig.group.position.y = 0.64 + Math.max(0, bumpJolt) * 0.4;
          rt.seatedRig.group.rotation.z = -state.roll * 0.65 - state.yawRate * 0.08;
          rt.seatedRig.group.rotation.x = -speedLean * 0.3;

          if (rt.spec.id === 'sheep') {
            rt.seatedRig.headPivot.rotation.y = Math.sin(elapsed * 2.4) * 0.25;
            rt.seatedRig.headPivot.rotation.z = Math.sin(elapsed * 4.0) * 0.12;
          } else if (rt.spec.id === 'mechanic') {
            // Looks over toward driver / dashboard and gestures with spanner
            rt.seatedRig.headPivot.rotation.y = 0.22 + Math.sin(elapsed * 1.9) * 0.14;
            if (rt.seatedRig.armPivots[1]) {
              rt.seatedRig.armPivots[1].rotation.x = -0.85 + Math.sin(elapsed * 3.4) * 0.16;
            }
          } else if (rt.spec.id === 'schoolboy') {
            // Excitedly bouncing & pumping arms when moving fast
            const hype = state.speedMph > 14 ? 1.0 : 0.25;
            rt.seatedRig.headPivot.rotation.y = Math.sin(elapsed * 3.8) * 0.28;
            if (rt.seatedRig.armPivots[0]) {
              rt.seatedRig.armPivots[0].rotation.x = -0.85 - hype * Math.abs(Math.sin(elapsed * 8)) * 0.85;
            }
            if (rt.seatedRig.armPivots[1]) {
              rt.seatedRig.armPivots[1].rotation.x = -0.85 - hype * Math.abs(Math.cos(elapsed * 8)) * 0.85;
            }
          } else if (rt.spec.id === 'lady') {
            // Holds onto her wide floral hat at speed or bumps!
            rt.seatedRig.headPivot.rotation.y = Math.sin(elapsed * 1.6) * 0.14;
            if (rt.seatedRig.armPivots[1]) {
              rt.seatedRig.armPivots[1].rotation.x = state.speedMph > 12 ? -2.25 : -0.7;
            }
          } else {
            // Captain scans horizon with spyglass
            rt.seatedRig.headPivot.rotation.y = Math.sin(elapsed * 1.2) * 0.24;
            if (rt.seatedRig.armPivots[1]) {
              rt.seatedRig.armPivots[1].rotation.x = -1.25 + Math.sin(elapsed * 1.5) * 0.12;
            }
          }
        }
      }

      let atPreferredDropoff = false;
      if (onboardId) {
        const spec = getPassengerById(onboardId);
        const dropH = getTerrainHeightAndSurface(spec.dropoffX, spec.dropoffZ).height;
        const dDrop = Math.hypot(state.x - spec.dropoffX, state.z - spec.dropoffZ);
        dropoffGroup.visible = true;
        dropoffGroup.position.set(spec.dropoffX, dropH + 0.05, spec.dropoffZ);
        const dScale = THREE.MathUtils.clamp(1.0 + dDrop * 0.025, 1.0, 2.6);
        dropoffPlacard.scale.set(2.45 * dScale, 0.75 * dScale, 1);
        atPreferredDropoff = dDrop < 13.5;
      } else {
        dropoffGroup.visible = false;
      }

      return {
        nearbyWaiting,
        nearbyDist: Number.isFinite(nearbyDist) ? nearbyDist : 999,
        atPreferredDropoff,
      };
    },
    getOnboardId: () => onboardId,
    getWaitingMapPoints: () =>
      runtimes
        .filter((rt) => onboardId !== rt.spec.id && lastElapsed >= rt.cooldownUntilElapsed)
        .map((rt) => ({
          id: rt.spec.id,
          x: rt.spec.pickupX,
          z: rt.spec.pickupZ,
          color: rt.spec.mapColor,
          name: rt.spec.shortName,
          initial: rt.spec.mapInitial,
          roleLabel: rt.spec.roleLabel,
          pickupLabel: rt.spec.pickupLabel,
          isInstructor: rt.spec.id === 'mechanic',
        })),
    boardPassenger: (spec: PassengerSpec) => {
      onboardId = spec.id;
    },
    unloadPassenger: (currentX: number, currentZ: number, atDropoff: boolean) => {
      if (!onboardId) return null;
      const spec = getPassengerById(onboardId);
      const rt = runtimes.find((r) => r.spec.id === onboardId);
      onboardId = null;
      if (rt) {
        rt.seatedRig.group.visible = false;
        if (atDropoff) {
          rt.cooldownUntilElapsed = lastElapsed + 18;
        } else {
          // If unloaded nearby their pickup spot, give a brief cooldown so they don't instantly re-trigger
          const nearHome = Math.hypot(currentX - spec.pickupX, currentZ - spec.pickupZ) < 16;
          rt.cooldownUntilElapsed = lastElapsed + (nearHome ? 8 : 2);
        }
      }
      dropoffGroup.visible = false;
      return spec;
    },
    resetAll: () => {
      onboardId = null;
      dropoffGroup.visible = false;
      for (const rt of runtimes) {
        rt.cooldownUntilElapsed = -1;
        rt.seatedRig.group.visible = false;
        rt.waitingAnchor.visible = true;
      }
    },
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
