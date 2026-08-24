import { describe, it, expect, vi } from 'vitest';
import { randomizeTasks } from './randomizer';

const taskList = (types: string[]) => types.map((type, i) => ({ id: i, type }));

describe('randomizeTasks', () => {
  it('returns tasks unchanged when strategy is "none" or unspecified', () => {
    const tasks = taskList(['a', 'b', 'c']);
    expect(randomizeTasks(tasks)).toEqual(tasks);
    expect(randomizeTasks(tasks, { strategy: 'none' })).toEqual(tasks);
  });

  it('does not mutate the input array', () => {
    const tasks = taskList(['a', 'b', 'c']);
    const snapshot = JSON.stringify(tasks);
    randomizeTasks(tasks, { strategy: 'global' });
    expect(JSON.stringify(tasks)).toBe(snapshot);
  });

  describe('global strategy', () => {
    it('returns the same set of tasks in some order', () => {
      const tasks = taskList(['a', 'b', 'c', 'd', 'e']);
      const result = randomizeTasks(tasks, { strategy: 'global' });
      expect(result).toHaveLength(tasks.length);
      expect(result.sort((x, y) => x.id - y.id)).toEqual(tasks);
    });
  });

  describe('module strategy', () => {
    it('groups consecutive same-type tasks into contiguous blocks by default', () => {
      // a,a,b,b,c -> blocks [a,a] [b,b] [c] kept in original block order
      const tasks = taskList(['a', 'a', 'b', 'b', 'c']);
      const result = randomizeTasks(tasks, { strategy: 'module' });
      expect(result.map((t: any) => t.type)).toEqual(['a', 'a', 'b', 'b', 'c']);
    });

    it('treats non-adjacent runs of the same type as separate blocks', () => {
      // a,b,a -> three blocks: [a] [b] [a]; without block/within shuffling, order is preserved
      const tasks = taskList(['a', 'b', 'a']);
      const result = randomizeTasks(tasks, { strategy: 'module' });
      expect(result.map((t: any) => t.type)).toEqual(['a', 'b', 'a']);
      expect(result).toHaveLength(3);
    });

    it('shuffles within each block when shuffleWithin is set, keeping block membership intact', () => {
      const tasks = taskList(['a', 'a', 'a', 'a', 'b', 'b']);
      const result = randomizeTasks(tasks, {
        strategy: 'module',
        moduleSettings: { shuffleWithin: true },
      });
      const types = result.map((t: any) => t.type);
      expect(types.filter((t: string) => t === 'a')).toHaveLength(4);
      expect(types.filter((t: string) => t === 'b')).toHaveLength(2);
      // block order (a-block before b-block) must be preserved even though shuffled within
      expect(types.slice(0, 4).every((t: string) => t === 'a')).toBe(true);
      expect(types.slice(4, 6).every((t: string) => t === 'b')).toBe(true);
    });

    it('shuffles block order when shuffleBlocks is set, without splitting blocks', () => {
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
      const tasks = taskList(['a', 'a', 'b', 'b', 'c', 'c']);
      const result = randomizeTasks(tasks, {
        strategy: 'module',
        moduleSettings: { shuffleBlocks: true },
      });
      randomSpy.mockRestore();

      const types = result.map((t: any) => t.type);
      // Still 3 contiguous blocks of size 2, just possibly reordered.
      expect(types).toHaveLength(6);
      for (let i = 0; i < types.length; i += 2) {
        expect(types[i]).toBe(types[i + 1]);
      }
    });

    it('handles an empty task list', () => {
      expect(randomizeTasks([], { strategy: 'module' })).toEqual([]);
      expect(randomizeTasks([], { strategy: 'global' })).toEqual([]);
    });
  });
});
