const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOTS = [
  path.resolve(__dirname, '..', 'backend', 'src'),
  path.resolve(__dirname, '..', 'frontends', 'shared', 'js'),
  path.resolve(__dirname, '..', 'frontends', 'tgk-wealth'),
  path.resolve(__dirname, '..', 'extensions', 'maestro-tgk', 'src'),
  path.resolve(__dirname, '..', 'scripts')
];

function collectJavaScriptFiles(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') {
      continue;
    }

    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJavaScriptFiles(fullPath));
      continue;
    }

    if (entry.isFile() && fullPath.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

function main() {
  const files = ROOTS.flatMap(collectJavaScriptFiles).sort();
  const failures = [];

  for (const filePath of files) {
    try {
      execFileSync(process.execPath, ['--check', filePath], { stdio: 'pipe' });
      console.log(`ok ${path.relative(path.resolve(__dirname, '..'), filePath)}`);
    } catch (error) {
      failures.push({
        filePath,
        stderr: error.stderr?.toString() || error.message
      });
    }
  }

  if (failures.length === 0) {
    console.log(`Checked ${files.length} JavaScript files.`);
    return;
  }

  for (const failure of failures) {
    console.error(`failed ${path.relative(path.resolve(__dirname, '..'), failure.filePath)}`);
    console.error(failure.stderr.trim());
  }

  process.exit(1);
}

main();
