import { canSyncScopedData, createScopedStorage } from './localDataScopeLogic';

void (async () => {
  const values = new Map<string, string>();
  let uid: string | null = 'A';
  values.set('laufbuddy_run_history_v1', 'legacy-runs');
  const storage = createScopedStorage({
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async (key) => { values.delete(key); },
  }, () => uid);

  if (await storage.getItem('runs') !== null) throw new Error('legacy runs were assigned to A');
  await storage.setItem('runs', 'A-runs');
  await storage.setItem('shoes', 'A-shoes');
  await storage.setItem('body', 'A-body');
  const writeForA = storage.forUid(uid).setItem('runs', 'A-runs-delayed');
  uid = null;
  if (await storage.getItem('runs') !== null) throw new Error('logout leaked data');
  uid = 'B';
  await writeForA;
  if (await storage.getItem('runs') !== null) throw new Error('B received A data');
  await storage.setItem('runs', 'B-runs');
  if (canSyncScopedData('A', 'B', 'B')) throw new Error('A data could sync under B');
  if (canSyncScopedData('A', null, null)) throw new Error('logout allowed upload');
  if (!canSyncScopedData('B', 'B', 'B')) throw new Error('B scope cannot upload its own data');
  uid = 'A';
  if (await storage.getItem('runs') !== 'A-runs-delayed') throw new Error('A data not restored');
  if (await storage.getItem('shoes') !== 'A-shoes') throw new Error('A shoes not restored');
  if (await storage.getItem('body') !== 'A-body') throw new Error('A body not restored');
  if (values.get('laufbuddy_run_history_v1') !== 'legacy-runs') {
    throw new Error('legacy data was changed');
  }
})().catch((error) => { throw error; });
