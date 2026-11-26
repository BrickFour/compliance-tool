// Fresh set-up for a new client database.
//   node migrate/init-db.mjs            dry run: shows the database name and which collections are missing
//   node migrate/init-db.mjs --apply    creates the database (named by MONGODB_DB in the root .env), every collection the app uses,
//                                       all indexes, default health settings and the starting regulatory sources.
// Adds only. Existing collections, documents and settings are never changed or deleted. Safe to re-run.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';
import { seedSources, ensureIndexes as ensureRegulatoryIndexes } from '../regulatory-routes.mjs';
import { DEFAULT_HEALTH } from '../health.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(here, '..', '..', '.env'));
const APPLY = process.argv.includes('--apply');
const DB_NAME = process.env.MONGODB_DB;
if (!process.env.MONGODB_URI) { console.error('MONGODB_URI is missing in the root .env'); process.exit(1); }
if (!DB_NAME) { console.error('MONGODB_DB is missing in the root .env'); process.exit(1); }

const COLLECTIONS = [
  // core data
  'users', 'companies', 'projects', 'phases', 'buildings', 'applicability', 'tracking', 'documents', 'audit',
  'stage_overrides', 'risk_overrides', 'settings', 'notifications', 'chat_logs',
  // compliance intelligence
  'health_snapshots', 'ai_recommendations', 'ai_analyses',
  // regulatory updates
  'regulatory_sources', 'regulatory_updates', 'regulatory_runs',
  // document studio
  'doc_templates', 'doc_generated', 'doc_analyses',
  // GridFS file store (bucket "uploads")
  'uploads.files', 'uploads.chunks'
];

const INDEXES = {
  audit: [{ key: { key: 1, at: -1 } }],
  documents: [{ key: { key: 1, uploaded_at: -1 } }],
  notifications: [{ key: { at: -1 } }],
  chat_logs: [{ key: { at: -1 } }],
  ai_recommendations: [{ key: { scope_id: 1, status: 1 } }, { key: { dedupe_key: 1 } }, { key: { priority: 1, updated_at: -1 } }],
  health_snapshots: [{ key: { scope_id: 1, date: -1 } }],
  ai_analyses: [{ key: { project_id: 1, analysed_at: -1 } }],
  doc_generated: [{ key: { updated_at: -1 } }],
  doc_analyses: [{ key: { created_at: -1 } }],
  doc_templates: [{ key: { created_at: -1 } }],
  'uploads.files': [{ key: { filename: 1, uploadDate: 1 } }],
  'uploads.chunks': [{ key: { files_id: 1, n: 1 }, unique: true }]
};

const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15_000 });
await client.connect();
const db = client.db(DB_NAME);
try {
  const have = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  const missing = COLLECTIONS.filter((c) => !have.has(c));
  console.log(`Database: "${DB_NAME}"`);
  console.log(`Collections already present: ${COLLECTIONS.length - missing.length}/${COLLECTIONS.length}`);
  console.log(`To create: ${missing.join(', ') || 'none'}`);
  if (!APPLY) { console.log('\nDRY RUN: nothing was written. Re-run with --apply.'); process.exit(0); }

  for (const name of missing) await db.createCollection(name);
  for (const [name, specs] of Object.entries(INDEXES)) await db.collection(name).createIndexes(specs);
  await ensureRegulatoryIndexes(db);

  const now = new Date().toISOString();
  const health = await db.collection('settings').updateOne(
    { _id: 'health' }, { $setOnInsert: { ...DEFAULT_HEALTH, updated_by: 'init-db', updated_at: now } }, { upsert: true });
  const sources = await seedSources(db);

  const after = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).sort();
  console.log(`\nApplied. ${missing.length} collection(s) created, indexes ensured, health settings ${health.upsertedCount ? 'saved' : 'already present'}, ${sources} regulatory source(s) added.`);
  console.log(`Collections in "${DB_NAME}" (${after.length}): ${after.join(', ')}`);
  console.log('Start the server and sign in with ADMIN_EMAIL / ADMIN_PASSWORD: the first admin is created on first start.');
} finally { await client.close(); }
