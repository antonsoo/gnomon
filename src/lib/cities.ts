export interface City {
  name: string;
  country: string;
  latitudeDeg: number;
  longitudeDeg: number;
  /** IANA time zone, used to derive the zone meridian and DST via Intl. */
  timeZone: string;
  note?: string;
}

/**
 * A small built-in gazetteer: historic sites central to the astronomy
 * that sundials are built from, plus a few populous modern cities so the
 * list is useful out of the box. Coordinates are city-centre approximations,
 * not survey-grade -- fine for a garden dial, not for a plaque claiming
 * arc-second precision.
 */
export const CITIES: City[] = [
  {
    name: "Alexandria",
    country: "Egypt",
    latitudeDeg: 31.2001,
    longitudeDeg: 29.9187,
    timeZone: "Africa/Cairo",
    note: "Site of Eratosthenes' library; his estimate of Earth's circumference used shadow angles here and at Syene.",
  },
  {
    name: "Aswan (ancient Syene)",
    country: "Egypt",
    latitudeDeg: 24.0889,
    longitudeDeg: 32.8998,
    timeZone: "Africa/Cairo",
    note: "Near enough the Tropic of Cancer in antiquity that Eratosthenes took the sun as directly overhead there at the summer solstice.",
  },
  {
    name: "Athens",
    country: "Greece",
    latitudeDeg: 37.9838,
    longitudeDeg: 23.7275,
    timeZone: "Europe/Athens",
    note: "The Tower of the Winds carried eight sundials on its faces.",
  },
  {
    name: "Rome",
    country: "Italy",
    latitudeDeg: 41.9028,
    longitudeDeg: 12.4964,
    timeZone: "Europe/Rome",
    note: "The Solarium Augusti used an Egyptian obelisk as a giant gnomon.",
  },
  {
    name: "Babylon",
    country: "Iraq",
    latitudeDeg: 32.5355,
    longitudeDeg: 44.4275,
    timeZone: "Asia/Baghdad",
    note: "Herodotus credits the Babylonians with introducing the sundial's gnomon and the twelve-part day to Greece.",
  },
  {
    name: "Samarkand",
    country: "Uzbekistan",
    latitudeDeg: 39.627,
    longitudeDeg: 66.975,
    timeZone: "Asia/Samarkand",
    note: "Ulugh Beg's 15th-century observatory held a giant sextant for solar and stellar measurement.",
  },
  {
    name: "Jaipur",
    country: "India",
    latitudeDeg: 26.9124,
    longitudeDeg: 75.7873,
    timeZone: "Asia/Kolkata",
    note: "Home to the Samrat Yantra, the largest gnomon sundial ever built (accurate to about 2 seconds).",
  },
  {
    name: "San Francisco",
    country: "United States",
    latitudeDeg: 37.7749,
    longitudeDeg: -122.4194,
    timeZone: "America/Los_Angeles",
  },
  {
    name: "London",
    country: "United Kingdom",
    latitudeDeg: 51.5072,
    longitudeDeg: -0.1276,
    timeZone: "Europe/London",
  },
  {
    name: "Tokyo",
    country: "Japan",
    latitudeDeg: 35.6762,
    longitudeDeg: 139.6503,
    timeZone: "Asia/Tokyo",
  },
];
