// Lightweight test runner shim for local Node environments & Vitest compatibility

export function describe(name, fn) {
  console.log(`\n--- ${name} ---`);
  fn();
}

export function it(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
  } catch (err) {
    console.error(`  ❌ ${name}:`, err.message);
    throw err;
  }
}

export const test = it;

export function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, but received ${JSON.stringify(actual)}`);
      }
    },
    toEqual(expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, but received ${JSON.stringify(actual)}`);
      }
    },
    toHaveScreenshot() {
      // Mock screenshot expectation
      return Promise.resolve();
    }
  };
}

export const vi = {
  setSystemTime: (date) => {},
  fn: () => () => {}
};

export default { describe, it, test, expect, vi };
