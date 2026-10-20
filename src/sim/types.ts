export const TILE_M = 16;
export const WORLD_PER_TILE = 100;
export const FINAL_WEEK = 12;

export type LandKey = 'standard' | 'large' | 'estate';
export type Quality = 'battery' | 'high' | 'ultra';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type Philosophy = 'strategic' | 'penal' | 'heroic';
export type SizeLetter = 'S' | 'M' | 'L';
export type BrushShape = 'single' | 'round' | 'square';
export type TreeClump = 'single' | 'copse' | 'woodland';
export type GreenShape =
  | 'round'
  | 'kidney'
  | 'peanut'
  | 'long'
  | 'island'
  | 'redan'
  | 'biarritz'
  | 'punchbowl';
export type Slope = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
export type BunkerKind = 'fairway' | 'greenside' | 'pot';
export type WaterKind = 'creek' | 'lake' | 'island';
export type ClubId = 'driver' | 'iron' | 'wedge' | 'putter';

export const TERRAIN = ['rough', 'fairway', 'tee', 'green', 'sand', 'water', 'trees', 'path'] as const;
export type TerrainKind = (typeof TERRAIN)[number];

export const FACILITIES = [
  'clubhouse',
  'proshop',
  'range',
  'restaurant',
  'carpark',
  'maintenance',
  'irrigation',
] as const;
export type FacilityKind = (typeof FACILITIES)[number];

export type TileKind = TerrainKind | FacilityKind;

export const PAINT_TOOLS = ['fairway', 'rough', 'sand', 'water', 'trees', 'path', 'bulldoze'] as const;

export type ToolId =
  | 'holeedit'
  | 'pan'
  | 'bulldoze'
  | 'tee'
  | 'green'
  | TerrainKind
  | FacilityKind;

export interface Point {
  x: number;
  y: number;
}

export interface Bunker {
  along: number;
  side: 1 | -1;
  off: number;
  kind: BunkerKind;
  r: number;
}

export interface WaterFeat {
  kind: WaterKind;
  along: number;
}

export interface Hole {
  points: Point[];
  parOverride: 0 | 3 | 4 | 5;
  si: number;
  fwWidth: number;
  roughWidth: number;
  greenShape: GreenShape;
  greenSize: number;
  slope: Slope;
  bunkers: Bunker[];
  waters: WaterFeat[];
  trees: number;
  teeSize: SizeLetter;
  templateName: string;
}

export interface Sizes {
  brushSize: number;
  brushShape: BrushShape;
  teeSize: SizeLetter;
  greenRadius: number;
  bunkerSize: SizeLetter;
  treeClump: TreeClump;
  facilitySize: SizeLetter;
  brushByTool: Partial<Record<string, { brushSize: number; brushShape: BrushShape }>>;
  facilityByTool: Partial<Record<string, SizeLetter>>;
}

export interface RoundState {
  scores: (number | null)[];
  started: boolean;
}

export interface GameState {
  v: 4;
  name: string;
  courseSize: 9 | 18;
  land: LandKey;
  cols: number;
  rows: number;
  sizes: Sizes;
  quality: Quality;
  difficulty: Difficulty;
  cash: number;
  week: number;
  condition: number;
  reputation: number;
  satisfaction: number;
  members: number;
  loan: number;
  tiles: TileKind[];
  teeMap: Record<string, number>;
  greenMap: Record<string, number>;
  fee: number;
  maint: number;
  marketing: number;
  staff: number;
  tool: ToolId;
  holeNo: number;
  focusHole: number;
  philosophy: Philosophy;
  holes: Hole[];
  club: ClubId;
  cashHist: number[];
  lastProfit: number;
  weather: string;
  seasonOver: boolean;
  round: RoundState;
  log: string[];
  playLog: string;
}

export interface Settings {
  master: number;
  sfx: number;
  music: number;
  haptics: boolean;
  reduceMotion: boolean;
  colorblind: boolean;
  quality: Quality;
  tutorialDone: boolean;
}

export interface SaveSlot {
  id: number;
  name: string;
  savedAt: string;
  state: GameState;
}

export interface SaveBundle {
  v: 4;
  settings: Settings;
  slots: SaveSlot[];
  autosave: GameState | null;
}

export interface Cell {
  x: number;
  y: number;
}

export const LANDS: Record<LandKey, { key: LandKey; label: string; cols: number; rows: number; blurb: string }> = {
  standard: { key: 'standard', label: 'Standard', cols: 56, rows: 40, blurb: '5600×4000 world' },
  large: { key: 'large', label: 'Large', cols: 84, rows: 60, blurb: '8400×6000 · comfortable 18' },
  estate: { key: 'estate', label: 'Estate', cols: 112, rows: 80, blurb: '11200×8000 · spacious 18' },
};

export const TILE_INFO: Record<TerrainKind, { label: string; cost: number; upkeep: number }> = {
  rough: { label: 'Rough', cost: 0, upkeep: 2 },
  fairway: { label: 'Fairway', cost: 900, upkeep: 9 },
  tee: { label: 'Tee', cost: 2500, upkeep: 30 },
  green: { label: 'Green', cost: 4200, upkeep: 35 },
  sand: { label: 'Sand Bunker', cost: 1600, upkeep: 18 },
  water: { label: 'Water', cost: 2800, upkeep: 22 },
  trees: { label: 'Trees', cost: 1100, upkeep: 8 },
  path: { label: 'Path', cost: 700, upkeep: 5 },
};

export const FACILITY_INFO: Record<
  FacilityKind,
  { label: string; cost: number; upkeep: number; prestige: number; desc: string }
> = {
  clubhouse: { label: 'Clubhouse', cost: 48000, upkeep: 2600, prestige: 16, desc: 'Members, prestige, satisfaction' },
  proshop: { label: 'Pro Shop', cost: 26000, upkeep: 1200, prestige: 8, desc: '+$9 shop spend / visitor' },
  range: { label: 'Practice Range', cost: 30000, upkeep: 1500, prestige: 9, desc: 'Rating and satisfaction' },
  restaurant: { label: 'Restaurant / Bar', cost: 34000, upkeep: 1900, prestige: 10, desc: '+$13 food and drink / visitor' },
  carpark: { label: 'Car Park', cost: 14000, upkeep: 500, prestige: 3, desc: 'More visitors, satisfaction' },
  maintenance: { label: 'Maintenance Shed', cost: 18000, upkeep: 700, prestige: 2, desc: 'Condition decays slower' },
  irrigation: { label: 'Irrigation', cost: 28000, upkeep: 1100, prestige: 7, desc: 'Condition and beauty' },
};

export const TEE_TILES: Record<SizeLetter, number> = { S: 1, M: 2, L: 4 };
export const FAC_DIMS: Record<SizeLetter, { w: number; h: number }> = {
  S: { w: 2, h: 2 },
  M: { w: 3, h: 3 },
  L: { w: 4, h: 3 },
};
export const BUNKER_R: Record<SizeLetter, number> = { S: 4, M: 6, L: 9 };

export const CLUBS: Record<ClubId, { label: string; max: number; spread: number }> = {
  driver: { label: 'Driver', max: 260, spread: 9 },
  iron: { label: '5-Iron', max: 175, spread: 5.5 },
  wedge: { label: 'Wedge', max: 95, spread: 3.2 },
  putter: { label: 'Putter', max: 28, spread: 1.1 },
};

export const WEATHERS = [
  { n: 'Fine', mult: 1.08, cond: 0 },
  { n: 'Sunny & Warm', mult: 1.15, cond: -1 },
  { n: 'Breezy', mult: 0.96, cond: 0 },
  { n: 'Overcast', mult: 0.92, cond: 0 },
  { n: 'Rain Showers', mult: 0.62, cond: -3 },
  { n: 'Heatwave', mult: 0.78, cond: -6 },
  { n: 'Storm Front', mult: 0.45, cond: -8 },
] as const;

export interface GameEvent {
  n: string;
  txt: string;
  cash: number;
  cond: number;
  rep: number;
  needs?: FacilityKind;
}

export const EVENTS: GameEvent[] = [
  { n: 'Storm damage', txt: 'Overnight storm brought down branches. Condition fell, clean-up cost $6,500.', cash: -6500, cond: -7, rep: -1 },
  { n: 'Heatwave', txt: 'Heatwave stressed the greens. Condition fell unless irrigation helps.', cash: -2500, cond: -6, rep: 0 },
  { n: 'Tournament offer', txt: 'A local tournament booked the course. Bonus $22,000 and reputation up.', cash: 22000, cond: -4, rep: 4 },
  { n: 'Vandalism', txt: 'Vandals damaged two greens overnight. Repairs $4,800, reputation dipped.', cash: -4800, cond: -5, rep: -2 },
  { n: 'Pro visit', txt: 'A touring pro practised at your range and praised the layout.', cash: 3500, cond: 0, rep: 5 },
  { n: 'Wedding booking', txt: 'The clubhouse hosted a wedding. Restaurant bonus $9,500.', cash: 9500, cond: 0, rep: 2, needs: 'clubhouse' },
  { n: 'Junior clinic boom', txt: 'School holiday clinics filled the range. Bonus $6,000.', cash: 6000, cond: -1, rep: 3, needs: 'range' },
  { n: 'Quiet week', txt: 'A calm week. Members enjoyed the peace and the course recovered slightly.', cash: 0, cond: 3, rep: 1 },
];

export const GREEN_SHAPES: GreenShape[] = ['round', 'kidney', 'peanut', 'long', 'island', 'redan', 'biarritz', 'punchbowl'];
export const SLOPES: Slope[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export const TOOL_DEFS: { id: ToolId; label: string; hint: string; shortcut?: string }[] = [
  { id: 'holeedit', label: 'Hole Edit', hint: 'Drag gold centreline points', shortcut: 'Alt+1' },
  { id: 'fairway', label: 'Fairway', hint: 'Mown playing corridor', shortcut: 'Alt+2' },
  { id: 'tee', label: 'Tee', hint: 'Start of the selected hole', shortcut: 'Alt+3' },
  { id: 'green', label: 'Green', hint: 'Pin of the selected hole', shortcut: 'Alt+4' },
  { id: 'rough', label: 'Rough', hint: 'Default grass', shortcut: 'Alt+5' },
  { id: 'sand', label: 'Sand', hint: 'Bunker hazard', shortcut: 'Alt+6' },
  { id: 'water', label: 'Water', hint: 'Lake or pond', shortcut: 'Alt+7' },
  { id: 'trees', label: 'Trees', hint: 'Canopy and shade', shortcut: 'Alt+8' },
  { id: 'path', label: 'Path', hint: 'Cart path', shortcut: 'Alt+9' },
  { id: 'clubhouse', label: 'Clubhouse', hint: 'Members and prestige' },
  { id: 'proshop', label: 'Pro Shop', hint: 'Retail spend' },
  { id: 'range', label: 'Range', hint: 'Practice and rating' },
  { id: 'restaurant', label: 'Restaurant', hint: 'Food and drink' },
  { id: 'carpark', label: 'Car Park', hint: 'Visitor access' },
  { id: 'maintenance', label: 'Shed', hint: 'Slower condition decay' },
  { id: 'irrigation', label: 'Irrigation', hint: 'Condition and beauty' },
  { id: 'bulldoze', label: 'Bulldoze', hint: 'Remove tile or facility' },
  { id: 'pan', label: 'Pan', hint: 'Drag to explore' },
];

export function isFacility(t: string): t is FacilityKind {
  return (FACILITIES as readonly string[]).includes(t);
}

export function isTerrain(t: string): t is TerrainKind {
  return (TERRAIN as readonly string[]).includes(t);
}

export function isTile(t: string): t is TileKind {
  return isTerrain(t) || isFacility(t);
}

export function defaultSettings(): Settings {
  return {
    master: 0.8,
    sfx: 0.85,
    music: 0.45,
    haptics: true,
    reduceMotion: false,
    colorblind: false,
    quality: 'high',
    tutorialDone: false,
  };
}

export function difficultyProfile(d: Difficulty) {
  if (d === 'easy') return { startCash: 900000, targetCash: 800000, cond: 65, rep: 60, demand: 1.12, label: 'Club' };
  if (d === 'hard') return { startCash: 620000, targetCash: 980000, cond: 75, rep: 70, demand: 0.86, label: 'Open' };
  return { startCash: 750000, targetCash: 850000, cond: 70, rep: 65, demand: 1, label: 'Members' };
}
