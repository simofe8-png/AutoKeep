import type { FingerprintInput } from '../fingerprint';

/**
 * Representative cross-manufacturer validation matrix (owner instruction 2026-10-03,
 * "GENERALIZE M-SOURCE"). Facts only as a registry would provide them: an unknown engine code /
 * transmission / body stays unknown. Nothing here is used by production code.
 * F01 / S01 are the two regression vehicles.
 */
export interface MatrixVehicle {
  id: string;
  label: string;
  /** What the matrix exercises (for the report). */
  covers: string[];
  input: FingerprintInput;
}

export const MATRIX: readonly MatrixVehicle[] = [
  {
    id: 'F01',
    label: 'Ford Fiesta 2015 1.25 SNJB (regression)',
    covers: ['Ford', 'petrol NA', 'engine code known', 'manual'],
    input: {
      kind: 'car',
      manufacturer: 'פורד גרמניה',
      model: 'FIESTA',
      year: 2015,
      engine: '1242 סמ״ק',
      engineCode: 'SNJB',
      fuel: 'בנזין',
      transmission: 'ידני',
    },
  },
  {
    id: 'S01',
    label: 'SEAT Ibiza 2012 1.4 CGG 5-door (regression)',
    covers: ['VW group', 'petrol NA', 'regime code', 'body variant'],
    input: {
      kind: 'car',
      manufacturer: 'סיאט ספרד',
      model: 'IBIZA',
      year: 2012,
      engine: '1390 סמ״ק',
      engineCode: 'CGG',
      fuel: 'בנזין',
      body: "הצ'בק",
    },
  },
  {
    id: 'M01',
    label: 'Ford Focus 2016 1.0 EcoBoost',
    covers: ['Ford', 'petrol turbo', 'engine code unknown'],
    input: {
      kind: 'car',
      manufacturer: 'Ford',
      model: 'Focus',
      year: 2016,
      engine: 998,
      fuel: 'בנזין',
    },
  },
  {
    id: 'M02',
    label: 'Volkswagen Golf 2015 1.6 TDI',
    covers: ['VW group', 'diesel', 'flexible/fixed regimes'],
    input: {
      kind: 'car',
      manufacturer: 'פולקסווגן גרמניה',
      model: 'GOLF',
      year: 2015,
      engine: '1598 סמ״ק',
      fuel: 'דיזל',
    },
  },
  {
    id: 'M03',
    label: 'Skoda Octavia 2018 1.4 TSI',
    covers: ['VW group', 'petrol turbo', 'Czech manufacturer language'],
    input: {
      kind: 'car',
      manufacturer: "סקודה צ'כיה",
      model: 'OCTAVIA',
      year: 2018,
      engine: '1395 סמ״ק',
      fuel: 'בנזין',
    },
  },
  {
    id: 'M04',
    label: 'Toyota Corolla 2017 1.6',
    covers: ['Toyota', 'petrol NA', 'Japanese manufacturer'],
    input: {
      kind: 'car',
      manufacturer: 'טויוטה טורקיה',
      model: 'COROLLA',
      year: 2017,
      engine: '1598 סמ״ק',
      fuel: 'בנזין',
    },
  },
  {
    id: 'M05',
    label: 'Hyundai i30 2014 1.6',
    covers: ['Hyundai', 'petrol NA', 'Korean manufacturer'],
    input: {
      kind: 'car',
      manufacturer: 'יונדאי קוריאה',
      model: 'i30',
      year: 2014,
      engine: '1591 סמ״ק',
      fuel: 'בנזין',
    },
  },
  {
    id: 'M06',
    label: 'Kia Picanto 2018 1.0',
    covers: ['Kia', 'petrol NA', 'small displacement'],
    input: {
      kind: 'car',
      manufacturer: 'קיה קוריאה',
      model: 'PICANTO',
      year: 2018,
      engine: '998 סמ״ק',
      fuel: 'בנזין',
    },
  },
  {
    id: 'M07',
    label: 'Renault Megane 2016 1.5 dCi',
    covers: ['Renault', 'diesel', 'French manufacturer'],
    input: {
      kind: 'car',
      manufacturer: 'Renault',
      model: 'Megane',
      year: 2016,
      engine: 1461,
      fuel: 'diesel',
    },
  },
  {
    id: 'M08',
    label: 'Dacia Duster 2017 1.6',
    covers: ['Dacia', 'petrol NA'],
    input: {
      kind: 'car',
      manufacturer: 'Dacia',
      model: 'Duster',
      year: 2017,
      engine: 1598,
      fuel: 'petrol',
    },
  },
  {
    id: 'M09',
    label: 'Peugeot 208 2016 1.2 PureTech',
    covers: ['Peugeot', 'petrol (3-cyl)'],
    input: {
      kind: 'car',
      manufacturer: "פיג'ו צרפת",
      model: '208',
      year: 2016,
      engine: '1199 סמ״ק',
      fuel: 'בנזין',
    },
  },
  {
    id: 'M10',
    label: 'Citroen C3 2017 1.2 PureTech',
    covers: ['Citroen', 'petrol'],
    input: {
      kind: 'car',
      manufacturer: 'Citroen',
      model: 'C3',
      year: 2017,
      engine: 1199,
      fuel: 'petrol',
    },
  },
  {
    id: 'M11',
    label: 'Mazda 3 2015 2.0',
    covers: ['Mazda', 'petrol NA', 'numeric model name'],
    input: {
      kind: 'car',
      manufacturer: 'מזדה יפן',
      model: '3',
      year: 2015,
      engine: '1998 סמ״ק',
      fuel: 'בנזין',
    },
  },
  {
    id: 'M12',
    label: 'Honda Civic 2017 1.5 turbo',
    covers: ['Honda', 'petrol turbo', 'maintenance-minder regime'],
    input: {
      kind: 'car',
      manufacturer: 'הונדה יפן',
      model: 'CIVIC',
      year: 2017,
      engine: '1498 סמ״ק',
      fuel: 'בנזין',
    },
  },
  {
    id: 'M13',
    label: 'Nissan Qashqai 2016 1.2 DIG-T',
    covers: ['Nissan', 'petrol turbo'],
    input: {
      kind: 'car',
      manufacturer: 'Nissan',
      model: 'Qashqai',
      year: 2016,
      engine: 1197,
      fuel: 'petrol',
    },
  },
  {
    id: 'M14',
    label: 'BMW 318i 2017 1.5',
    covers: ['BMW', 'petrol turbo', 'condition-based service'],
    input: {
      kind: 'car',
      manufacturer: 'BMW',
      model: '318i',
      year: 2017,
      engine: 1499,
      fuel: 'petrol',
    },
  },
];
