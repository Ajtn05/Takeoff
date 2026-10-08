import { readPreference, savePreference } from '../ui/storage';

export const BEST_SCORE_KEY = 'takeoff-flight-rush-best-v1';

export function readBestScore(): number {
  const score = Number(readPreference(BEST_SCORE_KEY));
  return Number.isSafeInteger(score) && score >= 0 ? score : 0;
}

export function saveBestScore(score: number): number {
  const best = Math.max(readBestScore(), Number.isSafeInteger(score) && score >= 0 ? score : 0);
  savePreference(BEST_SCORE_KEY, String(best));
  return best;
}
