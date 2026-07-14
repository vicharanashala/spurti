import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { DEFAULT_SUNDAY_BONUS_CONFIG } from './sundayBonus.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, '..', 'data', 'sunday-bonus-config.json');

function envConfig() {
  return {
    enabled: process.env.SUNDAY_BONUS_ENABLED !== 'false',
    thresholdMinutes: Number(process.env.SUNDAY_BONUS_THRESHOLD_MINUTES || DEFAULT_SUNDAY_BONUS_CONFIG.thresholdMinutes),
    fullClassMinutes: Number(process.env.SUNDAY_BONUS_FULL_CLASS_MINUTES || DEFAULT_SUNDAY_BONUS_CONFIG.fullClassMinutes),
    partialBonusSp: Number(process.env.SUNDAY_BONUS_PARTIAL_SP || DEFAULT_SUNDAY_BONUS_CONFIG.partialBonusSp),
    fullBonusSp: Number(process.env.SUNDAY_BONUS_FULL_SP || DEFAULT_SUNDAY_BONUS_CONFIG.fullBonusSp)
  };
}

export function normalizeSundayBonusConfig(input = {}) {
  const base = { ...DEFAULT_SUNDAY_BONUS_CONFIG, ...envConfig(), ...input };
  return {
    enabled: Boolean(base.enabled),
    thresholdMinutes: Number(base.thresholdMinutes || 0),
    fullClassMinutes: Number(base.fullClassMinutes || Number(base.thresholdMinutes || 0)),
    partialBonusSp: Number(base.partialBonusSp || 0),
    fullBonusSp: Number(base.fullBonusSp || 0),
    awardOnlyOncePerSession: Boolean(base.awardOnlyOncePerSession !== false)
  };
}

export function loadSundayBonusConfig() {
  try {
    if (!fs.existsSync(configPath)) return normalizeSundayBonusConfig(envConfig());
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return normalizeSundayBonusConfig(raw);
  } catch {
    return normalizeSundayBonusConfig(envConfig());
  }
}

export function saveSundayBonusConfig(input) {
  const normalized = normalizeSundayBonusConfig(input);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(normalized, null, 2));
  return normalized;
}
