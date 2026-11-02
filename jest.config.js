module.exports = {
  watchman: false,
  preset: '@react-native/jest-preset',
  setupFilesAfterEnv: ['./jest.setup.js'],
  collectCoverageFrom: ['App.tsx', 'src/**/*.{ts,tsx}'],
  coverageReporters: ['text-summary', 'lcov'],
  coverageThreshold: {
    global: { lines: 85, statements: 85, branches: 80, functions: 85 },
  },
};
