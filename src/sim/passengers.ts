import * as THREE from 'three';
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

export function getMechanicLiveLesson(
  state: VehicleState,
  controlMode: ControlMode,
  lastImpactAtAgeSec: number
): string {
  if (!state.ignitionOn) {
    return "Step 1: Flip Ignition ON (press I), retard the Spark lever left (Q), then pull the Hand-Crank (C)!";
  }
  if (state.crankKickbackWarning) {
    return "Ouch—kickback! Always retard Spark (Q) below 65% before cranking, or she'll snap your wrist!";
  }
  if (!state.engineRunning) {
    return state.crankingProgress > 0
      ? "Turn that crank briskly—wait for the 4 cylinders to catch!"
      : "Ignition's buzzing! Pull the Hand-Crank (C) to fire up the 2.9L flathead!";
  }
  if (state.isOverheating || state.engineTempC > 96) {
    return "Radiator's steaming! No water pump in a '14 Lizzie—ease the throttle or press Shift for Low gear to cool her down!";
  }
  if (state.knocking) {
    return "Hear that metallic ping? That's spark knock—slide Spark Advance back slightly (Q) under heavy load!";
  }
  if (state.gear === 'HIGH' && state.slopePercent > 4.5 && state.speedMph < 13) {
    return "She's lugging uphill in High! Hold Shift (Low pedal) for the 2.75:1 planetary reduction—don't stall!";
  }
  if (lastImpactAtAgeSec < 3.0) {
    return "Easy on the hickory spokes! Watch out for potholes and timber crates on Harbour Street!";
  }
  if (state.speedMph > 24) {
    return "Steady! Two-wheel rear transmission brakes only—give yourself plenty of distance before corners!";
  }
  if (state.speedMph < 1.2) {
    return controlMode === 'authentic'
      ? "3-Pedal Lesson: Advance Spark (E), open Throttle slightly, release Handbrake (Space) to High or hold Shift for Low!"
      : "WASD Lesson: Hold W to glide off in Low then auto-shift to High; use S to brake or double-back into Reverse!";
  }
  if (state.currentSurface === 'cobbles') {
    return "Bluestone cobbles ahead—grip the wooden steering rim lightly and let the transverse leaf springs soak the rattle!";
  }
  if (state.currentSurface === 'mud' || state.currentSurface === 'grass') {
    return "Off the limestone road! Keep steady throttle and gentle steering—sharp turns will spin the rear axle!";
  }
  if (state.sparkAdvance < 0.35 && state.rpm > 1050) {
    return "Once she's cruising nicely, advance the Spark lever (E) rightwards for crisper power and cooler exhaust!";
  }
  return "Purring like a sewing machine! Keep revs smooth, advance Spark (E) at cruise, and watch your radiator temp!";
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

  // Shared materials with varied roughness/metalness
  const skinMat = track(new THREE.MeshStandardMaterial({ color: 0xdcb89a, roughness: 0.72 }));
  const hairMat = track(new THREE.MeshStandardMaterial({ color: 0x3b261a, roughness: 0.88 }));
  const whiteBeardMat = track(new THREE.MeshStandardMaterial({ color: 0xe9e6df, roughness: 0.9 }));
  const overallMat = track(new THREE.MeshStandardMaterial({ color: 0x3c4d63, roughness: 0.86 }));
  const greaseClothMat = track(new THREE.MeshStandardMaterial({ color: 0x8f332c, roughness: 0.9 }));
  const brassMat = track(new THREE.MeshStandardMaterial({ color: 0xd9a84e, roughness: 0.24, metalness: 0.88 }));
  const sheepWoolMat = track(new THREE.MeshStandardMaterial({ color: 0xeee6d7, roughness: 0.96 }));
  const sheepFaceMat = track(new THREE.MeshStandardMaterial({ color: 0x2a2523, roughness: 0.82 }));
  const redRibbonMat = track(new THREE.MeshStandardMaterial({ color: 0xb92c28, roughness: 0.55 }));
  const burgundyMat = track(new THREE.MeshStandardMaterial({ color: 0x67242c, roughness: 0.82 }));
  const creamMat = track(new THREE.MeshStandardMaterial({ color: 0xefe6d4, roughness: 0.84 }));
  const strawHatMat = track(new THREE.MeshStandardMaterial({ color: 0xd9c287, roughness: 0.78 }));
  const blazerMat = track(new THREE.MeshStandardMaterial({ color: 0x1f364d, roughness: 0.84 }));
  const shortsMat = track(new THREE.MeshStandardMaterial({ color: 0x4b463d, roughness: 0.88 }));
  const capGoldMat = track(new THREE.MeshStandardMaterial({ color: 0xc99c42, roughness: 0.45, metalness: 0.45 }));
  const navyCoatMat = track(new THREE.MeshStandardMaterial({ color: 0x1c2838, roughness: 0.8 }));
  const leatherMat = track(new THREE.MeshStandardMaterial({ color: 0x211813, roughness: 0.65 }));

  const headGeo = track(new THREE.SphereGeometry(0.115, 12, 10));
  const handGeo = track(new THREE.SphereGeometry(0.036, 8, 6));
  const bootGeo = track(new THREE.BoxGeometry(0.085, 0.065, 0.16));

  const createPassengerMesh = (id: PassengerId, seated: boolean): BuiltCharacterRig => {
    const g = new THREE.Group();
    const legPivots: THREE.Object3D[] = [];
    const armPivots: THREE.Object3D[] = [];
    let headPivot: THREE.Object3D = new THREE.Group();
    let propPivot: THREE.Object3D | undefined;

    if (id === 'sheep') {
      // Composite Merino Sheep (multi-tuft fleece, dark face, ears, A&P red ribbon, 4 hooves)
      const rootOffsetY = seated ? 0.14 : 0.56;
      const bodyGrp = new THREE.Group();
      bodyGrp.position.set(0, rootOffsetY, 0);

      const torso = new THREE.Mesh(track(new THREE.SphereGeometry(0.26, 12, 10)), sheepWoolMat);
      torso.scale.set(0.92, 0.92, 1.38);
      torso.castShadow = true;
      const chestFluff = new THREE.Mesh(track(new THREE.SphereGeometry(0.22, 10, 8)), sheepWoolMat);
      chestFluff.position.set(0, 0.05, 0.22);
      const rumpFluff = new THREE.Mesh(track(new THREE.SphereGeometry(0.21, 10, 8)), sheepWoolMat);
      rumpFluff.position.set(0, 0.04, -0.22);
      const collarRibbon = new THREE.Mesh(track(new THREE.TorusGeometry(0.15, 0.025, 6, 12)), redRibbonMat);
      collarRibbon.position.set(0, 0.14, 0.26);
      collarRibbon.rotation.x = 0.5;
      bodyGrp.add(torso, chestFluff, rumpFluff, collarRibbon);

      // Head + ears + fleece crest
      const sHead = new THREE.Group();
      sHead.position.set(0, 0.22, 0.34);
      const skull = new THREE.Mesh(track(new THREE.SphereGeometry(0.115, 10, 8)), sheepFaceMat);
      skull.scale.set(0.85, 0.92, 1.25);
      const woolCap = new THREE.Mesh(track(new THREE.SphereGeometry(0.09, 8, 6)), sheepWoolMat);
      woolCap.position.set(0, 0.08, -0.02);
      [-0.1, 0.1].forEach((ex) => {
        const ear = new THREE.Mesh(track(new THREE.BoxGeometry(0.1, 0.035, 0.045)), sheepFaceMat);
        ear.position.set(ex, 0.03, -0.02);
        ear.rotation.z = ex < 0 ? 0.45 : -0.45;
        sHead.add(ear);
      });
      sHead.add(skull, woolCap);
      bodyGrp.add(sHead);
      headPivot = sHead;

      // 4 hooves (front right hoof waves when waiting; tucked forward when seated)
      const legGeo = track(new THREE.CylinderGeometry(0.038, 0.03, 0.36, 8));
      [
        [0.12, 0.18],
        [-0.12, 0.18],
        [0.12, -0.2],
        [-0.12, -0.2],
      ].forEach(([lx, lz], idx) => {
        const lp = new THREE.Group();
        lp.position.set(lx, -0.16, lz);
        const leg = new THREE.Mesh(legGeo, sheepFaceMat);
        leg.position.set(0, -0.17, 0);
        if (seated) {
          lp.rotation.x = idx < 2 ? -1.15 : -0.7;
        }
        lp.add(leg);
        bodyGrp.add(lp);
        legPivots.push(lp);
        if (idx === 0) armPivots.push(lp);
      });

      if (seated) {
        // Upright plump sheep sitting comfortably in front bench seat
        bodyGrp.rotation.x = -0.35;
        bodyGrp.position.set(0, 0.25, -0.02);
      }

      g.add(bodyGrp);
      return { group: g, headPivot, armPivots, legPivots };
    }

    // Human characters (Mechanic, Tea-Party Lady, Schoolboy, Sea Captain)
    const scale = id === 'schoolboy' ? 0.78 : 0.96;
    g.scale.setScalar(scale);

    const torsoY = seated ? 0.32 : 1.18;
    const headY = seated ? 0.68 : 1.54;
    const shoulderY = seated ? 0.51 : 1.41;

    const headG = new THREE.Group();
    headG.position.set(0, headY, 0);
    const skull = new THREE.Mesh(headGeo, skinMat);
    skull.position.set(0, 0.05, 0);
    skull.castShadow = true;
    const nose = new THREE.Mesh(track(new THREE.BoxGeometry(0.03, 0.036, 0.042)), skinMat);
    nose.position.set(0, 0.04, 0.11);
    headG.add(skull, nose);

    let coatMat: THREE.Material = overallMat;
    let legMat: THREE.Material = overallMat;

    if (id === 'mechanic') {
      coatMat = overallMat;
      legMat = overallMat;
      // Flat cap + brass goggles + mustache
      const cap = new THREE.Mesh(track(new THREE.CylinderGeometry(0.125, 0.12, 0.06, 10)), overallMat);
      cap.position.set(0, 0.12, 0.01);
      const peak = new THREE.Mesh(track(new THREE.BoxGeometry(0.14, 0.018, 0.09)), leatherMat);
      peak.position.set(0, 0.10, 0.12);
      const stache = new THREE.Mesh(track(new THREE.BoxGeometry(0.08, 0.022, 0.024)), hairMat);
      stache.position.set(0, 0.015, 0.11);
      headG.add(cap, peak, stache);
      // Red rag tucked at waist
      const rag = new THREE.Mesh(track(new THREE.BoxGeometry(0.09, 0.18, 0.04)), greaseClothMat);
      rag.position.set(0.16, torsoY - 0.18, 0.11);
      rag.rotation.z = -0.25;
      g.add(rag);
    } else if (id === 'lady') {
      coatMat = creamMat;
      legMat = burgundyMat;
      const bun = new THREE.Mesh(track(new THREE.SphereGeometry(0.06, 8, 6)), hairMat);
      bun.position.set(0, 0.04, -0.11);
      const brim = new THREE.Mesh(track(new THREE.CylinderGeometry(0.25, 0.26, 0.022, 14)), strawHatMat);
      brim.position.set(0, 0.13, 0);
      brim.rotation.x = -0.06;
      const crown = new THREE.Mesh(track(new THREE.CylinderGeometry(0.11, 0.125, 0.08, 12)), creamMat);
      crown.position.set(0, 0.17, 0);
      const ribbon = new THREE.Mesh(track(new THREE.CylinderGeometry(0.128, 0.128, 0.026, 12)), burgundyMat);
      ribbon.position.set(0, 0.148, 0);
      const flower = new THREE.Mesh(track(new THREE.SphereGeometry(0.042, 7, 6)), redRibbonMat);
      flower.position.set(0.15, 0.15, 0.08);
      headG.add(bun, brim, crown, ribbon, flower);
      if (!seated) {
        const skirt = new THREE.Mesh(track(new THREE.CylinderGeometry(0.16, 0.33, 0.88, 12)), burgundyMat);
        skirt.position.set(0, 0.46, 0);
        skirt.castShadow = true;
        g.add(skirt);
      }
    } else if (id === 'schoolboy') {
      coatMat = blazerMat;
      legMat = shortsMat;
      const cap = new THREE.Mesh(track(new THREE.SphereGeometry(0.122, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55)), blazerMat);
      cap.position.set(0, 0.09, 0);
      cap.rotation.z = -0.16; // crooked school cap
      const stripe = new THREE.Mesh(track(new THREE.TorusGeometry(0.118, 0.012, 6, 14)), capGoldMat);
      stripe.rotation.x = Math.PI / 2;
      stripe.position.set(0, 0.10, 0);
      const peak = new THREE.Mesh(track(new THREE.BoxGeometry(0.13, 0.015, 0.085)), blazerMat);
      peak.position.set(0.02, 0.09, 0.11);
      headG.add(cap, stripe, peak);
    } else {
      // Retired Sea Captain
      coatMat = navyCoatMat;
      legMat = navyCoatMat;
      const cap = new THREE.Mesh(track(new THREE.CylinderGeometry(0.135, 0.118, 0.075, 12)), navyCoatMat);
      cap.position.set(0, 0.13, 0);
      const goldBand = new THREE.Mesh(track(new THREE.CylinderGeometry(0.122, 0.122, 0.024, 12)), brassMat);
      goldBand.position.set(0, 0.10, 0);
      const visor = new THREE.Mesh(track(new THREE.BoxGeometry(0.14, 0.018, 0.09)), leatherMat);
      visor.position.set(0, 0.09, 0.12);
      const beard = new THREE.Mesh(track(new THREE.ConeGeometry(0.085, 0.19, 8)), whiteBeardMat);
      beard.position.set(0, -0.07, 0.08);
      beard.rotation.x = Math.PI - 0.12;
      headG.add(cap, goldBand, visor, beard);
    }

    const torso = new THREE.Mesh(track(new THREE.BoxGeometry(0.35, 0.48, 0.2)), coatMat);
    torso.position.set(0, torsoY, 0);
    torso.castShadow = true;
    g.add(torso);

    if (id === 'captain') {
      // Double-breasted brass buttons
      [-0.06, 0.06].forEach((bx) => {
        [0.12, 0.0, -0.12].forEach((by) => {
          const btn = new THREE.Mesh(track(new THREE.SphereGeometry(0.016, 6, 6)), brassMat);
          btn.position.set(bx, torsoY + by, 0.106);
          g.add(btn);
        });
      });
    } else if (id === 'schoolboy') {
      const tie = new THREE.Mesh(track(new THREE.BoxGeometry(0.045, 0.24, 0.02)), capGoldMat);
      tie.position.set(0, torsoY + 0.04, 0.105);
      g.add(tie);
    }

    // Legs (straight when waiting, bent forward on cushion when seated)
    const thighGeo = track(new THREE.CylinderGeometry(0.068, 0.055, seated ? 0.38 : 0.84, 8));
    [-0.095, 0.095].forEach((lx) => {
      const lp = new THREE.Group();
      lp.position.set(lx, seated ? 0.08 : 0.92, seated ? 0.06 : 0);
      if (seated) {
        const thigh = new THREE.Mesh(thighGeo, legMat);
        thigh.rotation.x = Math.PI / 2 - 0.12;
        thigh.position.set(0, -0.02, 0.17);
        const shin = new THREE.Mesh(track(new THREE.CylinderGeometry(0.052, 0.044, 0.36, 8)), legMat);
        shin.position.set(0, -0.19, 0.34);
        const boot = new THREE.Mesh(bootGeo, leatherMat);
        boot.position.set(0, -0.36, 0.38);
        lp.add(thigh, shin, boot);
      } else {
        const legM = new THREE.Mesh(thighGeo, legMat);
        legM.position.set(0, -0.44, 0);
        legM.castShadow = true;
        const boot = new THREE.Mesh(bootGeo, leatherMat);
        boot.position.set(0, -0.88, 0.035);
        lp.add(legM, boot);
      }
      if (id !== 'lady' || seated) {
        g.add(lp);
      }
      legPivots.push(lp);
    });

    // Arms + Signature Props (Brass Spanner / Spyglass / Handbag)
    [-0.22, 0.22].forEach((ax, ai) => {
      const ap = new THREE.Group();
      ap.position.set(ax, shoulderY, 0);
      const sleeve = new THREE.Mesh(track(new THREE.CylinderGeometry(0.05, 0.04, 0.46, 8)), coatMat);
      sleeve.position.set(0, -0.22, 0);
      sleeve.castShadow = true;
      const hand = new THREE.Mesh(handGeo, skinMat);
      hand.position.set(0, -0.46, 0);
      ap.add(sleeve, hand);

      if (ai === 1 && id === 'mechanic') {
        const spanner = new THREE.Mesh(track(new THREE.BoxGeometry(0.03, 0.24, 0.018)), brassMat);
        spanner.position.set(0, -0.49, 0.09);
        spanner.rotation.x = Math.PI / 2;
        ap.add(spanner);
        propPivot = spanner;
      } else if (ai === 1 && id === 'captain') {
        const spyglass = new THREE.Mesh(track(new THREE.CylinderGeometry(0.025, 0.018, 0.26, 8)), brassMat);
        spyglass.rotation.x = Math.PI / 2;
        spyglass.position.set(0, -0.47, 0.11);
        ap.add(spyglass);
        propPivot = spyglass;
      } else if (ai === 0 && id === 'lady') {
        const bag = new THREE.Mesh(track(new THREE.BoxGeometry(0.07, 0.15, 0.16)), leatherMat);
        bag.position.set(0, -0.54, 0.03);
        ap.add(bag);
        propPivot = bag;
      }

      if (!seated && ai === 1) {
        // Bright waving hail handkerchief so roadside hitchhikers stand out clearly from regular spectators
        const hankyMat = track(
          new THREE.MeshBasicMaterial({
            color: id === 'mechanic' ? 0xf5d173 : 0xfaf7ef,
            side: THREE.DoubleSide,
          })
        );
        const hanky = new THREE.Mesh(track(new THREE.PlaneGeometry(0.24, 0.22)), hankyMat);
        hanky.position.set(0.02, -0.55, 0.04);
        hanky.rotation.z = 0.25;
        ap.add(hanky);
      }

      if (seated) {
        ap.rotation.x = -0.68;
      }
      g.add(ap);
      armPivots.push(ap);
    });

    g.add(headG);
    headPivot = headG;
    return { group: g, headPivot, armPivots, legPivots, propPivot };
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
