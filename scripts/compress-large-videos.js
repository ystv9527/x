const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const VIDEOS_DIR = path.join(ROOT_DIR, 'videos');
const MIB = 1024 * 1024;
const MAX_BYTES = 25 * MIB;
const TARGET_BYTES = 24 * MIB;
const AUDIO_BITRATE_KBPS = 96;
const VIDEO_EXTENSIONS = new Set(['.mp4', '.m4v', '.mov']);
const CHECK_ONLY = process.argv.includes('--check');

function formatMiB(bytes) {
  return `${(bytes / MIB).toFixed(2)} MiB`;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    windowsHide: true,
  });

  if (result.error) {
    throw new Error(`${command} could not be started: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const details = options.capture ? `\n${result.stderr || result.stdout || ''}` : '';
    throw new Error(`${command} exited with code ${result.status}.${details}`);
  }
  return result.stdout;
}

function requireFfmpeg() {
  run('ffmpeg', ['-version'], { capture: true });
  run('ffprobe', ['-version'], { capture: true });
}

function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(fullPath));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

function probeVideo(filePath) {
  const output = run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration:stream=codec_type',
    '-of', 'json',
    filePath,
  ], { capture: true });
  const info = JSON.parse(output);
  const duration = Number(info.format?.duration);
  const hasVideo = info.streams?.some((stream) => stream.codec_type === 'video');
  if (!Number.isFinite(duration) || duration <= 0 || !hasVideo) {
    throw new Error(`Unable to read a valid video stream from ${filePath}`);
  }
  return {
    duration,
    hasAudio: info.streams.some((stream) => stream.codec_type === 'audio'),
  };
}

function removePassFiles(passLogBase) {
  const directory = path.dirname(passLogBase);
  const prefix = path.basename(passLogBase);
  if (!fs.existsSync(directory)) return;
  for (const name of fs.readdirSync(directory)) {
    if (name.startsWith(prefix)) fs.rmSync(path.join(directory, name), { force: true });
  }
}

function replaceSafely(sourcePath, compressedPath) {
  const backupPath = `${sourcePath}.pre-compress-${process.pid}`;
  fs.renameSync(sourcePath, backupPath);
  try {
    fs.renameSync(compressedPath, sourcePath);
    fs.rmSync(backupPath, { force: true });
  } catch (error) {
    if (!fs.existsSync(sourcePath) && fs.existsSync(backupPath)) {
      fs.renameSync(backupPath, sourcePath);
    }
    throw error;
  }
}

function compressVideo(filePath) {
  const relativePath = path.relative(ROOT_DIR, filePath);
  const originalBytes = fs.statSync(filePath).size;
  const { duration, hasAudio } = probeVideo(filePath);
  const audioKbps = hasAudio ? AUDIO_BITRATE_KBPS : 0;
  const totalTargetKbps = Math.floor((TARGET_BYTES * 8) / duration / 1000);
  const videoKbps = Math.max(150, totalTargetKbps - audioKbps - 32);
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath, path.extname(filePath))}.compressing-${process.pid}.mp4`,
  );
  const passLogBase = path.join(os.tmpdir(), `gitpromts-video-${process.pid}-${Date.now()}`);

  console.log(`\n[compress] ${relativePath}`);
  console.log(`           ${formatMiB(originalBytes)} -> target <= ${formatMiB(TARGET_BYTES)}`);
  console.log(`           duration ${duration.toFixed(2)}s, video bitrate ${videoKbps} kbps`);

  try {
    run('ffmpeg', [
      '-y', '-i', filePath,
      '-map', '0:v:0',
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-b:v', `${videoKbps}k`,
      '-pass', '1',
      '-passlogfile', passLogBase,
      '-an', '-f', 'mp4',
      os.platform() === 'win32' ? 'NUL' : '/dev/null',
    ]);

    const secondPassArgs = [
      '-y', '-i', filePath,
      '-map', '0:v:0', '-map', '0:a?',
      '-map_metadata', '0',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      '-preset', 'medium', '-b:v', `${videoKbps}k`,
      '-pass', '2', '-passlogfile', passLogBase,
    ];
    if (hasAudio) secondPassArgs.push('-c:a', 'aac', '-b:a', `${AUDIO_BITRATE_KBPS}k`);
    secondPassArgs.push('-movflags', '+faststart', temporaryPath);
    run('ffmpeg', secondPassArgs);

    const compressedBytes = fs.statSync(temporaryPath).size;
    probeVideo(temporaryPath);
    if (compressedBytes > MAX_BYTES) {
      throw new Error(
        `Compressed file is still ${formatMiB(compressedBytes)}, above ${formatMiB(MAX_BYTES)}.`,
      );
    }
    if (compressedBytes >= originalBytes) {
      throw new Error('Compression did not reduce the file size.');
    }

    replaceSafely(filePath, temporaryPath);
    console.log(`           done: ${formatMiB(compressedBytes)}`);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
    removePassFiles(passLogBase);
  }
}

function main() {
  const oversizedFiles = listFiles(VIDEOS_DIR).filter(
    (filePath) => fs.statSync(filePath).size > MAX_BYTES,
  );

  if (oversizedFiles.length === 0) {
    console.log(`[ok] No files in videos/ exceed ${formatMiB(MAX_BYTES)}.`);
    return;
  }

  console.log(`[info] Found ${oversizedFiles.length} file(s) above ${formatMiB(MAX_BYTES)}.`);
  for (const filePath of oversizedFiles) {
    const extension = path.extname(filePath).toLowerCase();
    if (!VIDEO_EXTENSIONS.has(extension)) {
      throw new Error(
        `${path.relative(ROOT_DIR, filePath)} exceeds the limit but is not a supported video format.`,
      );
    }
    console.log(`       ${path.relative(ROOT_DIR, filePath)} (${formatMiB(fs.statSync(filePath).size)})`);
  }

  if (CHECK_ONLY) {
    process.exitCode = 1;
    return;
  }

  requireFfmpeg();
  for (const filePath of oversizedFiles) compressVideo(filePath);
  console.log(`\n[ok] All files in videos/ are within ${formatMiB(MAX_BYTES)}.`);
}

try {
  main();
} catch (error) {
  console.error(`\n[error] Video compression failed: ${error.message}`);
  process.exitCode = 1;
}
