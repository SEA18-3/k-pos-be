/**
 * Prettier Configuration
 * 
 * Reference: Official NestJS Guidelines & Airbnb JS Style Guide
 * (https://github.com/airbnb/javascript)
 */
module.exports = {
  singleQuote: true,       // Airbnb standard: Use single quotes
  trailingComma: 'all',    // Airbnb standard: Clean git diffs
  printWidth: 100,         // NestJS relaxed standard: Better readability for decorators
  tabWidth: 2,             // Universal JS standard
  semi: true,              // NestJS standard: Explicit semicolons
  bracketSpacing: true,    // NestJS default
  arrowParens: 'always',   // Prettier standard: Ease of adding TS types
  endOfLine: 'lf',         // Git standard: Cross-platform consistency
};
