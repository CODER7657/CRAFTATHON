/**
 * Run from frontend/: node scripts/verify-auth-env.mjs
 * Confirms .env.local has the variables Next needs for /login (without starting the dev server).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scryptSync } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env.local');

function loadDotEnvLocal() {
  if (!existsSync(envPath)) {
    console.error('Missing', envPath);
    process.exit(1);
  }
  const text = readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

function main() {
  loadDotEnvLocal();
  const email = process.env.AUTH_USER_1_EMAIL?.trim();
  const hash =
    process.env.AUTH_USER_1_PASSWORD_HASH?.trim() || process.env.AUTH_USER_1_HASH?.trim();
  const apiKey =
    process.env.AUTH_USER_1_AUTHORITY_API_KEY?.trim() || process.env.AUTH_USER_1_API_KEY?.trim();
  const secret = process.env.AUTH_SESSION_SECRET?.trim();
  const name = process.env.AUTH_USER_1_NAME?.trim();
  const jurisdiction = process.env.AUTH_USER_1_JURISDICTION?.trim();

  console.log('AUTH_SESSION_SECRET:', secret ? `set (${secret.length} chars)` : 'MISSING');
  console.log('AUTH_USER_1_EMAIL:', email || 'MISSING');
  console.log('AUTH_USER_1_NAME:', name || 'MISSING');
  console.log('AUTH_USER_1_JURISDICTION:', jurisdiction || 'MISSING');
  console.log('API key var:', process.env.AUTH_USER_1_AUTHORITY_API_KEY ? 'AUTHORITY_API_KEY' : process.env.AUTH_USER_1_API_KEY ? 'API_KEY (legacy)' : 'MISSING');
  console.log('Password hash var:', process.env.AUTH_USER_1_PASSWORD_HASH ? 'PASSWORD_HASH' : process.env.AUTH_USER_1_HASH ? 'HASH (legacy)' : 'MISSING');

  if (!email || !hash || !apiKey || !name || !jurisdiction || !secret) {
    console.error('\nSome required vars are missing — Next.js will not load any authority user.');
    process.exit(1);
  }

  const colon = hash.indexOf(':');
  const salt = colon > 0 ? hash.slice(0, colon) : '';
  const digest = colon > 0 ? hash.slice(colon + 1) : '';
  const hexOk = /^[0-9a-f]+$/i.test(digest);
  console.log('\nHash format: salt length', salt.length, 'digest hex length', digest.length, 'hex?', hexOk);
  if (!hexOk || digest.length !== 128) {
    console.error(
      'Digest must be 128 hex chars (scrypt 64 bytes). If you see plain text after ":", regenerate with:',
    );
    console.error(
      `  node -e "const {randomBytes,scryptSync}=require('crypto');const s=randomBytes(16).toString('hex');const p='YOUR_PASSWORD';console.log(s+':'+scryptSync(p,s,64).toString('hex'))"`,
    );
    process.exit(1);
  }

  const testPass = process.argv[2];
  if (testPass) {
    const derived = scryptSync(testPass, salt, 64).toString('hex');
    console.log('\nPassword check for argv[2]:', derived === digest ? 'MATCH' : 'NO MATCH');
  } else {
    console.log('\nOptional: node scripts/verify-auth-env.mjs "YourPassword" to test the hash.');
  }
}

main();
