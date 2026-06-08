// =============================================================================
//  Tiny step logger — emits timestamped step lines and also records them as
//  test.step boundaries when called inside a test, giving readable HTML/Allure
//  timelines without dragging in a logging dependency.
// =============================================================================

/* eslint-disable no-console */
export const log = {
  info: (msg: string): void => console.log(`ℹ  ${msg}`),
  step: (msg: string): void => console.log(`→  ${msg}`),
  pass: (msg: string): void => console.log(`✓  ${msg}`),
  warn: (msg: string): void => console.warn(`⚠  ${msg}`),
};

export default log;
