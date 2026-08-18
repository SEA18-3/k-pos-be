const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL or DIRECT_URL is required.');
  process.exit(1);
}

const database = new URL(connectionString).pathname.replace(/^\//, '');
if (database !== 'kpos_db' && !database.startsWith('kpos_test')) {
  console.error(`Refusing to reset unexpected database: ${database}`);
  process.exit(1);
}

const prismaCli = resolve(__dirname, '..', 'node_modules', 'prisma', 'build', 'index.js');
const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'reset', '--force'], {
  stdio: 'inherit',
  env: process.env,
});
if (result.error) {
  console.error(result.error.message);
}
process.exit(result.status ?? 1);
