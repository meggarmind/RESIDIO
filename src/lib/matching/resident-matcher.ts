/**
 * Resident Matching Engine
 *
 * Matches bank statement transactions to residents using multiple strategies:
 * 1. Exact alias match (highest priority)
 * 2. Phone number extraction from narration
 * 3. Fuzzy name matching with Fuse.js
 * 4. House number/address extraction
 */

import Fuse from 'fuse.js';
import type { MatchConfidence, MatchMethod, ResidentPaymentAlias } from '@/types/database';

// ============================================================
// Types
// ============================================================

export interface ResidentMatchData {
  id: string;
  first_name: string;
  last_name: string;
  resident_code: string;
  phone?: string | null;
  email?: string | null;
}

export interface AliasMatchData {
  id: string;
  alias_name: string;
  resident_id: string;
  resident?: ResidentMatchData;
}

export interface HouseMatchData {
  id: string;
  house_number: string;
  resident_id: string;
}

export interface MatcherConfig {
  /** Minimum score for fuzzy matches (0-1, default 0.6) */
  fuzzyThreshold?: number;
  /** Enable phone matching (default true) */
  enablePhoneMatching?: boolean;
  /** Enable house number matching (default true) */
  enableHouseMatching?: boolean;
}

export interface MatchInput {
  description: string;
  amount?: number;
  reference?: string;
}

/** Individual match result for a single matching attempt */
export interface SingleMatch {
  resident_id: string;
  method: MatchMethod;
  confidence: MatchConfidence;
  score: number;
  matched_value: string;
}

/** Full match result including all potential matches */
export interface DetailedMatchResult {
  resident_id: string | null;
  confidence: MatchConfidence;
  method: MatchMethod | null;
  matched_value?: string;
  score?: number;
  all_matches?: SingleMatch[];
}

// ============================================================
// Nigerian Phone Number Patterns
// ============================================================

const PHONE_PATTERNS = [
  // +234 format
  /\+?234\s*[789]\d{2}\s*\d{3}\s*\d{4}/g,
  // 0 prefix format
  /0[789]\d{2}[\s-]?\d{3}[\s-]?\d{4}/g,
  // Without leading 0 or +234
  /[789]\d{2}[\s-]?\d{3}[\s-]?\d{4}/g,
];

// ============================================================
// House Number Patterns
// ============================================================

const HOUSE_PATTERNS = [
  // "Block A, Plot 5" or "Block A Plot 5"
  /block\s*[a-z]\s*[,]?\s*plot\s*\d+/gi,
  // "Plot 5" or "Plt 5"
  /p(?:lot|lt)\s*\d+[a-z]?/gi,
  // "House 5" or "Hse 5"
  /h(?:ouse|se)\s*\d+[a-z]?/gi,
  // "No. 5" or "No 5"
  /no\.?\s*\d+[a-z]?/gi,
  // "5, Street Name"
  /\b\d+[a-z]?\s*,?\s+[a-z]+\s+(?:street|st|close|cres|avenue|ave|road|rd|way|drive|dr)/gi,
];

// ============================================================
// Resident Matcher Class
// ============================================================

export class ResidentMatcher {
  private residents: ResidentMatchData[];
  private aliases: AliasMatchData[];
  private houses: HouseMatchData[];
  private config: Required<MatcherConfig>;

  // Fuse.js instances
  private nameFuse: Fuse<ResidentMatchData>;
  private aliasFuse: Fuse<AliasMatchData>;

  constructor(
    residents: ResidentMatchData[],
    aliases: AliasMatchData[],
    houses: HouseMatchData[],
    config: MatcherConfig = {}
  ) {
    this.residents = residents;
    this.aliases = aliases;
    this.houses = houses;
    this.config = {
      fuzzyThreshold: config.fuzzyThreshold ?? 0.6,
      enablePhoneMatching: config.enablePhoneMatching ?? true,
      enableHouseMatching: config.enableHouseMatching ?? true,
    };

    // Initialize Fuse.js for fuzzy matching
    this.nameFuse = new Fuse(residents, {
      keys: [
        { name: 'first_name', weight: 0.4 },
        { name: 'last_name', weight: 0.4 },
        { name: 'full_name', weight: 0.2, getFn: (r) => `${r.first_name} ${r.last_name}` },
      ],
      threshold: 1 - this.config.fuzzyThreshold,
      includeScore: true,
      ignoreLocation: true,
      minMatchCharLength: 3,
    });

    this.aliasFuse = new Fuse(aliases, {
      keys: ['alias_name'],
      threshold: 1 - this.config.fuzzyThreshold,
      includeScore: true,
      ignoreLocation: true,
      minMatchCharLength: 3,
    });
  }

  /**
   * Match a transaction to a resident
   */
  match(input: MatchInput): DetailedMatchResult {
    const { description } = input;
    const allMatches: DetailedMatchResult['all_matches'] = [];

    // 1. Try exact alias match (highest priority)
    const aliasMatch = this.matchByAlias(description);
    if (aliasMatch) {
      allMatches.push(aliasMatch);
      if (aliasMatch.confidence === 'high') {
        return {
          resident_id: aliasMatch.resident_id,
          confidence: 'high',
          method: 'alias',
          matched_value: aliasMatch.matched_value,
          score: aliasMatch.score,
          all_matches: allMatches,
        };
      }
    }

    // 2. Try phone number match
    if (this.config.enablePhoneMatching) {
      const phoneMatch = this.matchByPhone(description);
      if (phoneMatch) {
        allMatches.push(phoneMatch);
        if (phoneMatch.confidence === 'high') {
          return {
            resident_id: phoneMatch.resident_id,
            confidence: 'high',
            method: 'phone',
            matched_value: phoneMatch.matched_value,
            score: phoneMatch.score,
            all_matches: allMatches,
          };
        }
      }
    }

    // 3. Try fuzzy name match
    const nameMatch = this.matchByName(description);
    if (nameMatch) {
      allMatches.push(nameMatch);
    }

    // 4. Try house number match
    if (this.config.enableHouseMatching) {
      const houseMatch = this.matchByHouseNumber(description);
      if (houseMatch) {
        allMatches.push(houseMatch);
      }
    }

    // Return best match or no match
    if (allMatches.length === 0) {
      return {
        resident_id: null,
        confidence: 'none',
        method: null,
        all_matches: [],
      };
    }

    // Sort by score descending and return best
    allMatches.sort((a, b) => (b.score || 0) - (a.score || 0));
    const best = allMatches[0];

    return {
      resident_id: best.resident_id,
      confidence: best.confidence,
      method: best.method,
      matched_value: best.matched_value,
      score: best.score,
      all_matches: allMatches,
    };
  }

  /**
   * Match by exact alias
   */
  private matchByAlias(description: string): SingleMatch | null {
    const normalizedDesc = description.toLowerCase().trim();

    // Try exact match first
    for (const alias of this.aliases) {
      const normalizedAlias = alias.alias_name.toLowerCase().trim();
      if (normalizedDesc.includes(normalizedAlias) || normalizedAlias === normalizedDesc) {
        return {
          resident_id: alias.resident_id,
          method: 'alias' as MatchMethod,
          confidence: 'high' as MatchConfidence,
          score: 1.0,
          matched_value: alias.alias_name,
        };
      }
    }

    // Try fuzzy alias match
    const results = this.aliasFuse.search(description);
    if (results.length > 0 && results[0].score !== undefined) {
      const score = 1 - results[0].score;
      const confidence = this.scoreToConfidence(score);
      if (confidence !== 'none') {
        return {
          resident_id: results[0].item.resident_id,
          method: 'alias' as MatchMethod,
          confidence,
          score,
          matched_value: results[0].item.alias_name,
        };
      }
    }

    return null;
  }

  /**
   * Match by phone number in description
   */
  private matchByPhone(description: string): SingleMatch | null {
    // Extract phone numbers from description
    const phones: string[] = [];
    for (const pattern of PHONE_PATTERNS) {
      const matches = description.match(pattern);
      if (matches) {
        phones.push(...matches.map((p) => this.normalizePhone(p)));
      }
    }

    if (phones.length === 0) {
      return null;
    }

    // Find resident with matching phone
    for (const phone of phones) {
      for (const resident of this.residents) {
        if (resident.phone && this.normalizePhone(resident.phone) === phone) {
          return {
            resident_id: resident.id,
            method: 'phone' as MatchMethod,
            confidence: 'high' as MatchConfidence,
            score: 1.0,
            matched_value: phone,
          };
        }
      }
    }

    return null;
  }

  /**
   * Match by fuzzy name matching
   */
  private matchByName(description: string): SingleMatch | null {
    // Clean the description to extract potential names
    const cleanDesc = this.extractNameCandidates(description);
    if (!cleanDesc) {
      return null;
    }

    const results = this.nameFuse.search(cleanDesc);
    if (results.length > 0 && results[0].score !== undefined) {
      const score = 1 - results[0].score;
      const confidence = this.scoreToConfidence(score);
      if (confidence !== 'none') {
        const resident = results[0].item;
        return {
          resident_id: resident.id,
          method: 'name' as MatchMethod,
          confidence,
          score,
          matched_value: `${resident.first_name} ${resident.last_name}`,
        };
      }
    }

    return null;
  }

  /**
   * Match by house number in description
   */
  private matchByHouseNumber(description: string): SingleMatch | null {
    // Extract house numbers from description
    const houseNumbers: string[] = [];
    for (const pattern of HOUSE_PATTERNS) {
      const matches = description.match(pattern);
      if (matches) {
        houseNumbers.push(...matches.map((h) => this.normalizeHouseNumber(h)));
      }
    }

    if (houseNumbers.length === 0) {
      return null;
    }

    // Find house with matching number
    for (const houseNum of houseNumbers) {
      for (const house of this.houses) {
        const normalizedHouse = this.normalizeHouseNumber(house.house_number);
        if (normalizedHouse === houseNum || normalizedHouse.includes(houseNum) || houseNum.includes(normalizedHouse)) {
          return {
            resident_id: house.resident_id,
            method: 'house_number' as MatchMethod,
            confidence: 'medium' as MatchConfidence,
            score: 0.7,
            matched_value: house.house_number,
          };
        }
      }
    }

    return null;
  }

  /**
   * Normalize phone number for comparison
   */
  private normalizePhone(phone: string): string {
    // Remove all non-digits
    let digits = phone.replace(/\D/g, '');

    // Handle Nigerian numbers
    if (digits.startsWith('234')) {
      digits = '0' + digits.slice(3);
    } else if (digits.length === 10 && /^[789]/.test(digits)) {
      digits = '0' + digits;
    }

    return digits;
  }

  /**
   * Normalize house number for comparison
   */
  private normalizeHouseNumber(houseNum: string): string {
    return houseNum.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  /**
   * Extract potential name candidates from description
   */
  private extractNameCandidates(description: string): string {
    // Remove common banking terms and noise
    let cleaned = description
      .replace(/transfer from|transfer to|from|to|payment|nip|wtrns|web|mobile|ussd/gi, ' ')
      .replace(/\d{10,}/g, ' ') // Remove long numbers (account numbers)
      .replace(/[^\w\s]/g, ' ') // Remove special chars
      .replace(/\s+/g, ' ')
      .trim();

    // Take first 4-5 words as potential name
    const words = cleaned.split(' ').filter((w) => w.length > 1);
    if (words.length > 5) {
      cleaned = words.slice(0, 5).join(' ');
    }

    return cleaned;
  }

  /**
   * Convert match score to confidence level
   */
  private scoreToConfidence(score: number): MatchConfidence {
    if (score >= 0.9) return 'high';
    if (score >= 0.7) return 'medium';
    if (score >= this.config.fuzzyThreshold) return 'low';
    return 'none';
  }

  /**
   * Batch match multiple transactions
   */
  matchBatch(inputs: MatchInput[]): DetailedMatchResult[] {
    return inputs.map((input) => this.match(input));
  }
}

/**
 * Create a matcher instance from database data
 */
export function createMatcher(
  residents: ResidentMatchData[],
  aliases: Array<ResidentPaymentAlias & { resident?: ResidentMatchData }>,
  houses: Array<{ id: string; house_number: string; resident_houses?: Array<{ resident_id: string; is_active: boolean }> }>,
  config?: MatcherConfig
): ResidentMatcher {
  // Transform aliases to match data
  const aliasData: AliasMatchData[] = aliases.map((a) => ({
    id: a.id,
    alias_name: a.alias_name,
    resident_id: a.resident_id,
    resident: a.resident,
  }));

  // Transform houses to match data (flatten to resident-house pairs)
  const houseData: HouseMatchData[] = [];
  for (const house of houses) {
    const activeResidents = house.resident_houses?.filter((rh) => rh.is_active) || [];
    for (const rh of activeResidents) {
      houseData.push({
        id: house.id,
        house_number: house.house_number,
        resident_id: rh.resident_id,
      });
    }
  }

  return new ResidentMatcher(residents, aliasData, houseData, config);
}
