import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const ROOT_DIR = process.cwd();
const COURSE_FILES_BUCKET = 'course-files';
const POLL_INTERVAL_MS = 60_000;
const ONCE = process.argv.includes('--once');
const FORCE = process.argv.includes('--force');

function parseEnvFile(content) {
  const env = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

async function loadEnvFromDisk() {
  const candidates = [
    path.join(ROOT_DIR, '.env.local'),
    path.join(ROOT_DIR, '.env'),
    path.join(ROOT_DIR, '.env.vercel.pulled'),
  ];

  for (const filePath of candidates) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      Object.assign(process.env, parseEnvFile(content), process.env);
    } catch {
      // Ignore missing env files.
    }
  }
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sortBySlideNumber(fileNames) {
  return [...fileNames].sort((a, b) => {
    const aMatch = a.match(/(\d+)/);
    const bMatch = b.match(/(\d+)/);
    const aNum = aMatch ? Number(aMatch[1]) : 0;
    const bNum = bMatch ? Number(bMatch[1]) : 0;
    if (aNum !== bNum) return aNum - bNum;
    return a.localeCompare(b);
  });
}

function sanitizeStorageSegment(value) {
  const cleaned = value
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return cleaned || 'slide';
}

function needsConversion(item) {
  if (FORCE) return true;
  const thumbnails = Array.isArray(item.thumbnails) ? item.thumbnails : [];
  const slideCount = typeof item.slide_count === 'number' ? item.slide_count : null;
  if (thumbnails.length === 0) return true;
  if (slideCount == null) return true;
  if (slideCount > thumbnails.length) return true;
  if (slideCount > 1 && thumbnails.length <= 1) return true;
  return false;
}

async function exportSlidesWithPowerPoint(inputPath, outputDir) {
  await fs.mkdir(outputDir, { recursive: true });

  return new Promise((resolve, reject) => {
    const scriptPath = path.join(ROOT_DIR, 'scripts', 'export-powerpoint-slides.ps1');
    const child = spawn('powershell', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
      '-InputPath', inputPath,
      '-OutputDir', outputDir,
      '-Width', '1600',
      '-Height', '900',
    ], {
      cwd: ROOT_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });

    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(`PowerPoint export failed (${code}): ${stderr || stdout}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function uploadSlideImages(supabaseAdmin, lessonId, contentId, dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const imageFiles = sortBySlideNumber(
    entries
      .filter(entry => entry.isFile() && /\.(png|jpe?g)$/i.test(entry.name))
      .map(entry => entry.name),
  );

  if (imageFiles.length === 0) {
    throw new Error('PowerPoint export produced zero images');
  }

  const urls = [];
  for (const fileName of imageFiles) {
    const filePath = path.join(dirPath, fileName);
    const buffer = await fs.readFile(filePath);
    const ext = path.extname(fileName).toLowerCase() || '.png';
    const contentType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
    const safeName = sanitizeStorageSegment(fileName);
    const storageKey = `thumbnails/${lessonId}/${contentId}/${Date.now()}-${safeName}`;

    const { error } = await supabaseAdmin.storage
      .from(COURSE_FILES_BUCKET)
      .upload(storageKey, buffer, {
        contentType,
        upsert: true,
      });

    if (error) {
      throw new Error(`Thumbnail upload failed: ${error.message}`);
    }

    const { data } = supabaseAdmin.storage
      .from(COURSE_FILES_BUCKET)
      .getPublicUrl(storageKey);

    urls.push(data.publicUrl);
  }

  return urls;
}

async function processItem(supabaseAdmin, item) {
  console.log(`[slides-worker] converting ${item.title} (${item.id})`);

  const { data, error } = await supabaseAdmin.storage
    .from(COURSE_FILES_BUCKET)
    .download(item.file_key);

  if (error || !data) {
    throw new Error(`Failed to download source presentation: ${error?.message ?? 'unknown error'}`);
  }

  const tempBase = await fs.mkdtemp(path.join(os.tmpdir(), 'crm-ppt-'));
  const sourceExt = path.extname(item.file_key) || '.pptx';
  const sourcePath = path.join(tempBase, `source${sourceExt}`);
  const outputDir = path.join(tempBase, 'slides');

  try {
    const arrayBuffer = await data.arrayBuffer();
    await fs.writeFile(sourcePath, Buffer.from(arrayBuffer));

    await exportSlidesWithPowerPoint(sourcePath, outputDir);
    const thumbnails = await uploadSlideImages(supabaseAdmin, item.lesson_id, item.id, outputDir);

    const { error: updateError } = await supabaseAdmin
      .from('content_items')
      .update({
        thumbnails,
        slide_count: thumbnails.length,
      })
      .eq('id', item.id);

    if (updateError) {
      throw new Error(`Failed to update content_items row: ${updateError.message}`);
    }

    console.log(`[slides-worker] updated ${item.id} with ${thumbnails.length} slide images`);
  } finally {
    await fs.rm(tempBase, { recursive: true, force: true });
  }
}

async function runPass(supabaseAdmin) {
  const { data, error } = await supabaseAdmin
    .from('content_items')
    .select('id, lesson_id, title, file_key, thumbnails, slide_count, type')
    .eq('type', 'pptx')
    .not('file_key', 'is', null)
    .order('order', { ascending: true });

  if (error) {
    throw new Error(`Failed to query content_items: ${error.message}`);
  }

  const items = (data ?? []).filter(needsConversion);
  if (items.length === 0) {
    console.log('[slides-worker] no presentations need conversion right now');
    return;
  }

  for (const item of items) {
    try {
      await processItem(supabaseAdmin, item);
    } catch (error) {
      console.error(`[slides-worker] failed for ${item.id}:`, error);
    }
  }
}

async function main() {
  await loadEnvFromDisk();

  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  console.log('[slides-worker] started');
  do {
    await runPass(supabaseAdmin);
    if (!ONCE) {
      await sleep(POLL_INTERVAL_MS);
    }
  } while (!ONCE);
}

main().catch(error => {
  console.error('[slides-worker] fatal error:', error);
  process.exitCode = 1;
});
