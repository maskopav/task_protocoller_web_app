import { describe, it, expect } from 'vitest';
import { getTaskProgressDisplay, checkCompletionOverlay } from './progressTracker';

const t = (key) => key; // identity translator for assertions

const task = (type) => ({ type });

describe('getTaskProgressDisplay', () => {
  it('returns null for non-progress task types', () => {
    const tasks = [task('info'), task('voice')];
    expect(getTaskProgressDisplay(tasks, 0, 'fixed', t)).toBeNull();
  });

  it('reports overall progress for fixed/global strategy, excluding non-progress tasks', () => {
    const tasks = [task('info'), task('voice'), task('vision'), task('voice')];
    // index 2 -> "vision", 2nd real task out of 3 real tasks (voice, vision, voice)
    const result = getTaskProgressDisplay(tasks, 2, 'fixed', t);
    expect(result).toEqual({ label: 'taskLabels.task', current: 2, total: 3 });
  });

  it('reports per-type progress for module strategy', () => {
    const tasks = [task('voice'), task('voice'), task('vision'), task('vision')];
    // index 3 -> second "vision" task
    const result = getTaskProgressDisplay(tasks, 3, 'module', t);
    expect(result).toEqual({ label: 'taskLabels.vision', current: 2, total: 2 });
  });
});

describe('checkCompletionOverlay', () => {
  it('never shows an overlay on the last task', () => {
    const tasks = [task('voice'), task('vision')];
    expect(checkCompletionOverlay(tasks, 1, 'fixed')).toEqual({ showOverlay: false, category: null });
  });

  it('does not trigger on a non-progress current task', () => {
    const tasks = [task('info'), task('voice')];
    expect(checkCompletionOverlay(tasks, 0, 'fixed')).toEqual({ showOverlay: false, category: null });
  });

  describe('module strategy', () => {
    it('shows overlay exactly when the task type changes', () => {
      const tasks = [task('voice'), task('voice'), task('vision')];
      expect(checkCompletionOverlay(tasks, 0, 'module')).toEqual({ showOverlay: false, category: null });
      expect(checkCompletionOverlay(tasks, 1, 'module')).toEqual({ showOverlay: true, category: 'voice' });
    });
  });

  describe('fixed/global strategy', () => {
    it('shows the 50% milestone for fewer than 16 real tasks', () => {
      // 4 real tasks -> 50% milestone at count 2
      const tasks = [task('a'), task('a'), task('a'), task('a')];
      const results = tasks.map((_, i) => checkCompletionOverlay(tasks, i, 'fixed'));
      expect(results[1]).toEqual({ showOverlay: true, category: 'milestone_50' });
      expect(results[0].showOverlay).toBe(false);
      expect(results[2].showOverlay).toBe(false);
    });

    it('shows 25/50/75% milestones for 16 or more real tasks', () => {
      const tasks = Array.from({ length: 16 }, () => task('a'));
      const results = tasks.map((_, i) => checkCompletionOverlay(tasks, i, 'fixed'));
      const triggered = results
        .map((r, i) => (r.showOverlay ? { index: i, category: r.category } : null))
        .filter(Boolean);
      expect(triggered).toEqual([
        { index: 3, category: 'milestone_25' }, // ceil(16*0.25)=4 -> index 3
        { index: 7, category: 'milestone_50' }, // ceil(16*0.50)=8 -> index 7
        { index: 11, category: 'milestone_75' }, // ceil(16*0.75)=12 -> index 11
      ]);
    });

    it('excludes non-progress tasks from milestone counting', () => {
      const tasks = [task('info'), task('a'), task('a'), task('a'), task('a')];
      // 4 real tasks (indices 1-4); milestone_50 should land when 2nd real task completes (index 2)
      const result = checkCompletionOverlay(tasks, 2, 'fixed');
      expect(result).toEqual({ showOverlay: true, category: 'milestone_50' });
    });
  });
});
