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
  homingEasePower: 2, // Turn rate fades as (1 - age / duration)^power; radius grows.
  projectileSpeed: 6,
  regenerationDuration: 2,
  regenerationSpinTurns: 3, // Full Y-axis turns, easing from fast to a complete stop.
  projectileSpinRate: Math.PI * .5, // radians / second (one turn every four seconds)
  crystalParticleColor: 0x8a4f25,
  crystalSparkleColor: 0xc79965,
  crystalSparkleInterval: .22,
  attackInterval: 2,
  firstSpawnTime: 8,
  spawnInterval: 35,
  score: 2000,
  deathLine: 'くわっすーぅ！！ぅう……んこ…！！',
  deathLineDuration: 4,
  lines: ['くわっす！','うんぽ、くわっす！！','くえー、おれのうんぽ！'],
};
