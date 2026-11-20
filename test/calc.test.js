import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MINUTE, appendHistory, litresLastHour, litresLastStep, monthKey, monthStart, parseGasTimestamp, wattHoursLastHour } from '../dist/calc.js';

const start = parseGasTimestamp('250314070015');

/** Gas readings every 5 minutes, each 7 litres more than the one before. */
function gasReadings(count, total = 842.5) {
    return Array.from({ length: count }, (_, i) => ({ total: Number((total + i * 0.007).toFixed(3)), when: start + i * 5 * MINUTE }));
}

test('parseGasTimestamp keeps 5 minutes between consecutive meter stamps', () => {
    assert.equal(parseGasTimestamp('250314070515') - parseGasTimestamp('250314070015'), 5 * MINUTE);
});

test('gas: last step is the litres used between two consecutive readings', () => {
    const [a, b] = gasReadings(2);
    assert.equal(litresLastStep(a, b), 7);
});

test('gas: last step is null when readings are more than 6 minutes apart', () => {
    const list = gasReadings(3);
    assert.equal(litresLastStep(list[0], list[2]), null);
});

test('gas: last hour is the total now minus the total 60 minutes earlier', () => {
    const list = gasReadings(14);
    const current = list.pop();
    assert.equal(litresLastHour(list, current), 12 * 7);
});

test('gas: last hour is null until the history reaches back an hour', () => {
    const list = gasReadings(6);
    const current = list.pop();
    assert.equal(litresLastHour(list, current), null);
});

test('electricity: last hour is the Wh used since the entry 60 minutes ago', () => {
    const history = Array.from({ length: 61 }, (_, i) => ({ when: start + i * MINUTE, kwh: 3150 + i * 0.005 }));
    assert.equal(wattHoursLastHour(history, start + 61 * MINUTE, 3150 + 61 * 0.005), 300);
});

test('electricity: last hour is null when the history is shorter than an hour', () => {
    const history = Array.from({ length: 20 }, (_, i) => ({ when: start + i * MINUTE, kwh: 3150 + i * 0.005 }));
    assert.equal(wattHoursLastHour(history, start + 20 * MINUTE, 3150.1), null);
});

test('appendHistory drops entries older than the window', () => {
    const history = [{ when: 0 }, { when: 50 * MINUTE }];
    assert.deepEqual(appendHistory(history, { when: 100 * MINUTE }, 60 * MINUTE).map((e) => e.when), [50 * MINUTE, 100 * MINUTE]);
});

test('monthKey uses the local year and month', () => {
    assert.equal(monthKey(new Date(2025, 2, 31, 23, 59)), '2025-03');
});

test('month: the first month starts at the totals minus the month so far', () => {
    const state = monthStart(null, '2025-03', 3150, 840, { kwh: 120, m3: 35 });
    assert.equal(state.kwh, 3030);
    assert.equal(state.m3, 805);
});

test('month: without a month so far, counting starts at the current totals', () => {
    const state = monthStart(null, '2025-03', 3150, 840, {});
    assert.equal(state.kwh, 3150);
    assert.equal(state.m3, 840);
});

test('month: the same month keeps its start', () => {
    const first = monthStart(null, '2025-03', 3150, 840, { kwh: 120, m3: 35 });
    assert.equal(monthStart(first, '2025-03', 3190, 845, { kwh: 120, m3: 35 }), first);
});

test('month: changed month-so-far numbers in the first month are applied again', () => {
    const first = monthStart(null, '2025-03', 3150, 840, { kwh: 120, m3: 35 });
    const again = monthStart(first, '2025-03', 3160, 841, { kwh: 130, m3: 36 });
    assert.equal(again.kwh, 3030);
    assert.equal(again.m3, 805);
});

test('month: a new month starts at the current totals and ignores the month so far', () => {
    const first = monthStart(null, '2025-03', 3150, 840, { kwh: 120, m3: 35 });
    const april = monthStart(first, '2025-04', 3400, 900, { kwh: 120, m3: 35 });
    assert.equal(april.kwh, 3400);
    assert.equal(april.m3, 900);
    assert.equal(monthStart(april, '2025-04', 3410, 901, { kwh: 999, m3: 99 }), april);
});
