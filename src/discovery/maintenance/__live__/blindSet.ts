import type { VehicleIdentity } from '../types';

/**
 * The committed blind / regression / probe vehicle sets (M-SOURCE). The BLIND list was fixed in
 * 5b19311 BEFORE any research and is never edited after seeing results.
 */
export const car = (
  make: string,
  model: string,
  modelYear: number,
  powertrain: VehicleIdentity['powertrain'],
  displacementCc?: number,
  engineCode?: string,
): VehicleIdentity => ({
  kind: 'car',
  make,
  model,
  modelYear,
  powertrain,
  ...(displacementCc ? { displacementCc } : {}),
  ...(engineCode ? { engineCode } : {}),
  market: 'IL',
});
export const moto = (
  make: string,
  model: string,
  modelYear: number,
  displacementCc: number,
): VehicleIdentity => ({
  kind: 'motorcycle',
  make,
  model,
  modelYear,
  powertrain: 'petrol',
  displacementCc,
  market: 'IL',
});

/** Fixed in 5b19311 BEFORE any research. Never edited after seeing results. */
export const BLIND: [string, string, VehicleIdentity][] = [
  ['B1', 'older ICE, Japanese', car('Mazda', '3', 2011, 'petrol', 1598)],
  ['B2', 'recent ICE, Korean', car('Kia', 'Sportage', 2023, 'petrol', 1598)],
  ['B3', 'hybrid, Japanese', car('Toyota', 'C-HR', 2019, 'hybrid', 1798)],
  ['B4', 'EV, US', car('Tesla', 'Model 3', 2022, 'electric')],
  ['B5', 'European, multiple engine variants', car('Skoda', 'Octavia', 2018, 'petrol', 1395)],
  ['B6', 'older ICE, Korean', car('Hyundai', 'i20', 2016, 'petrol', 1396)],
  ['B7', 'motorcycle', moto('Yamaha', 'MT-07', 2020, 689)],
  ['B8', 'scooter, Japanese', moto('Honda', 'PCX 125', 2019, 125)],
  ['B9', 'scooter, Taiwanese', moto('SYM', 'Jet 14 125', 2021, 125)],
  ['B10', 'EV, Chinese', car('MG', 'ZS EV', 2021, 'electric')],
  ['B11', 'recent ICE, Japanese', car('Suzuki', 'Swift', 2019, 'petrol', 1242)],
  ['B12', 'European, French', car('Peugeot', '208', 2021, 'petrol', 1199)],
];
export const REGRESSION: [string, string, VehicleIdentity][] = [
  ['R1', 'SEAT Ibiza 2012 CGG', car('SEAT', 'Ibiza', 2012, 'petrol', 1390, 'CGG')],
  ['R2', 'Ford Fiesta 2015 1.25 SNJB', car('Ford', 'Fiesta', 2015, 'petrol', 1242, 'SNJB')],
  [
    'R3',
    'Hyundai IONIQ 2021 Premium FL Hybrid 1.6',
    car('Hyundai', 'IONIQ Hybrid', 2021, 'hybrid', 1580),
  ],
];
/** CAPABILITY PROBE — not blind, not in the metrics: other models on the one permitted system. */
export const PROBE: [string, string, VehicleIdentity][] = [
  ['P1', 'probe', moto('SYM', 'JET X', 2023, 125)],
  ['P2', 'probe', moto('SYM', 'Joyride S', 2023, 200)],
];
