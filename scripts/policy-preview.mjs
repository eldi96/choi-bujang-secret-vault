import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, lstat, appendFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const names = ['decider.mjs', 'allowed-routes.json', 'db-policy.json'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function regular(path) {
  if (!(await lstat(path)).isFile()) throw new Error('정상 파일 사본이 아닙니다.');
  return readFile(path);
}
async function verified(dir, trustedHash) {
  if (!/^[a-f0-9]{64}$/.test(trustedHash ?? '')) throw new Error('별도 보관한 manifest 해시가 필요합니다.');
  const bytes = await regular(join(dir, 'manifest.json'));
  if (digest(bytes) !== trustedHash) throw new Error('manifest 해시 불일치. 중단합니다.');
  const manifest = JSON.parse(bytes);
  if (manifest.schema !== 'byteback.policy.snapshot.v1'
      || Object.keys(manifest.files).sort().join() !== [...names].sort().join()) {
    throw new Error('사본 범위가 올바르지 않습니다.');
  }
  const files = {};
  for (const name of names) {
    const file = await regular(join(dir, name));
    if (digest(file) !== manifest.files[name]) throw new Error(name + ' 해시 불일치. 중단합니다.');
    files[name] = file;
  }
  return { manifest, files };
}
async function freshDir(path) {
  // 모든 출력은 운영 파일과 분리된 artifacts 아래의 새 폴더로 제한합니다.
  if (!/^[a-zA-Z0-9_-]+$/.test(path ?? '')) throw new Error('새 사본 이름이 필요합니다.');
  const parent = join(root, 'artifacts', 'policy-snapshots');
  await mkdir(parent, { recursive: true });
  if (!(await lstat(parent)).isDirectory() || (await lstat(parent)).isSymbolicLink()) throw new Error('사본 경로 오류');
  const dir = join(parent, path);
  await mkdir(dir); // 기존 사본은 덮어쓰지 않습니다.
  return dir;
}

export async function main(args) {
  const [command, name, arg, hash, confirmation] = args;
  if (command === 'snapshot') {
    const db = JSON.parse(await regular(resolve(arg ?? '')));
    if (db.source !== 'supabase_execute_sql_read_only' || !db.capturedAt
        || db.policy?.table !== 'public.vault_notes' || !db.policy?.rls
        || !Array.isArray(db.policy.policies) || !Array.isArray(db.policy.grants)
        || !Array.isArray(db.policy.effectivePrivileges)) throw new Error('실제 DB 정책 조회 사본이 필요합니다.');
    const config = JSON.parse(await readFile(join(root, 'aleph.config.json')));
    if (new URL(config.originalApiUrl).hostname !== db.policy.projectRef + '.supabase.co') throw new Error('DB 프로젝트 불일치');
    const files = {
      'decider.mjs': await readFile(join(root, 'src/decider.mjs')),
      'allowed-routes.json': Buffer.from(JSON.stringify(config.allowedRoutes, null, 2) + '\n'),
      'db-policy.json': Buffer.from(JSON.stringify(db, null, 2) + '\n'),
    };
    const manifest = { schema: 'byteback.policy.snapshot.v1',
      commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
      capturedAt: new Date().toISOString(), step: config.step,
      files: Object.fromEntries(names.map(n => [n, digest(files[n])])) };
    const dir = await freshDir(name);
    for (const n of names) await writeFile(join(dir, n), files[n], { flag: 'wx', mode: 0o600 });
    const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
    await writeFile(join(dir, 'manifest.json'), bytes, { flag: 'wx', mode: 0o600 });
    console.log('사본:', dir, '\n별도 보관할 manifest SHA-256:', digest(bytes));
    return;
  }
  const dir = join(root, 'artifacts', 'policy-snapshots', name ?? '');
  if (!/^[a-zA-Z0-9_-]+$/.test(name ?? '')) throw new Error('사본 이름 오류');
  const backup = await verified(dir, hash);
  if (command === 'trial') {
    const trial = await freshDir(arg);
    const before = 'const registered = request.deviceRegistered === true;';
    const source = backup.files['decider.mjs'].toString();
    if (source.split(before).length !== 2) throw new Error('시험 변경 대상 한 줄을 찾지 못했습니다.');
    for (const n of names) await writeFile(join(trial, n), n === 'decider.mjs'
      ? source.replace(before, 'const registered = true; // 시험 사본에서만 등록 검사 훼손')
      : backup.files[n], { flag: 'wx', mode: 0o600 });
    console.log('시험 사본 생성. 운영 변경 없음:', trial);
  } else if (command === 'restore-plan' || command === 'restore') {
    if (!/^[a-zA-Z0-9_-]+$/.test(arg ?? '') || arg === name) throw new Error('별도 시험 사본이 필요합니다.');
    const trialDir = join(root, 'artifacts', 'policy-snapshots', arg);
    if (!(await lstat(trialDir)).isDirectory() || (await lstat(trialDir)).isSymbolicLink()) throw new Error('시험 경로 오류');
    const path = join(trialDir, 'decider.mjs');
    const current = await regular(path);
    const damaged = 'const registered = true; // 시험 사본에서만 등록 검사 훼손';
    const safe = 'const registered = request.deviceRegistered === true;';
    if (backup.files['decider.mjs'].toString().split(safe).length !== 2
        || current.toString().split(damaged).length !== 2) throw new Error('지정한 시험 변경 한 줄을 확인할 수 없습니다.');
    // 파일 전체를 덮어쓰지 않고 지정한 한 줄만 복원합니다.
    const restored = Buffer.from(current.toString().replace(damaged, safe));
    const plan = { version: backup.manifest.commit, backupHash: hash, trial: arg,
      target: 'decider.mjs', beforeHash: digest(current), afterHash: digest(restored),
      changes: [{ from: damaged, to: safe }],
      preserved: ['다른 판정 규칙', 'allowed-routes.json', 'db-policy.json', '기존 감사 이력', '운영 파일·DB'] };
    const planHash = digest(JSON.stringify(plan));
    if (command === 'restore-plan') {
      console.log(JSON.stringify({ mode: 'restore_preview_only', ...plan, confirmationHash: planHash }, null, 2));
      return;
    }
    if (confirmation !== planHash) throw new Error('복원 미리보기 확인 해시 불일치. 변경하지 않습니다.');
    if (digest(await regular(path)) !== plan.beforeHash) throw new Error('미리보기 이후 시험 정책 변경. 중단합니다.');
    const audit = join(trialDir, 'restore-audit.jsonl');
    try { await regular(audit); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const record = status => JSON.stringify({ at: new Date().toISOString(), status,
      version: plan.version, target: plan.target, beforeHash: plan.beforeHash,
      afterHash: plan.afterHash, confirmationHash: planHash }) + '\n';
    await appendFile(audit, record('started'), { mode: 0o600 });
    await writeFile(path, restored, { flag: 'w', mode: 0o600 });
    if (digest(await regular(path)) !== plan.afterHash) throw new Error('복원 후 해시 불일치');
    await appendFile(audit, record('verified'));
    console.log('시험 정책 한 줄 복원·해시 검증 완료. 운영 정책 변경 없음.');
  } else if (command === 'preview') {
    if (!/^[a-zA-Z0-9_-]+$/.test(arg ?? '')) throw new Error('시험 사본 이름 오류');
    // 출력 전에 전체 기준 사본과 시험 파일을 모두 읽고 확인합니다.
    const changes = [];
    for (const n of names) {
      const current = await regular(join(root, 'artifacts', 'policy-snapshots', arg, n));
      if (digest(current) === backup.manifest.files[n]) continue;
      const before = backup.files[n].toString().split('\n');
      const after = current.toString().split('\n');
      changes.push({ file: n, lines: Array.from({ length: Math.max(before.length, after.length) }, (_, i) => i)
        .filter(i => before[i] !== after[i]).map(i => ({ line: i + 1, verified: before[i] ?? null, trial: after[i] ?? null })) });
    }
    console.log(JSON.stringify({ mode: 'preview_only_no_restore', version: backup.manifest.commit,
      capturedAt: backup.manifest.capturedAt, step: backup.manifest.step, changes }, null, 2));
  } else throw new Error('snapshot / trial / preview / restore-plan / restore만 지원합니다.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error('정책 사본 작업 중단:', error.code ?? error.message); process.exitCode = 1; });
}
