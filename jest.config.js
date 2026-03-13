/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',

  // Mock the <canvas> API so jsdom canvas calls don't throw
  setupFiles: ['jest-canvas-mock'],

  // Where to find tests
  testMatch: ['**/tests/**/*.test.js'],

  // Coverage config
  collectCoverageFrom: ['widget.js', 'pdf-signer.js', 'sw.js'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
};
