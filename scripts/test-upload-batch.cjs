// Run the batch parser in an isolated directory with all work commands stubbed.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const source = fs.readFileSync(path.join(__dirname, '..', '一键上传到GitHub.bat'), 'utf8');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-batch-test-'));
const safe = source.split(/\r?\n/).map(line => {
  if (/^for \/f .*git remote/.test(line)) return 'set "ORIGIN_URL=test-repo"';
  if (/^\s*(?:call npm|node |git |del |timeout )/.test(line)) return 'echo [stub] work skipped';
  if (/^\s*pause\s*$/.test(line)) return 'echo [test] pause reached';
  return line;
}).join(source.includes('\r\n') ? '\r\n' : '\n');
fs.writeFileSync(path.join(dir, 'test.bat'), safe);
for (const skip of ['0', '1']) {
  const r = spawnSync('cmd.exe', ['/d', '/c', 'test.bat'], {
    cwd: dir, encoding: 'utf8', windowsHide: true,
    env: { ...process.env, SKIP_BUILD: skip, SKIP_PUSH: '1', FULL_STAGE: '0', GIT_PROXY: '' },
    timeout: 10000,
  });
  console.log(`SKIP_BUILD=${skip}, exit=${r.status}\n${r.stdout}\n${r.stderr}`);
  if (r.status !== 0 || !r.stdout.includes('[test] pause reached') || r.stderr.trim()) process.exitCode = 1;
}
