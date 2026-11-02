module.exports = {
  root: true,
  extends: '@react-native',
  ignorePatterns: ['coverage/', '.evidence/', 'ios/Pods/', 'node_modules/'],
  overrides: [{ files: ['jest.setup.js'], env: { jest: true } }],
};
