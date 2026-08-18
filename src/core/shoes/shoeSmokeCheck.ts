import type { Run } from '../runs/runTypes';
import { useShoeStore } from '../../state/shoeStore';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function resetShoeStore(): void {
  useShoeStore.setState({ shoes: [] });
}

function createCompletedRun(params: {
  id: string;
  distanceKm: number;
  shoeId: string;
}): Run {
  return {
    id: params.id,
    startedAt: '2026-03-26T11:00:00.000Z',
    finishedAt: '2026-03-26T12:00:00.000Z',
    distanceKm: params.distanceKm,
    shoeId: params.shoeId,
    isCompleted: true,
  };
}

export interface ShoeSmokeCheckScenarioResult {
  name: string;
  passed: true;
  details: Record<string, unknown>;
}

export interface ShoeSmokeCheckReport {
  passed: true;
  scenarios: ShoeSmokeCheckScenarioResult[];
}

function runCreateAndReassignScenario(): ShoeSmokeCheckScenarioResult {
  resetShoeStore();

  const store = useShoeStore.getState();

  store.addNewActiveShoe({
    id: 'shoe-a',
    displayName: 'Adidas Testschuh',
    createdAt: '2026-03-26T10:00:00.000Z',
    brand: 'Adidas',
    model: 'Boston 12',
    shoeSize: 44,
  });

  store.addNewActiveShoe({
    id: 'shoe-b',
    displayName: 'Nike Testschuh',
    createdAt: '2026-03-26T10:05:00.000Z',
    brand: 'Nike',
    model: 'Pegasus 41',
    shoeSize: 44,
  });

  let state = useShoeStore.getState();
  let shoeA = state.shoes.find((shoe) => shoe.id === 'shoe-a');
  let shoeB = state.shoes.find((shoe) => shoe.id === 'shoe-b');

  assert(!!shoeA, 'shoe-a was not created.');
  assert(!!shoeB, 'shoe-b was not created.');
  assert(shoeA!.isActive === false, 'shoe-a should be parked after adding shoe-b.');
  assert(shoeB!.isActive === true, 'shoe-b should be active.');

  const longRun = createCompletedRun({
    id: 'run-1',
    distanceKm: 650,
    shoeId: 'shoe-b',
  });

  state.applyCompletedRun(longRun);

  state = useShoeStore.getState();
  shoeB = state.shoes.find((shoe) => shoe.id === 'shoe-b');

  assert(!!shoeB, 'shoe-b should still exist after applying run.');
  assert(shoeB!.currentKm === 650, 'shoe-b should have 650 km after the run.');
  assert(
    shoeB!.status === 'replace_soon',
    'shoe-b should be replace_soon at 650 km with 800 km replacement.',
  );

  const updatedRun = state.reassignCompletedRun(longRun, 'shoe-a');

  state = useShoeStore.getState();
  shoeA = state.shoes.find((shoe) => shoe.id === 'shoe-a');
  shoeB = state.shoes.find((shoe) => shoe.id === 'shoe-b');

  assert(!!shoeA, 'shoe-a should exist after reassignment.');
  assert(!!shoeB, 'shoe-b should exist after reassignment.');
  assert(updatedRun.shoeId === 'shoe-a', 'run should now belong to shoe-a.');
  assert(shoeA!.currentKm === 650, 'shoe-a should have received 650 km.');
  assert(shoeA!.status === 'replace_soon', 'shoe-a should now be replace_soon.');
  assert(shoeB!.currentKm === 0, 'shoe-b should be back to 0 km.');
  assert(shoeB!.status === 'active', 'shoe-b should be active again at 0 km.');
  assert(state.getActiveShoe()?.id === 'shoe-b', 'active shoe should remain shoe-b.');
  assert(
    state.getParkedShoes().map((shoe) => shoe.id).includes('shoe-a'),
    'shoe-a should be parked.',
  );

  return {
    name: 'create_and_reassign_completed_run',
    passed: true,
    details: {
      activeShoeId: state.getActiveShoe()?.id ?? null,
      parkedShoeIds: state.getParkedShoes().map((shoe) => shoe.id),
      shoeA: {
        id: shoeA!.id,
        currentKm: shoeA!.currentKm,
        status: shoeA!.status,
        isActive: shoeA!.isActive,
      },
      shoeB: {
        id: shoeB!.id,
        currentKm: shoeB!.currentKm,
        status: shoeB!.status,
        isActive: shoeB!.isActive,
      },
      updatedRunShoeId: updatedRun.shoeId,
    },
  };
}

function runReplaceNowScenario(): ShoeSmokeCheckScenarioResult {
  resetShoeStore();

  const store = useShoeStore.getState();

  store.addNewActiveShoe({
    id: 'shoe-c',
    displayName: 'Asics Testschuh',
    createdAt: '2026-03-26T13:00:00.000Z',
    brand: 'Asics',
    model: 'Nimbus',
    shoeSize: 43,
  });

  const stateBeforeRun = useShoeStore.getState();
  const run = createCompletedRun({
    id: 'run-2',
    distanceKm: 800,
    shoeId: 'shoe-c',
  });

  stateBeforeRun.applyCompletedRun(run);

  const stateAfterRun = useShoeStore.getState();
  const shoeC = stateAfterRun.shoes.find((shoe) => shoe.id === 'shoe-c');

  assert(!!shoeC, 'shoe-c should exist after applying run.');
  assert(shoeC!.currentKm === 800, 'shoe-c should have 800 km.');
  assert(
    shoeC!.status === 'replace_now',
    'shoe-c should be replace_now at 800 km.',
  );
  assert(
    stateAfterRun.getActiveShoe()?.id === 'shoe-c',
    'shoe-c should still be the active shoe.',
  );

  return {
    name: 'replace_now_at_replacement_limit',
    passed: true,
    details: {
      activeShoeId: stateAfterRun.getActiveShoe()?.id ?? null,
      shoeC: {
        id: shoeC!.id,
        currentKm: shoeC!.currentKm,
        status: shoeC!.status,
        replacementKm: shoeC!.replacementKm,
      },
    },
  };
}

function runReplacementKmUpdateScenario(): ShoeSmokeCheckScenarioResult {
  resetShoeStore();

  const store = useShoeStore.getState();

  store.addNewActiveShoe({
    id: 'shoe-d',
    displayName: 'Brooks Testschuh',
    createdAt: '2026-03-26T14:00:00.000Z',
    brand: 'Brooks',
    model: 'Ghost',
    shoeSize: 44,
  });

  const completedRun = createCompletedRun({
    id: 'run-3',
    distanceKm: 650,
    shoeId: 'shoe-d',
  });

  store.applyCompletedRun(completedRun);

  let state = useShoeStore.getState();
  let shoeD = state.shoes.find((shoe) => shoe.id === 'shoe-d');

  assert(!!shoeD, 'shoe-d should exist after run.');
  assert(shoeD!.status === 'replace_soon', 'shoe-d should be replace_soon at 650/800.');

  state.updateShoe('shoe-d', {
    replacementKm: 600,
  });

  state = useShoeStore.getState();
  shoeD = state.shoes.find((shoe) => shoe.id === 'shoe-d');

  assert(!!shoeD, 'shoe-d should still exist after updating replacementKm.');
  assert(shoeD!.replacementKm === 600, 'shoe-d replacementKm should now be 600.');
  assert(
    shoeD!.status === 'replace_now',
    'shoe-d should become replace_now when replacementKm is lowered to 600.',
  );

  return {
    name: 'replacement_km_update_recalculates_status',
    passed: true,
    details: {
      shoeD: {
        id: shoeD!.id,
        currentKm: shoeD!.currentKm,
        replacementKm: shoeD!.replacementKm,
        status: shoeD!.status,
      },
    },
  };
}

function runActivateParkedShoeScenario(): ShoeSmokeCheckScenarioResult {
  resetShoeStore();

  const store = useShoeStore.getState();

  store.addNewActiveShoe({
    id: 'shoe-e',
    displayName: 'Hoka Testschuh',
    createdAt: '2026-03-26T15:00:00.000Z',
    brand: 'Hoka',
    model: 'Clifton',
    shoeSize: 45,
  });

  store.addNewActiveShoe({
    id: 'shoe-f',
    displayName: 'Saucony Testschuh',
    createdAt: '2026-03-26T15:05:00.000Z',
    brand: 'Saucony',
    model: 'Ride',
    shoeSize: 45,
  });

  let state = useShoeStore.getState();

  assert(state.getActiveShoe()?.id === 'shoe-f', 'shoe-f should be active after creation.');
  assert(
    state.getParkedShoes().map((shoe) => shoe.id).includes('shoe-e'),
    'shoe-e should be parked after shoe-f creation.',
  );

  state.activateExistingShoe('shoe-e');

  state = useShoeStore.getState();
  const shoeE = state.shoes.find((shoe) => shoe.id === 'shoe-e');
  const shoeF = state.shoes.find((shoe) => shoe.id === 'shoe-f');

  assert(!!shoeE, 'shoe-e should exist.');
  assert(!!shoeF, 'shoe-f should exist.');
  assert(state.getActiveShoe()?.id === 'shoe-e', 'shoe-e should now be active.');
  assert(shoeE!.isActive === true, 'shoe-e should be marked active.');
  assert(shoeF!.isActive === false, 'shoe-f should now be parked.');

  return {
    name: 'activate_existing_parked_shoe',
    passed: true,
    details: {
      activeShoeId: state.getActiveShoe()?.id ?? null,
      parkedShoeIds: state.getParkedShoes().map((shoe) => shoe.id),
      shoeE: {
        id: shoeE!.id,
        isActive: shoeE!.isActive,
      },
      shoeF: {
        id: shoeF!.id,
        isActive: shoeF!.isActive,
      },
    },
  };
}

export function runAllShoeSmokeChecks(): ShoeSmokeCheckReport {
  const scenarios = [
    runCreateAndReassignScenario(),
    runReplaceNowScenario(),
    runReplacementKmUpdateScenario(),
    runActivateParkedShoeScenario(),
  ];

  return {
    passed: true,
    scenarios,
  };
}