#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const STYLE_DIR = path.join(FRONTEND_DIR, 'shared', 'styles');
const UTILITIES_FILE = path.join(STYLE_DIR, 'tgk-utilities.css');
const SOURCE_EXTENSIONS = new Set(['.html', '.js']);
const STYLE_EXTENSIONS = new Set(['.css']);
const IGNORED_SOURCE_DIRS = new Set(['node_modules']);
const ATTR_RE = /(?<![\w-])(?::class|x-bind:class|class)\s*=\s*(['"])(.*?)\1/gs;
const QUOTED_JS_STRING_RE = /(['"])((?:\\.|(?!\1)[^\\])*)\1/g;
const SELECTOR_RE = /([^{}]+)\{/g;
const CLASS_SELECTOR_RE = /\.((?:\\.|[A-Za-z0-9_-])+)/g;

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

function normalizeClassToken(token) {
  return token.replace(/\\/g, '');
}

function collectDefinedClasses(css) {
  const classes = new Set();
  const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

  for (const match of cssWithoutComments.matchAll(SELECTOR_RE)) {
    const selectorBlock = match[1].trim();
    if (!selectorBlock || selectorBlock.startsWith('@')) continue;

    for (const classMatch of selectorBlock.matchAll(CLASS_SELECTOR_RE)) {
      classes.add(normalizeClassToken(classMatch[1]));
    }
  }

  return classes;
}

function collectStaticAttrClasses(source) {
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
        if (looksLikeClassToken(token)) {
          classes.push(token);
        }
      }
    }
  }

  return classes;
}

function collectJsStringClasses(source, definedClasses) {
  const classes = [];

  for (const match of source.matchAll(QUOTED_JS_STRING_RE)) {
    const literal = match[2];
    for (const token of literal.split(/\s+/).filter(Boolean)) {
      if (definedClasses.has(token)) {
        classes.push(token);
      }
    }
  }

  return classes;
}

function classify(token) {
  if (token.startsWith('tgk-')) return 'semantic';
  if (/[:\[\]/]/.test(token)) return 'utility-variant';
  return 'utility';
}

function looksLikeClassToken(token) {
  return Boolean(token) && !token.endsWith('--') && (token.startsWith('tgk-') || /[-:/[\]]/.test(token));
}

function relativeFile(filePath) {
  return path.relative(ROOT, filePath);
}

function addUsage(map, token, filePath) {
  if (!map.has(token)) {
    map.set(token, new Set());
  }
  map.get(token).add(relativeFile(filePath));
}

function main() {
  const strict = process.argv.includes('--strict');
  const json = process.argv.includes('--json');
  const showUnused = process.argv.includes('--unused');

  const styleFiles = walk(STYLE_DIR, STYLE_EXTENSIONS);
  const sourceFiles = walk(FRONTEND_DIR, SOURCE_EXTENSIONS, IGNORED_SOURCE_DIRS);

  const definedClasses = new Set();
  const utilityClasses = new Set();

  for (const file of styleFiles) {
    const css = fs.readFileSync(file, 'utf8');
    const classes = collectDefinedClasses(css);
    for (const token of classes) {
      definedClasses.add(token);
      if (file === UTILITIES_FILE) {
        utilityClasses.add(token);
      }
    }
  }

  const staticUsages = new Map();
  const utilityUsages = new Map();

  for (const file of sourceFiles) {
    const source = fs.readFileSync(file, 'utf8');

    for (const token of collectStaticAttrClasses(source)) {
      addUsage(staticUsages, token, file);
      if (utilityClasses.has(token)) {
        addUsage(utilityUsages, token, file);
      }
    }

    if (path.extname(file) === '.js') {
      for (const token of collectJsStringClasses(source, utilityClasses)) {
        addUsage(utilityUsages, token, file);
      }
    }
  }

  const missing = [...staticUsages.entries()]
    .filter(([token]) => !definedClasses.has(token))
    .map(([token, files]) => ({
      token,
      kind: classify(token),
      files: [...files].sort()
    }))
    .sort((left, right) => left.token.localeCompare(right.token));

  const unusedUtilities = [...utilityClasses]
    .filter((token) => !utilityUsages.has(token))
    .sort((left, right) => left.localeCompare(right));

  const summary = {
    sourceFilesScanned: sourceFiles.length,
    styleFilesScanned: styleFiles.length,
    definedClasses: definedClasses.size,
    utilityDefinitions: utilityClasses.size,
    staticClassesUsed: staticUsages.size,
    utilityClassesUsed: utilityUsages.size,
    missingClasses: missing.length,
    unusedUtilities: unusedUtilities.length
  };

  if (json) {
    console.log(JSON.stringify({ summary, missing, unusedUtilities }, null, 2));
  } else {
    console.log('Class report');
    console.log(`- source files scanned: ${summary.sourceFilesScanned}`);
    console.log(`- style files scanned: ${summary.styleFilesScanned}`);
    console.log(`- CSS class definitions: ${summary.definedClasses}`);
    console.log(`- utility class definitions: ${summary.utilityDefinitions}`);
    console.log(`- static classes used: ${summary.staticClassesUsed}`);
    console.log(`- utility classes used: ${summary.utilityClassesUsed}`);
    console.log(`- missing static classes: ${summary.missingClasses}`);
    console.log(`- unused utility classes: ${summary.unusedUtilities}`);

    if (missing.length > 0) {
      console.log('\nMissing classes');
      for (const entry of missing) {
        console.log(`- ${entry.token} [${entry.kind}]`);
        for (const file of entry.files) {
          console.log(`  ${file}`);
        }
      }
    }

    if (showUnused && unusedUtilities.length > 0) {
      console.log('\nUnused utility classes');
      for (const token of unusedUtilities) {
        console.log(`- ${token}`);
      }
    }
  }

  if (strict && missing.length > 0) {
    process.exitCode = 1;
  }
}

main();
