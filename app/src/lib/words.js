const ADJECTIVES = [
  'Amber', 'Ancient', 'Arctic', 'Ardent', 'Arid', 'Astral', 'Ashen', 'Azure',
  'Bold', 'Boreal', 'Bright', 'Bronze', 'Brisk', 'Burnt',
  'Calm', 'Cardinal', 'Celestial', 'Cerulean', 'Chromatic', 'Cinder', 'Clear', 'Cobalt', 'Coastal', 'Coral', 'Crimson',
  'Dark', 'Dawn', 'Deep', 'Dense', 'Desert', 'Distant', 'Drifting', 'Dusk', 'Dusky',
  'Eastern', 'Ebony', 'Ecliptic', 'Emerald', 'Ember',
  'Fallow', 'Far', 'Feral', 'Fierce', 'Fixed', 'Fleet', 'Flint', 'Flowing', 'Foggy', 'Frozen',
  'Galactic', 'Gilded', 'Glacial', 'Glowing', 'Golden', 'Grand', 'Granite', 'Grave',
  'Hazy', 'Hidden', 'High', 'Highland', 'Hollow',
  'Indigo', 'Inland', 'Inner', 'Iron',
  'Jade', 'Jagged',
  'Keen', 'Kindled',
  'Lapis', 'Lateral', 'Lawless', 'Liminal', 'Lithic', 'Lone', 'Lost', 'Lunar', 'Luminous',
  'Magnetic', 'Mast', 'Mauve', 'Meridional', 'Midnight', 'Misty', 'Muted',
  'Narrow', 'Nautical', 'Nebular', 'Nomadic', 'Northern',
  'Oblique', 'Obsidian', 'Ocular', 'Offshore', 'Open', 'Outer',
  'Pale', 'Pelagic', 'Pewter', 'Phantom', 'Polar', 'Primal', 'Prime', 'Prismatic',
  'Quiet',
  'Radiant', 'Rapid', 'Raw', 'Remote', 'Rippling', 'Rising', 'Rocky', 'Roving', 'Ruddy', 'Rugged',
  'Sage', 'Salt', 'Sandy', 'Scarlet', 'Serene', 'Shadow', 'Sharp', 'Shifting', 'Silent', 'Silver', 'Slate', 'Solar', 'Solitary', 'Somber', 'Southern', 'Spare', 'Starlit', 'Still', 'Stone', 'Storm', 'Strong', 'Subtle', 'Sunlit', 'Swept',
  'Tawny', 'Terminal', 'Tidal', 'Timber', 'Topaz', 'Trackless', 'Transient', 'True',
  'Umber', 'Unbound', 'Upper',
  'Vast', 'Veiled', 'Verdant', 'Vernal',
  'Wandering', 'Western', 'Wild', 'Windy', 'Winter', 'Worn',
  'Zenith', 'Zonal',
];

const NOUNS = [
  'Anchor', 'Apex', 'Arc', 'Azimuth',
  'Beacon', 'Bear', 'Belt', 'Bearing', 'Bluff', 'Boreal', 'Bough', 'Brow', 'Butte',
  'Cairn', 'Cape', 'Canyon', 'Canopy', 'Chart', 'Cliff', 'Cloud', 'Compass', 'Course', 'Crest', 'Cross', 'Current',
  'Delta', 'Depths', 'Divide', 'Drift', 'Dune',
  'Eagle', 'Edge', 'Equinox', 'Estuary',
  'Falcon', 'Field', 'Fjord', 'Flare', 'Fleet', 'Flint', 'Flow', 'Ford', 'Forge', 'Fork',
  'Gale', 'Gap', 'Gate', 'Glacier', 'Glen', 'Glyph', 'Grade', 'Grid', 'Grove',
  'Halo', 'Harbor', 'Heading', 'Helm', 'Heron', 'Horizon', 'Horn',
  'Index', 'Inlet', 'Isle',
  'Keel', 'Knoll',
  'Landmark', 'Latitude', 'Ledge', 'Light', 'Line', 'Longitude',
  'Magnet', 'Mark', 'Marsh', 'Mast', 'Meridian', 'Mesa', 'Moon', 'Moor', 'Mountain',
  'Nadir', 'Node', 'North',
  'Oasis', 'Orbit', 'Osprey',
  'Pass', 'Path', 'Peak', 'Pelican', 'Pine', 'Pinnacle', 'Pivot', 'Plain', 'Plover', 'Point', 'Pole', 'Probe',
  'Raven', 'Reach', 'Reef', 'Ridge', 'Rise', 'River', 'Rock', 'Route',
  'Sandbar', 'Scale', 'Sector', 'Sextant', 'Shore', 'Signal', 'Slope', 'Solstice', 'South', 'Span', 'Summit', 'Swift',
  'Tarn', 'Terminus', 'Tide', 'Timber', 'Tor', 'Track', 'Trail', 'Transit',
  'Valley', 'Vector', 'Vent', 'Vertex',
  'Watch', 'Waypoint', 'West', 'Wind',
  'Yard', 'Yaw',
  'Zenith', 'Zone',
];

/**
 * Generate a random adjective-noun name from navigation/nature-themed word lists.
 * @returns {string} e.g. "Crimson Falcon"
 */
export const generateName = () => {
  const adj  = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj} ${noun}`;
};
