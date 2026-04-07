#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const STYLE_DIR = path.join(FRONTEND_DIR, 'shared', 'styles');
const SOURCE_EXTENSIONS = new Set(['.html', '.js']);
const STYLE_EXTENSIONS = new Set(['.css']);
const IGNORED_SOURCE_DIRS = new Set(['node_modules']);
const ATTR_RE = /(?<![\w-])(?::class|x-bind:class|class)\s*=\s*(['"])(.*?)\1/gs;

function walk(dir, extensions, ignoredDirs = new Set()) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        results.push(...walk(path.join(dir, entry.name), extensions, ignoredDirs));
      }
      continue;
    }

    if (extensions.has(path.extname(entry.name))) {
      results.push(path.join(dir, entry.name));
    }
  }
  return results;
}

function collectDefinedClasses(css) {
  const classes = new Set();

  for (let i = 0; i < css.length; i += 1) {
    if (css[i] !== '.') continue;

    let token = '';
    let escaped = false;

    for (let j = i + 1; j < css.length; j += 1) {
      const ch = css[j];

      if (escaped) {
        token += ch;
        escaped = false;
        continue;
      }

      if (ch === '\\') {
        escaped = true;
        continue;
      }

      if (/[A-Za-z0-9_-]/.test(ch)) {
        token += ch;
        continue;
      }

      break;
    }

    if (token) {
      classes.add(token);
    }
  }

  return classes;
}

function collectUsedClasses(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const classes = [];

  for (const match of source.matchAll(ATTR_RE)) {
    const fullMatch = match[0];
    const value = match[2];
    const isStaticClassAttr = /^class\s*=/.test(fullMatch);

    if (isStaticClassAttr) {
      for (const token of value.split(/\s+/).filter(Boolean)) {
        classes.push(token);
      }
      continue;
    }

    for (const literal of value.matchAll(/['"]([^'"]+)['"]/g)) {
      for (const token of literal[1].split(/\s+/).filter(Boolean)) {
        if (looksLikeDynamicClassToken(token)) {
          classes.push(token);
        }
      }
    }
  }

  return classes;
}

function classify(token) {
  if (token.startsWith('tgk-')) return 'semantic';
  if (/[:\[\]]/.test(token)) return 'utility-variant';
  return 'utility';
}

function looksLikeDynamicClassToken(token) {
  if (!token || token.endsWith('--')) return false;
  return token.startsWith('tgk-') || /[-:/[\]]/.test(token);
}

function main() {
  const strict = process.argv.includes('--strict');
  const json = process.argv.includes('--json');

  const styleFiles = walk(STYLE_DIR, STYLE_EXTENSIONS);
  const sourceFiles = walk(FRONTEND_DIR, SOURCE_EXTENSIONS, IGNORED_SOURCE_DIRS);

  const definedClasses = new Set();
  for (const file of styleFiles) {
    const css = fs.readFileSync(file, 'utf8');
    for (const token of collectDefinedClasses(css)) {
      definedClasses.add(token);
    }
  }

  const usages = new Map();
  for (const file of sourceFiles) {
    const relativeFile = path.relative(ROOT, file);
    for (const token of collectUsedClasses(file)) {
      if (!usages.has(token)) usages.set(token, new Set());
      usages.get(token).add(relativeFile);
    }
  }

  const missing = [...usages.entries()]
    .filter(([token]) => !definedClasses.has(token))
    .map(([token, files]) => ({
      token,
      kind: classify(token),
      files: [...files].sort()
    }))
    .sort((left, right) => left.token.localeCompare(right.token));

  const summary = {
    sourceFilesScanned: sourceFiles.length,
    styleFilesScanned: styleFiles.length,
    definedClasses: definedClasses.size,
    staticClassesUsed: usages.size,
    missingClasses: missing.length
  };

  if (json) {
    console.log(JSON.stringify({ summary, missing }, null, 2));
  } else {
    console.log('Class report');
    console.log(`- source files scanned: ${summary.sourceFilesScanned}`);
    console.log(`- style files scanned: ${summary.styleFilesScanned}`);
    console.log(`- CSS class definitions: ${summary.definedClasses}`);
    console.log(`- static classes used: ${summary.staticClassesUsed}`);
    console.log(`- missing static classes: ${summary.missingClasses}`);

    if (missing.length > 0) {
      console.log('\nMissing classes');
      for (const entry of missing) {
        console.log(`- ${entry.token} [${entry.kind}]`);
        for (const file of entry.files) {
          console.log(`  ${file}`);
        }
      }
    }
  }

  if (strict && missing.length > 0) {
    process.exitCode = 1;
  }
}

main();
