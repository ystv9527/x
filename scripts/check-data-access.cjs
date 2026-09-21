const fs = require('node:fs');
for (const name of ['contents', 'latest', 'archive']) {
  const file = require('node:path').join(__dirname, '..', 'data', `${name}.json`);
  try {
    const text = fs.readFileSync(file, 'utf8');
    JSON.parse(text);
    const matches = text.match(/"\.\.\/(?:images|videos)\//g) || [];
    const fd = fs.openSync(file, 'r+');
    fs.closeSync(fd);
    console.log(`${name}: readable, valid JSON, writable without truncation; paths to fix=${matches.length}`);
  } catch (error) { console.error(name, error); process.exitCode = 1; }
}
