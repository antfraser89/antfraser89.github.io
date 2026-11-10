// Game data and tuning constants. Everything that shapes the economy lives here
// so the balance tool (tools/balance.mjs) and the game read the same numbers.

export const GAME_TITLE = 'Starlight Funfair';
export const VERSION = '1.0.0';
export const SAVE_KEY = 'starlight-funfair.save.v1';
export const CURRENCY = '£';

// World layout: one avenue running north from the gate, six rows of two plots.
export const WORLD = {
  w: 1000,
  h: 1800,
  aveX: 500,
  aveHalf: 46,
  gateY: 1690,
  spawnY: 1800,
  rowY: [1480, 1240, 1000, 760, 520, 280],
  plotOffset: 292, // attraction centre, measured from the avenue
  entranceOffset: 164, // head of the queue, measured from the avenue
  queueGap: 12,
};

export const TUNING = {
  startCash: 30,
  levelCostFactor: 1, // first level-up costs this share of the build price
  levelCostGrowth: 1.15,
  flowTau: 30, // seconds; smoothing for the guests-per-second estimate
  baseArrival: 0.22, // guests per second with no marketing
  arrivalPerLevel: 0.05,
  baseVisits: 3,
  baseWalkSpeed: 82,
  walkSpeedPerLevel: 0.12,
  queueLimit: 9,
  maxGuests: 230,
  boardInterval: 0.16,
  boardWait: 0.9, // an operator waits this long for stragglers before starting
  fameDivisor: 8e7,
  famePerPoint: 0.05,
  tourMinFame: 5,
  tourStars: 5,
  fireworksMult: 3,
  fireworksDuration: 30,
  fireworksCooldown: 300,
  rushMult: 2,
  rushDuration: 30,
  balloonEvery: [50, 85], // seconds between balloons
  balloonCashSeconds: 30,
  balloonStarChance: 0.1,
  balloonRushChance: 0.22,
  offlineCapHours: [2, 4, 8, 12, 24],
  offlineMinSeconds: 60,
  dayLength: 300, // seconds for a full day/night cycle
  warpHours: 2,
};

// kind: 'stall' and 'game' keep their customers visible at the counter;
// a 'ride' swallows its riders until the cycle ends.
const A = (id, name, kind, cost, price, cap, cycle, blurb, w, h) => ({
  id, name, kind, cost, price, cap, cycle, blurb, w, h,
});

export const ATTRACTIONS = [
  A('toffee', 'Toffee Apple Cart', 'stall', 20, 1, 2, 2.4, 'Sticky, shiny and gone in four bites.', 170, 150),
  A('ducks', 'Hook-a-Duck', 'game', 220, 5, 3, 3.4, 'Every duck wins a prize. Mostly.', 190, 160),
  A('teacups', 'Teacup Twirl', 'ride', 2400, 25, 6, 6, 'A gentle spin for the brave and the dizzy.', 230, 150),
  A('helter', 'Helter Skelter', 'ride', 27000, 125, 4, 5, 'Climb the tower, grab a mat, whoosh.', 150, 250),
  A('coconut', 'Coconut Shy', 'game', 290000, 620, 3, 4, 'Three balls a go. The coconuts are not glued down.', 200, 160),
  A('floss', 'Candy Floss Kiosk', 'stall', 3.2e6, 3100, 3, 3, 'Sugar clouds on a stick, spun to order.', 160, 180),
  A('dodgems', 'Dodgems', 'ride', 3.5e7, 16000, 8, 8, 'Bump first, apologise later.', 250, 170),
  A('carousel', 'Galloping Carousel', 'ride', 3.9e8, 78000, 10, 9, 'Painted horses and a wheezy organ.', 240, 210),
  A('ghost', 'Ghost Train', 'ride', 4.3e9, 390000, 6, 8, 'Cobwebs, cackles and one very damp curtain.', 250, 190),
  A('waltzer', 'Whirling Waltzer', 'ride', 4.7e10, 2e6, 9, 8, 'Scream if you want to go faster.', 250, 170),
  A('wheel', 'Big Wheel', 'ride', 5.2e11, 9.8e6, 12, 12, 'The whole fair laid out below you.', 240, 280),
  A('coaster', 'Comet Coaster', 'ride', 5.7e12, 4.9e7, 12, 9, 'One lift hill, one loop, no regrets.', 270, 230),
];

for (let i = 0; i < ATTRACTIONS.length; i++) {
  const d = ATTRACTIONS[i];
  d.index = i;
  d.appeal = 1 + 0.5 * i;
  d.opCost = i === 0 ? 45 : Math.round(d.cost * 1.4);
  d.row = Math.floor(i / 2);
  d.side = i % 2 === 0 ? -1 : 1;
  d.x = WORLD.aveX + d.side * WORLD.plotOffset;
  d.y = WORLD.rowY[d.row];
}

export const MILESTONE_LEVELS = [10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500];

export const PARK = {
  marketing: {
    name: 'Marketing',
    desc: 'More guests through the gate',
    max: 16,
    baseCost: 90,
    growth: 3.6,
    steps: [
      'Word of mouth', 'Flyers', 'Posters', 'Sandwich boards', 'Local paper', 'Bus adverts',
      'Radio jingle', 'Billboards', 'Town crier', 'Parade float', 'TV spot', 'Celebrity opening',
      'Skywriting', 'Hot-air balloon', 'Airship', 'Laser show', 'Legend status',
    ],
  },
  passes: {
    name: 'Wristbands',
    desc: 'Guests visit more attractions before heading home',
    max: 5,
    baseCost: 2500,
    growth: 30,
  },
  paths: {
    name: 'Paved Paths',
    desc: 'Guests get around faster',
    max: 6,
    baseCost: 400,
    growth: 12,
  },
  lights: {
    name: 'Fairy Lights',
    desc: 'Every ticket in the fair is worth more',
    max: Infinity,
    baseCost: 2500,
    growth: 8,
  },
};

export const SHOP = {
  golden: {
    name: 'Golden Tickets',
    desc: 'Doubles every ticket price, forever',
    costs: [30, 80, 200, 500, 1200, 3000, 7000, 16000],
  },
  owls: {
    name: 'Night Crew',
    desc: 'Your crew keeps earning for longer while you are away',
    costs: [8, 20, 50, 120],
  },
  crate: {
    name: 'Firework Crate',
    desc: 'Fireworks recharge a minute sooner',
    costs: [12, 30, 75],
  },
  seller: {
    name: 'Balloon Seller',
    desc: 'Prize balloons drift by more often',
    costs: [10, 25, 60],
  },
  headstart: {
    name: 'Head Start',
    desc: 'Begin every new town with a bigger float',
    costs: [15, 40, 100],
    cash: [0, 5e3, 5e5, 5e7],
  },
  warp: {
    name: 'Time Warp',
    desc: 'Collect two hours of takings on the spot',
    costs: [15],
    repeat: true,
  },
};

// Each tour moves the fair to the next town. Purely a change of scenery.
export const TOWNS = [
  {
    name: 'Puddlewick Green', tag: 'A sleepy village green',
    ground: '#7cc46a', ground2: '#6db85c', tuft: '#5aa64d', path: '#e8d3a2', pathEdge: '#cdb685',
    plot: '#8fd07c', tree: ['#3f9b4b', '#4fb25a', '#2f8540'], trunk: '#7a5230', fence: '#f4ead0', weather: null,
  },
  {
    name: 'Saltmarsh Sands', tag: 'Deckchairs and sea air',
    ground: '#f1dc9e', ground2: '#e9d08a', tuft: '#d9bd72', path: '#c9a878', pathEdge: '#a98a5c',
    plot: '#f6e6b4', tree: ['#3fae7a', '#55c28c', '#2f9466'], trunk: '#8a6238', fence: '#ffffff', weather: null, sea: true,
  },
  {
    name: 'Coppermill Common', tag: 'Bonfire smoke and falling leaves',
    ground: '#b9b25a', ground2: '#aaa44e', tuft: '#958f3f', path: '#dcc7a0', pathEdge: '#b9a37b',
    plot: '#c8c26c', tree: ['#e0832b', '#f0a53a', '#c7521f'], trunk: '#5f3f24', fence: '#f0e2c0', weather: 'leaves',
  },
  {
    name: 'Frostholm', tag: 'Mittens, mulled apple and snow',
    ground: '#eef4fb', ground2: '#e0eaf5', tuft: '#cbd9ea', path: '#b9c6d6', pathEdge: '#98a8bc',
    plot: '#f7fbff', tree: ['#2f7d68', '#3c917a', '#eaf3fb'], trunk: '#5b4632', fence: '#c94f4f', weather: 'snow',
  },
  {
    name: 'Lanternport', tag: 'Cobbles, canals and paper lanterns',
    ground: '#8f93a8', ground2: '#858aa0', tuft: '#777c93', path: '#c5b8a6', pathEdge: '#9d917f',
    plot: '#9ea2b6', tree: ['#d35d8c', '#e67aa4', '#b9457a'], trunk: '#4d3a3a', fence: '#2d3152', weather: 'petals',
  },
];

export const GUEST_LOOKS = {
  shirts: ['#e5484d', '#f76b15', '#ffc53d', '#46a758', '#12a594', '#3e63dd', '#8e4ec6', '#e93d82', '#f5f5f5', '#30a46c', '#0090ff', '#ad7f58'],
  skins: ['#f6d2b8', '#eab894', '#c98e62', '#a06a42', '#7a4a2c', '#f9dcc4'],
  hairs: ['#2b2118', '#5a3b22', '#8a5a2b', '#d9a441', '#b03a2e', '#cfcfcf', '#161616'],
  trousers: ['#2f3a5c', '#3d3d3d', '#5b4a3a', '#274060', '#4a2f4f'],
};
