export const UNPO_CONFIG = {
  name: 'うんぽくわっす',
  maxHp: 256,
  crystalHp: Math.ceil(256 / 16),
  bodyHeight: 2.8,
  bodyRadius: 1.1,
  socketY: 1.95,
  crystalHeight: 1.65,
  crystalRadius: .48,
  homingDuration: 2.0,
  bodySwayAmplitude: .28, // Y-axis rotation, radians (about 16 degrees)
  bodySwayPeriod: 6, // seconds per gentle sway
  homingTurnRate: Math.PI * .8, // radians / second
  projectileSpeed: 6,
  regenerationDuration: 2,
  attackInterval: 2,
  firstSpawnTime: 8,
  spawnInterval: 35,
  score: 2000,
  lines: ['くわっす！','うんぽ、くわっす！！','くえー、おれのうんぽ！'],
};
