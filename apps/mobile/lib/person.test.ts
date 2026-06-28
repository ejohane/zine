import { getInitials } from './person';

describe('getInitials', () => {
  it('uses the first two non-empty name parts', () => {
    expect(getInitials('Ada Lovelace Byron')).toBe('AL');
  });

  it('handles extra whitespace and empty names', () => {
    expect(getInitials('  Grace   Hopper  ')).toBe('GH');
    expect(getInitials('   ')).toBe('');
  });
});
