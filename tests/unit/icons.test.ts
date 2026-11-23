import { describe, expect, it } from 'vitest';
import { ICON_DATA } from '../../src/ui/icons';

describe('pixel icons', () => {
  it('are all 12×12 and use known colours', () => {
    for (const [name, rows] of Object.entries(ICON_DATA)) {
      expect(rows.length, name).toBe(12);
      for (const r of rows) expect(r.length, `${name}: "${r}"`).toBe(12);
      for (const r of rows) for (const ch of r) expect('.KOoYCcWPpGgDMmRrL'.includes(ch), `${name} char ${ch}`).toBe(true);
    }
  });
});
