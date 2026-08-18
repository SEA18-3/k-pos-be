import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ignored = new Set(['.git', 'coverage', 'dist', 'node_modules', 'artifacts']);
const markdownFiles = findMarkdownFiles('.');
const missing = [];
let checked = 0;

for (const file of markdownFiles) {
  const source = readFileSync(file, 'utf8');
  const targets = [
    ...matches(source, /!?\[[^\]]*\]\(([^)]+)\)/g),
    ...matches(source, /(?:href|src)="([^"]+)"/g),
  ];
  for (const rawTarget of targets) {
    const target =
      rawTarget
        .trim()
        .replace(/^<|>$/g, '')
        .split(/\s+["']/u, 1)[0] ?? '';
    if (!target || /^(?:#|https?:\/\/|mailto:|data:)/u.test(target)) continue;
    checked += 1;
    const localPath = resolve(dirname(file), decodeURIComponent(target.split(/[?#]/u, 1)[0] ?? ''));
    if (!existsSync(localPath)) missing.push(`${file} -> ${rawTarget}`);
  }
}

if (missing.length > 0) {
  console.error(`Found ${missing.length} broken local Markdown link(s):`);
  for (const link of missing) console.error(`- ${link}`);
  process.exitCode = 1;
} else {
  console.log(`Checked ${checked} local Markdown links across ${markdownFiles.length} files.`);
}

function matches(source, pattern) {
  return [...source.matchAll(pattern)].map((match) => match[1]).filter(Boolean);
}

function findMarkdownFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...findMarkdownFiles(path));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(relative('.', path));
  }
  return files;
}
