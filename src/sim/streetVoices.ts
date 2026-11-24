export type BadDrivingReason =
  | 'impact'
  | 'speeding'
  | 'skid'
  | 'offroad'
  | 'hornSpam'
  | 'livestock'
  | 'piperHit'
  | 'speedTrap';

export interface StreetDialogueEvent {
  id: number;
  speaker: string;
  location: string;
  text: string;
  isScolding: boolean;
}

interface LineEntry {
  role: string;
  text: string;
}

const CASUAL_DISCUSSIONS: LineEntry[] = [
  {
    role: 'Gentleman',
    text: 'Did you see the price of Otago wool at the Loan & Mercantile this morning?',
  },
  {
    role: 'Lady',
    text: 'My word, Mr. Ford’s touring car runs far quieter than the traction engine!',
  },
  {
    role: 'Dockworker',
    text: 'The coastal steamer’s unloading fresh timber out on Sumpter Wharf right now.',
  },
  {
    role: 'Newsboy',
    text: 'Oamaru Mail! Read all about the 1914 Victorian Circuit Trial!',
  },
  {
    role: 'Lady',
    text: 'Lovely day for a motoring spin past the Opera House and Courthouse.',
  },
  {
    role: 'Gentleman',
    text: 'Mind those bluestone cobbles down by the Harbour Board corner.',
  },
  {
    role: 'Constable',
    text: 'Good day, driver. Keep a sensible pace past the pedestrians, if you please.',
  },
  {
    role: 'Dockworker',
    text: 'Meek’s grain store has forty wagonloads of wheat waiting on the siding.',
  },
  {
    role: 'Lady',
    text: 'The Whitestone carving on the Bank of New South Wales portico looks grand in this light.',
  },
  {
    role: 'Gentleman',
    text: 'See if she climbs Cape Wanbrow ridge in High gear, or if you need the Low pedal!',
  },
];

const SCOLDING_LINES: Record<BadDrivingReason, LineEntry[]> = {
  impact: [
    {
      role: 'Constable',
      text: 'Halt there! Watch where you’re steering—you’ll smash the carts and stonework!',
    },
    {
      role: 'Dockworker',
      text: 'Oi! Mind what you’re doing—you nearly spooked the bay mare with that crash!',
    },
    {
      role: 'Gentleman',
      text: 'Good heavens, man! Keep both hands on the wheel before you wreck us all!',
    },
  ],
  speeding: [
    {
      role: 'Constable',
      text: 'Slow down at once! That speed is sheer recklessness in Oamaru streets!',
    },
    {
      role: 'Lady',
      text: 'Oh mercy! Slow that motorcar down before you run someone over!',
    },
    {
      role: 'Gentleman',
      text: 'This is Harbour Street, not a racetrack! Ease off that hand throttle!',
    },
  ],
  skid: [
    {
      role: 'Gentleman',
      text: 'Steady on! You’re skidding sideways and flinging gravel onto our Sunday coats!',
    },
    {
      role: 'Lady',
      text: 'Gracious! Control that rear axle—you’re sliding all over the carriageway!',
    },
    {
      role: 'Newsboy',
      text: 'Whoa! Look at him fishtailing round the bend—someone fetch the constable!',
    },
  ],
  offroad: [
    {
      role: 'Constable',
      text: 'Keep off the grass verge and footpaths! Back onto the macadam road immediately!',
    },
    {
      role: 'Dockworker',
      text: 'Wrong way, driver! You’re tearing up the tussock and mud siding!',
    },
  ],
  hornSpam: [
    {
      role: 'Gentleman',
      text: 'Stop blasting that confounded brass horn right in our ears!',
    },
    {
      role: 'Lady',
      text: 'We can hear you coming perfectly well—no need to deafen all of Oamaru!',
    },
  ],
  livestock: [
    {
      role: 'Dockworker',
      text: 'Steady on! You’ve got the whole Merino flock bolted and bleating across Wanbrow!',
    },
    {
      role: 'Constable',
      text: 'Ease up there, driver! You’re spooking the sheep and setting every collie in town barking!',
    },
  ],
  piperHit: [
    {
      role: 'Gentleman',
      text: 'God gracious! You got him!',
    },
    {
      role: 'Lady',
      text: 'Good heavens above! You’ve bowled over poor Angus and his bagpipes!',
    },
    {
      role: 'Constable',
      text: 'God gracious, man! You actually ran down the Scottish piper—fetch Dr. Hargreaves!',
    },
    {
      role: 'Dockworker',
      text: 'Blimey! You got him! Look at that tartan flying and those drones wheezing!',
    },
  ],
  speedTrap: [
    {
      role: 'Constable',
      text: 'Hold on there! My pocket-watch clocked you well past 22 miles per hour on Thames North!',
    },
    {
      role: 'Constable',
      text: 'Steady down, motorist! That is a measured speed trap past the Railway Overbridge!',
    },
    {
      role: 'Constable',
      text: 'You’re in my notebook for furious driving, sir—save the throttle for the open Otago Downs!',
    },
  ],
};

export function pickCasualStreetLine(cursor: number): LineEntry {
  return CASUAL_DISCUSSIONS[cursor % CASUAL_DISCUSSIONS.length];
}

export function pickScoldingLine(reason: BadDrivingReason, cursor: number): LineEntry {
  const pool = SCOLDING_LINES[reason];
  return pool[cursor % pool.length];
}
