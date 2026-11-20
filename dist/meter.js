import { parseGasTimestamp } from './calc.js';

/**
 * Reads the HomeWizard P1 meter's local API (v1).
 * Turn on "Local API" for the meter in the HomeWizard Energy app first.
 */
export async function readMeter(host) {
    const response = await fetch(`http://${host}/api/v1/data`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`meter answered HTTP ${response.status}`);
    const data = await response.json();
    return {
        powerW: data.active_power_w ?? null,
        kwh: data.total_power_import_kwh ?? null,
        gas: data.total_gas_m3 == null || data.gas_timestamp == null
            ? null
            : { total: Number(data.total_gas_m3), stamp: String(data.gas_timestamp), when: parseGasTimestamp(data.gas_timestamp) },
    };
}
