import { describe, it, expect } from 'vitest'
import {
  normalizeCreatorName,
  normalizeCreatorNameWithSuffixes,
  levenshteinDistance,
  calculateNameSimilarity,
  calculateNameSimilarityAsync
} from '../utils/creator-matching'

describe('Creator Matching Utils', () => {
  describe('normalizeCreatorName', () => {
    it('should convert to lowercase', () => {
      expect(normalizeCreatorName('Creator Name')).toBe('creator name')
    })

    it('should remove special characters', () => {
      expect(normalizeCreatorName('Creator-Name!')).toBe('creatorname')
      expect(normalizeCreatorName('Creator@Name#123')).toBe('creatorname123')
    })

    it('should normalize whitespace', () => {
      expect(normalizeCreatorName('Creator   Name')).toBe('creator name')
      expect(normalizeCreatorName('  Creator Name  ')).toBe('creator name')
    })

    it('should handle @ prefix', () => {
      expect(normalizeCreatorName('@username')).toBe('username')
    })

    it('should handle complex cases', () => {
      expect(normalizeCreatorName('@Creator - Official!!')).toBe('creator official')
    })
  })

  describe('normalizeCreatorNameWithSuffixes', () => {
    it('should remove @ prefix', () => {
      expect(normalizeCreatorNameWithSuffixes('@username')).toBe('username')
    })

    it('should remove "Official" suffix', () => {
      expect(normalizeCreatorNameWithSuffixes('Creator Official')).toBe('Creator')
      expect(normalizeCreatorNameWithSuffixes('Creator OFFICIAL')).toBe('Creator')
    })

    it('should remove "Channel" suffix', () => {
      expect(normalizeCreatorNameWithSuffixes('Creator Channel')).toBe('Creator')
    })

    it('should remove "Music" suffix', () => {
      expect(normalizeCreatorNameWithSuffixes('Artist Music')).toBe('Artist')
    })

    it('should remove "Podcast" suffix', () => {
      expect(normalizeCreatorNameWithSuffixes('Show Name Podcast')).toBe('Show Name')
    })

    it('should remove "VEVO" suffix', () => {
      expect(normalizeCreatorNameWithSuffixes('Artist VEVO')).toBe('Artist')
    })

    it('should handle multiple transformations', () => {
      expect(normalizeCreatorNameWithSuffixes('@Creator Official')).toBe('Creator')
    })

    it('should trim whitespace', () => {
      expect(normalizeCreatorNameWithSuffixes('  Creator  ')).toBe('Creator')
    })

    it('should not remove suffixes in the middle', () => {
      expect(normalizeCreatorNameWithSuffixes('Official Creator')).toBe('Official Creator')
      expect(normalizeCreatorNameWithSuffixes('Channel News Network')).toBe('Channel News Network')
    })
  })

  describe('levenshteinDistance', () => {
    it('should return 0 for identical strings', () => {
      expect(levenshteinDistance('test', 'test')).toBe(0)
    })

    it('should calculate single character insertion', () => {
      expect(levenshteinDistance('cat', 'cats')).toBe(1)
    })

    it('should calculate single character deletion', () => {
      expect(levenshteinDistance('cats', 'cat')).toBe(1)
    })

    it('should calculate single character substitution', () => {
      expect(levenshteinDistance('cat', 'bat')).toBe(1)
    })

    it('should calculate distance for completely different strings', () => {
      expect(levenshteinDistance('abc', 'xyz')).toBe(3)
    })

    it('should calculate distance for strings of different lengths', () => {
      expect(levenshteinDistance('kitten', 'sitting')).toBe(3)
    })

    it('should handle empty strings', () => {
      expect(levenshteinDistance('', 'test')).toBe(4)
      expect(levenshteinDistance('test', '')).toBe(4)
      expect(levenshteinDistance('', '')).toBe(0)
    })

    it('should be case-sensitive', () => {
      expect(levenshteinDistance('Test', 'test')).toBe(1)
    })
  })

  describe('calculateNameSimilarity', () => {
    describe('exact matches', () => {
      it('should match identical names', () => {
        const result = calculateNameSimilarity('Creator Name', 'Creator Name')
        expect(result.match).toBe(true)
        expect(result.similarity).toBe(1.0)
        expect(result.method).toBe('exact')
      })

      it('should match names with different casing', () => {
        const result = calculateNameSimilarity('Creator Name', 'CREATOR NAME')
        expect(result.match).toBe(true)
        expect(result.similarity).toBe(1.0)
        expect(result.method).toBe('exact')
      })

      it('should match names with different punctuation', () => {
        const result = calculateNameSimilarity('Creator-Name', 'Creator Name')
        expect(result.match).toBe(true)
        expect(result.similarity).toBeGreaterThan(0.85)
        expect(result.method).toBe('fuzzy')
      })
    })

    describe('substring matches', () => {
      it('should match when one name contains the other and ratio > 0.7', () => {
        // 'test' (4) / 'testing' (7) = 0.571 - won't match
        // 'creator' (7) / 'creators' (8) = 0.875 - will match
        const result = calculateNameSimilarity('creator', 'creators')
        expect(result.match).toBe(true)
        expect(result.method).toBe('substring')
        expect(result.similarity).toBeGreaterThan(0.7)
      })

      it('should calculate similarity ratio correctly', () => {
        const result = calculateNameSimilarity('Test', 'TestLonger')
        expect(result.similarity).toBeCloseTo(4 / 10) // 'Test' length / 'TestLonger' length
      })

      it('should not match if similarity too low', () => {
        const result = calculateNameSimilarity('A', 'ABCDEFGHIJ')
        expect(result.match).toBe(false)
        expect(result.similarity).toBeLessThan(0.7)
      })
    })

    describe('fuzzy matches', () => {
      it('should match very similar names', () => {
        const result = calculateNameSimilarity('Creator Name', 'Creator Naame')
        expect(result.match).toBe(true)
        expect(result.method).toBe('fuzzy')
      })

      it('should not match dissimilar names', () => {
        const result = calculateNameSimilarity('Creator', 'Completely Different')
        expect(result.match).toBe(false)
        expect(result.method).toBe('none')
      })

      it('should calculate similarity correctly', () => {
        const result1 = calculateNameSimilarity('test', 'test')
        expect(result1.similarity).toBe(1.0)

        const result2 = calculateNameSimilarity('test', 'best')
        expect(result2.similarity).toBe(0.75) // 1 edit in 4 characters

        const result3 = calculateNameSimilarity('abc', 'xyz')
        expect(result3.similarity).toBe(0.0) // 3 edits in 3 characters
      })
    })

    describe('real-world examples', () => {
      it('should match creator names after applying suffix normalization', () => {
        // Use normalizeCreatorNameWithSuffixes before comparison
        const name1 = normalizeCreatorNameWithSuffixes('Creator Official')
        const name2 = normalizeCreatorNameWithSuffixes('Creator')
        const result = calculateNameSimilarity(name1, name2)
        expect(result.match).toBe(true)
        expect(result.similarity).toBe(1.0)
      })

      it('should match YouTube vs Spotify variations', () => {
        const result = calculateNameSimilarity(
          'The Joe Rogan Experience',
          'Joe Rogan Experience'
        )
        expect(result.match).toBe(true)
      })

      it('should match handles with and without @', () => {
        const result = calculateNameSimilarity('@username', 'username')
        expect(result.match).toBe(true)
        expect(result.similarity).toBe(1.0)
      })
    })
  })

  describe('calculateNameSimilarityAsync', () => {
    it('should work identically to sync version', async () => {
      const syncResult = calculateNameSimilarity('Creator', 'Creator Official')
      const asyncResult = await calculateNameSimilarityAsync('Creator', 'Creator Official')

      expect(asyncResult).toEqual(syncResult)
    })

    it('should return a promise', () => {
      const result = calculateNameSimilarityAsync('test', 'test')
      expect(result).toBeInstanceOf(Promise)
    })
  })
})
