import { RegulatoryLimit } from '../types';

export interface StandardsCache {
  timestamp: number;
  standards: RegulatoryLimit[];
  source: 'default' | 'manual' | 'imported';
}

const CACHE_KEY = 'nkana_standards_cache';

function normalizeLimit(limit: Partial<RegulatoryLimit>, index: number): RegulatoryLimit | null {
  const regulatoryBody = limit.regulatoryBody === 'ZEMA' ? 'ZEMA' : limit.regulatoryBody === 'ZABS' ? 'ZABS' : null;
  const parameterName = limit.parameterName?.trim();
  const limitValue = limit.limitValue?.trim();

  if (!regulatoryBody || !parameterName || !limitValue) return null;

  return {
    id: limit.id?.trim() || `rl-${regulatoryBody.toLowerCase()}-${index}`,
    regulatoryBody,
    parameterName,
    limitValue,
    unit: limit.unit?.trim() || '',
  };
}

function getLimitKey(limit: RegulatoryLimit) {
  return `${limit.regulatoryBody}::${limit.parameterName.trim().toLowerCase()}::${limit.unit.trim().toLowerCase()}`;
}

export function dedupeRegulatoryLimits(limits: RegulatoryLimit[]): RegulatoryLimit[] {
  const seen = new Set<string>();
  const deduped: RegulatoryLimit[] = [];

  limits.forEach((limit, index) => {
    const normalized = normalizeLimit(limit, index);
    if (!normalized) return;

    const key = getLimitKey(normalized);
    if (seen.has(key)) return;

    seen.add(key);
    deduped.push(normalized);
  });

  return deduped;
}

export function mergeRegulatoryLimits(existing: RegulatoryLimit[], incoming: RegulatoryLimit[]) {
  const base = dedupeRegulatoryLimits(existing);
  const merged = dedupeRegulatoryLimits([...base, ...incoming]);

  return {
    limits: merged,
    addedCount: merged.length - base.length,
  };
}

export function cacheStandards(standards: RegulatoryLimit[], source: StandardsCache['source']) {
  try {
    const cache: StandardsCache = {
      timestamp: Date.now(),
      standards: dedupeRegulatoryLimits(standards),
      source,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error('Error caching standards:', error);
  }
}

export function getCachedStandards(): StandardsCache | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;

    const parsed = JSON.parse(cached) as StandardsCache;
    return {
      ...parsed,
      standards: dedupeRegulatoryLimits(parsed.standards || []),
    };
  } catch (error) {
    console.error('Error reading standards cache:', error);
    return null;
  }
}

export function clearStandardsCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (error) {
    console.error('Error clearing standards cache:', error);
  }
}

export function exportStandardsAsJSON(standards: RegulatoryLimit[]): string {
  return JSON.stringify(dedupeRegulatoryLimits(standards), null, 2);
}

export function importStandardsFromJSON(jsonString: string): RegulatoryLimit[] {
  try {
    const data = JSON.parse(jsonString);
    if (!Array.isArray(data)) {
      throw new Error('Invalid JSON format for standards import');
    }

    const standards = dedupeRegulatoryLimits(
      data
        .map((item, index) => normalizeLimit(item, index))
        .filter((item): item is RegulatoryLimit => item !== null)
    );

    if (standards.length === 0) {
      throw new Error('No valid standards found in import file');
    }

    cacheStandards(standards, 'imported');
    return standards;
  } catch (error) {
    console.error('Error importing standards:', error);
    throw new Error('Invalid JSON format for standards import');
  }
}
