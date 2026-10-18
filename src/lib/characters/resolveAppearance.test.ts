import { expect, it } from 'vitest';
import { resolveAppearance } from './resolveAppearance';
it.each([
  ['Doctor', 'doctor'], ['Medical Doctor', 'doctor'], ['Physician', 'doctor'], ['의사', 'doctor'],
  ['Teacher', 'teacher'], ['School Teacher', 'teacher'], ['Educator', 'teacher'], ['선생님', 'teacher'],
  ['Personal Trainer', 'trainer'], ['Fitness Coach', 'trainer'], ['Strength Coach', 'trainer'], ['헬스 트레이너', 'trainer'],
  ['Software Engineer', 'engineer'], ['소프트웨어 개발자', 'engineer'], ['Chef', 'chef'], ['Scientist', 'researcher'],
  ['Lawyer', 'lawyer'], ['Economist', 'economist'], ['Designer', 'designer'], ['Construction Worker', 'controls'],
  ['unknown', 'general'],
])('resolves %s to %s', (title, category) => expect(resolveAppearance(title).category).toBe(category));
it('validates explicit categories and prioritizes a specific title', () => {
  expect(resolveAppearance('Doctor', '', '../../fake').category).toBe('doctor');
  expect(resolveAppearance('Unknown', '', 'teacher').category).toBe('teacher');
  expect(resolveAppearance('Teacher', 'medical education').category).toBe('teacher');
});
