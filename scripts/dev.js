const { spawn } = require('node:child_process');
const path = require('node:path');
const readline = require('node:readline');

const rootDir = path.resolve(__dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const processes = [
  {
    name: 'backend',
    cwd: path.join(rootDir, 'backend'),
    args: ['run', 'dev']
  },
  {
    name: 'frontend',
    cwd: path.join(rootDir, 'frontend'),
    args: ['start']
  }
];

const children = new Set();
let shuttingDown = false;

function pipeLines(name, input, output) {
  const reader = readline.createInterface({ input });
  reader.on('line', (line) => {
    output.write(`[${name}] ${line}\n`);
  });
  return reader;
}

function stopChildren(signal) {
  children.forEach((child) => {
    if (!child.killed) {
      child.kill(signal);
    }
  });
}

function shutdown(exitCode) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  stopChildren('SIGTERM');

  setTimeout(() => {
    stopChildren('SIGKILL');
  }, 1500).unref();

  setTimeout(() => {
    process.exit(exitCode);
  }, 1600).unref();
}

processes.forEach((proc) => {
  const child = spawn(npmCommand, proc.args, {
    cwd: proc.cwd,
    stdio: ['inherit', 'pipe', 'pipe']
  });

  children.add(child);
  pipeLines(proc.name, child.stdout, process.stdout);
  pipeLines(proc.name, child.stderr, process.stderr);

  child.on('exit', (code, signal) => {
    children.delete(child);

    if (shuttingDown) {
      if (children.size === 0) {
        process.exit(code ?? 0);
      }
      return;
    }

    if (signal) {
      process.stderr.write(`[${proc.name}] exited from signal ${signal}\n`);
      shutdown(1);
      return;
    }

    if (code !== 0) {
      process.stderr.write(`[${proc.name}] exited with code ${code}\n`);
      shutdown(code || 1);
      return;
    }

    process.stdout.write(`[${proc.name}] exited cleanly\n`);
    shutdown(0);
  });
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
