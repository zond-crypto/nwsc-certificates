import { RegulatoryLimit } from '../types';

/**
 * Standards Fetcher Utility
 * Attempts to fetch water quality standards from ZABS and ZEMA sources
 * Falls back to manual override if live fetching is unavailable
 */

export interface StandardsCache {
  timestamp: number;
  standards: RegulatoryLimit[];
  source: 'zabs' | 'zema' | 'manual' | 'imported';
}

const CACHE_KEY = 'nkana_standards_cache';
const CACHE_VALIDITY_DAYS = 30;

/**
 * Get cached standards if still valid
 */
export function getCachedStandards(): StandardsCache | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;

    const data: StandardsCache = JSON.parse(cached);
    const ageInDays = (Date.now() - data.timestamp) / (1000 * 60 * 60 * 24);

    if (ageInDays > CACHE_VALIDITY_DAYS) {
      return null; // Cache expired
    }

    return data;
  } catch (error) {
    console.error('Error reading standards cache:', error);
    return null;
  }
}

/**
 * Save standards to cache
 */
export function cacheStandards(standards: RegulatoryLimit[], source: StandardsCache['source']) {
  try {
    const cache: StandardsCache = {
      timestamp: Date.now(),
      standards,
      source
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error('Error caching standards:', error);
  }
}

/**
 * Clear standards cache
 */
export function clearStandardsCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (error) {
    console.error('Error clearing standards cache:', error);
  }
}

/**
 * Attempt to fetch ZABS standards
 * Note: This attempts to fetch from known ZABS public data sources or APIs
 * In production, this would require a backend proxy due to CORS restrictions
 */
export async function fetchZABSStandards(): Promise<RegulatoryLimit[]> {
  try {
    // Try multiple potential sources
    const sources = [
      'https://api.zambia-environment.org/standards/zabs', // Hypothetical API
      'https://www.zabs.org.zm/standards.json', // Hypothetical public endpoint
    ];

    for (const url of sources) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        });

        if (response.ok) {
          const data = await response.json();
          const standards = parseZABSResponse(data);
          if (standards.length > 0) {
            cacheStandards(standards, 'zabs');
            return standards;
          }
        }
      } catch (err) {
        console.log(`Failed to fetch from ${url}:`, err);
        continue;
      }
    }

    throw new Error('All ZABS sources unavailable');
  } catch (error) {
    console.error('Error fetching ZABS standards:', error);
    return [];
  }
}

/**
 * Attempt to fetch ZEMA standards
 */
export async function fetchZEMAStandards(): Promise<RegulatoryLimit[]> {
  try {
    const sources = [
      'https://api.zambia-environment.org/standards/zema',
      'https://www.zema.org.zm/standards.json',
    ];

    for (const url of sources) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        });

        if (response.ok) {
          const data = await response.json();
          const standards = parseZEMAResponse(data);
          if (standards.length > 0) {
            cacheStandards(standards, 'zema');
            return standards;
          }
        }
      } catch (err) {
        console.log(`Failed to fetch from ${url}:`, err);
        continue;
      }
    }

    throw new Error('All ZEMA sources unavailable');
  } catch (error) {
    console.error('Error fetching ZEMA standards:', error);
    return [];
  }
}

/**
 * Parse ZABS API response into RegulatoryLimit array
 */
function parseZABSResponse(data: any): RegulatoryLimit[] {
  try {
    // Adapt this based on actual API response format
    if (Array.isArray(data)) {
      return data.map((item, idx) => ({
        id: `zabs-${idx}`,
        regulatoryBody: 'ZABS',
        parameterName: item.parameter || item.parameterName || '',
        limitValue: item.limit || item.limitValue || '',
        unit: item.unit || 'mg/L'
      }));
    }
    return [];
  } catch (error) {
    console.error('Error parsing ZABS response:', error);
    return [];
  }
}

/**
 * Parse ZEMA API response into RegulatoryLimit array
 */
function parseZEMAResponse(data: any): RegulatoryLimit[] {
  try {
    if (Array.isArray(data)) {
      return data.map((item, idx) => ({
        id: `zema-${idx}`,
        regulatoryBody: 'ZEMA',
        parameterName: item.parameter || item.parameterName || '',
        limitValue: item.limit || item.limitValue || '',
        unit: item.unit || 'mg/L'
      }));
    }
    return [];
  } catch (error) {
    console.error('Error parsing ZEMA response:', error);
    return [];
  }
}

/**
 * Export standards as JSON
 */
export function exportStandardsAsJSON(standards: RegulatoryLimit[]): string {
  return JSON.stringify(standards, null, 2);
}

/**
 * Import standards from JSON
 */
export function importStandardsFromJSON(jsonString: string): RegulatoryLimit[] {
  try {
    const data = JSON.parse(jsonString);
    if (Array.isArray(data)) {
      // Validate structure
      const standards = data.filter(item =>
        item.id && item.regulatoryBody && item.parameterName && item.limitValue
      );
      cacheStandards(standards, 'imported');
      return standards;
    }
    return [];
  } catch (error) {
    console.error('Error importing standards:', error);
    throw new Error('Invalid JSON format for standards import');
  }
}

/**
 * Get cache info for display
 */
export function getCacheInfo(): {
  hasCached: boolean;
  source?: string;
  ageInDays?: number;
  lastUpdated?: string;
} {
  const cache = getCachedStandards();
  if (!cache) {
    return { hasCached: false };
  }

  const ageInDays = Math.floor((Date.now() - cache.timestamp) / (1000 * 60 * 60 * 24));
  const lastUpdated = new Date(cache.timestamp).toLocaleDateString();

  return {
    hasCached: true,
    source: cache.source,
    ageInDays,
    lastUpdated
  };
}
