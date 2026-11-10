import { describe, expect, it } from 'vitest';
import { computeStageState } from './project.mapper.js';

function stages(completed: number[]) {
  return Array.from({ length: 8 }, (_, index) => ({
    stageNo: index + 1,
    title: `Tahap ${index + 1}`,
    isCompleted: completed.includes(index + 1),
  }));
}

describe('computeStageState', () => {
  it('menghitung progres dari jumlah tahap selesai', () => {
    const state = computeStageState(stages([1, 2, 4]), 'in_progress');

    expect(state.completedStages).toBe(3);
    expect(state.progressPercent).toBe(38);
    expect(state.currentStage).toBe(3);
    expect(state.currentStageTitle).toBe('Tahap 3');
  });

  it('proyek belum mulai memakai current_stage 0', () => {
    const state = computeStageState(stages([]), 'not_started');

    expect(state.completedStages).toBe(0);
    expect(state.progressPercent).toBe(0);
    expect(state.currentStage).toBe(0);
  });

  it('semua tahap selesai menghasilkan 100% dan tahap 8', () => {
    const state = computeStageState(
      stages([1, 2, 3, 4, 5, 6, 7, 8]),
      'completed',
    );

    expect(state.completedStages).toBe(8);
    expect(state.progressPercent).toBe(100);
    expect(state.currentStage).toBe(8);
  });
});
