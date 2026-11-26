// One sign-in per role (…@demo.test, dummy names), added to the CURRENT database without touching anything else.
//   node migrate/demo-users.mjs            dry run: shows the target and which accounts it would add
//   node migrate/demo-users.mjs --apply    adds the missing accounts (existing ones are left alone)
//   node migrate/demo-users.mjs --apply --reset   also resets existing demo accounts to the demo password
// Password: DEMO_PASSWORD, or Demo@12345 when unset. For the full demo world (projects, documents…) on an empty
// database use migrate/demo-data.mjs instead.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';

const here = path.dirname(fileURLToPath(import.meta.url));
// The root .env (what server.js reads) first, then server/.env for anything still unset.
for (const f of [path.join(here, '..', '..', '.env'), path.join(here, '..', '.env')]) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
const APPLY = process.argv.includes('--apply');
const RESET = process.argv.includes('--reset');
const DB_NAME = process.env.MONGODB_DB || 'compliance_tracker';
const PASSWORD = process.env.DEMO_PASSWORD || 'Demo@12345';
if (PASSWORD.length < 8) throw new Error('DEMO_PASSWORD must be at least 8 characters.');
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set in .env or server/.env.');

// [email, name, role, limited to one project?]
const USERS = [
  ['admin@demo.test', 'Asha Admin', 'admin', false],
  ['companyadmin@demo.test', 'Chetan Company Admin', 'company_admin', false],
  ['manager@demo.test', 'Meera Joshi', 'head', false],
  ['depthead@demo.test', 'Dinesh Dept Head', 'dept_head', false],
  ['owner@demo.test', 'Omkar Owner', 'owner', false],
  ['approver@demo.test', 'Aparna Approver', 'approver', false],
  ['pm@demo.test', 'Rohan Kulkarni', 'project_manager', true],
  ['auditor@demo.test', 'Arun Auditor', 'readonly', false]
];

const scrypt = promisify(crypto.scrypt);
async function hashPassword(pw) {   // the same format as server.js
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString('base64')}$${(await scrypt(pw, salt, 64)).toString('base64')}`;
}

const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
await client.connect();
try {
  const db = client.db(DB_NAME);
  const users = db.collection('users');
  const host = (process.env.MONGODB_URI.match(/@([^/?]+)/) || [])[1] || '?';
  console.log(`Target: database "${DB_NAME}" on ${host}.`);

  // The project manager is limited to one project: the demo one if present, else the first project, else none yet.
  const proj = (await db.collection('projects').findOne({ _id: 'proj_demo_skyline' })) || (await db.collection('projects').findOne({}, { sort: { _id: 1 } }));
  const pmProjects = proj ? [String(proj._id)] : [];

  const hash = await hashPassword(PASSWORD);
  const now = new Date().toISOString();
  for (const [email, name, role, limited] of USERS) {
    const exists = await users.findOne({ _id: email });
    const project_ids = limited ? pmProjects : null;
    if (exists && !RESET) { console.log(`  skip   ${email.padEnd(24)} (already exists)`); continue; }
    console.log(`  ${exists ? 'reset ' : 'add   '} ${email.padEnd(24)} ${role}${limited ? ` (only ${project_ids.join(', ') || 'no project yet'})` : ''}`);
    if (!APPLY) continue;
    if (exists) await users.updateOne({ _id: email }, { $set: { name, role, active: true, project_ids, passwordHash: hash }, $inc: { tv: 1 } });
    else await users.insertOne({ _id: email, name, role, active: true, project_ids, passwordHash: hash, tv: 0, created_at: now });
  }
  console.log(APPLY ? `\nDone. Password for the demo accounts: ${PASSWORD}` : '\nDRY RUN: nothing was written. Re-run with --apply.');
} finally {
  await client.close();
}
