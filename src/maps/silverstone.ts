import { createCircuit, type RaceCircuit } from './circuit';
import { FLIGHT_CEILING, type FlightBounds, type MapPoint } from '../flight/simulation';

// Approximate centreline traced from Silverstone's published 2025 spectator map.
// https://www.silverstone.co.uk/sites/default/files/pdf/British%20Grand%20Prix%202025%20Map.pdf
// Uniformly scaled to the FIA's 5,891 m GP lap; scenery and corner radii are illustrative.
const referencePoints: MapPoint[] = [
  [1015, 955],
  [935, 897],
  [854, 843], // Hamilton Straight
  [834, 815],
  [833, 774],
  [841, 720], // Abbey, Farm
  [821, 665],
  [783, 610],
  [748, 561],
  [742, 544], // Village
  [773, 527],
  [818, 512],
  [830, 496],
  [819, 477], // The Loop
  [780, 460],
  [729, 452],
  [698, 455],
  [674, 475], // Aintree
  [615, 540],
  [527, 640],
  [450, 726],
  [402, 781], // Wellington Straight
  [387, 811],
  [394, 839],
  [422, 850],
  [463, 858], // Brooklands
  [486, 878],
  [493, 902],
  [485, 926],
  [465, 941], // Luffield
  [429, 946],
  [391, 932],
  [351, 905],
  [317, 868],
  [291, 827], // Woodcote
  [277, 780],
  [269, 690],
  [258, 550],
  [248, 501], // National Pit Straight
  [252, 472],
  [277, 446],
  [316, 428],
  [403, 408], // Copse
  [550, 397],
  [597, 390],
  [632, 373],
  [656, 364], // Maggotts
  [689, 371],
  [740, 386],
  [776, 387],
  [812, 365], // Becketts
  [846, 354],
  [875, 359],
  [900, 384],
  [929, 428],
  [957, 451], // Chapel
  [1050, 499],
  [1190, 572],
  [1320, 640],
  [1398, 684], // Hangar Straight
  [1424, 713],
  [1434, 745],
  [1424, 776],
  [1397, 803], // Stowe
  [1304, 858],
  [1219, 915],
  [1199, 937],
  [1205, 959], // Vale
  [1220, 982],
  [1216, 1005],
  [1182, 1037],
  [1145, 1053], // Club
  [1120, 1056],
  [1094, 1044],
  [1053, 1014],
];
const points: MapPoint[] = referencePoints.map(([x, z]) => [x - 840, z - 705]);
export const SILVERSTONE_CIRCUIT: RaceCircuit = {
  ...createCircuit(points, { minSpeed: 30, maxSpeed: 85, cornerAcceleration: 24, length: 5891 }),
  roadWidth: 15,
  car: { width: 2, length: 5.5, height: 1.15, wheelRadius: 0.36 },
  carName: 'Formula One car',
};
export const SILVERSTONE_APPROACH_MARGIN = 1000;
export const SILVERSTONE_BOUNDS: FlightBounds = {
  minX:
    Math.floor(
      (Math.min(...SILVERSTONE_CIRCUIT.path.map((p) => p.x)) - SILVERSTONE_APPROACH_MARGIN) / 10,
    ) * 10,
  maxX:
    Math.ceil(
      (Math.max(...SILVERSTONE_CIRCUIT.path.map((p) => p.x)) + SILVERSTONE_APPROACH_MARGIN) / 10,
    ) * 10,
  minZ:
    Math.floor(
      (Math.min(...SILVERSTONE_CIRCUIT.path.map((p) => p.z)) - SILVERSTONE_APPROACH_MARGIN) / 10,
    ) * 10,
  maxZ:
    Math.ceil(
      (Math.max(...SILVERSTONE_CIRCUIT.path.map((p) => p.z)) + SILVERSTONE_APPROACH_MARGIN) / 10,
    ) * 10,
  ceiling: FLIGHT_CEILING,
};
const start = SILVERSTONE_CIRCUIT.pose(0);
export const SILVERSTONE_PAD = {
  x: start.x - Math.cos(start.heading) * 20,
  z: start.z - Math.sin(start.heading) * 20,
};

export const SILVERSTONE_CORNERS = [
  ['01 · ABBEY', 834, 815],
  ['02 · FARM', 841, 720],
  ['03 · VILLAGE', 742, 544],
  ['04 · THE LOOP', 830, 496],
  ['05 · AINTREE', 698, 455],
  ['06 · BROOKLANDS', 387, 811],
  ['07 · LUFFIELD', 493, 902],
  ['08 · WOODCOTE', 317, 868],
  ['09 · COPSE', 252, 472],
  ['10–11 · MAGGOTTS', 656, 364],
  ['12–13 · BECKETTS', 776, 387],
  ['14 · CHAPEL', 900, 384],
  ['15 · STOWE', 1434, 745],
  ['16 · VALE', 1199, 937],
  ['17–18 · CLUB', 1182, 1037],
] as const;
// Convert scenery coordinates using the same uniform scale as the centreline.
const scale = start.x / (referencePoints[0][0] - 840);
export const silverstonePoint = (x: number, z: number): MapPoint => [
  (x - 840) * scale,
  (z - 705) * scale,
];

export const SILVERSTONE_STRUCTURES = [
  {
    name: 'Silverstone Wing',
    point: silverstonePoint(966, 896),
    size: [350, 12, 28],
    heading: 0.6,
    color: '#d1d8dc',
  },
  {
    name: 'Hamilton Straight grandstand',
    point: silverstonePoint(909, 964),
    size: [200, 13, 25],
    heading: 0.6,
    color: '#3f5a75',
  },
  {
    name: 'Copse grandstand',
    point: silverstonePoint(324, 386),
    size: [145, 12, 24],
    heading: -0.15,
    color: '#3f5a75',
  },
  {
    name: 'Becketts grandstand',
    point: silverstonePoint(801, 317),
    size: [190, 14, 28],
    heading: -0.1,
    color: '#3f5a75',
  },
  {
    name: 'Stowe grandstand',
    point: silverstonePoint(1470, 757),
    size: [120, 14, 24],
    heading: 1.85,
    color: '#3f5a75',
  },
] as const;
