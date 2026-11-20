/**
 * homebridge-homewizard-tiles
 *
 * Shows a HomeWizard P1 meter in Apple Home as eight Matter plug tiles. Apple Home only
 * draws a number on a tile for plugs with a power reading, so every tile is a plug whose
 * "W" number is the value below. Home always labels it W, so each tile's name ends
 * with its real unit:
 *
 *   Electricity W          live power
 *   Electricity 1h Wh      used in the last 60 minutes
 *   Electricity month kWh  used this month
 *   Electricity total kWh  meter total
 *   Gas L                  used in the last 5 minutes (between two meter readings), litres
 *   Gas 1h L               used in the last 60 minutes, litres
 *   Gas month m³           used this month
 *   Gas total m³           meter total
 *
 * Short periods use litres (and Wh) because Home shows whole numbers: 0.012 m3 would read 0.
 *
 * Needs Matter turned on for the plugin's bridge. Turning a tile off does nothing: it
 * switches itself back on. History and the month start are kept in a small file in the
 * Homebridge storage folder, so a restart does not reset them.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MINUTE, appendHistory, litresLastHour, litresLastStep, monthKey, monthStart, round, wattHoursLastHour } from './calc.js';
import { readMeter } from './meter.js';

const PLUGIN_NAME = 'homebridge-homewizard-tiles';
const PLATFORM_NAME = 'HomeWizardTiles';
const POLL_MS = 10_000;
const KEEP_MS = 90 * MINUTE;

const TILES = [
    { key: 'electricity', name: 'Electricity W', model: 'Electricity now (W)' },
    { key: 'electricity-1h', name: 'Electricity 1h Wh', model: 'Electricity last hour (Wh)' },
    { key: 'electricity-month', name: 'Electricity month kWh', model: 'Electricity this month (kWh)' },
    { key: 'electricity-total', name: 'Electricity total kWh', model: 'Electricity meter total (kWh)' },
    { key: 'gas', name: 'Gas L', model: 'Gas last 5 minutes (litres)' },
    { key: 'gas-1h', name: 'Gas 1h L', model: 'Gas last hour (litres)' },
    { key: 'gas-month', name: 'Gas month m³', model: 'Gas this month (m3)' },
    { key: 'gas-total', name: 'Gas total m³', model: 'Gas meter total (m3)' },
];

export default (api) => {
    api.registerPlatform(PLATFORM_NAME, HomeWizardTilesPlatform);
};

class HomeWizardTilesPlatform {
    cached = new Map();
    uuids = {};
    state = { electricityHistory: [], gasHistory: [], month: null };
    lastMinute = 0;

    constructor(log, config, api) {
        this.log = log;
        this.config = config ?? {};
        this.api = api;
        this.stateFile = join(api.user.storagePath(), 'homewizard-tiles.json');
        api.on('didFinishLaunching', () => void this.start());
    }

    /** Homebridge hands back the tiles it restored from its cache. */
    configureMatterAccessory(accessory) {
        this.cached.set(accessory.UUID, accessory);
    }

    get host() {
        return String(this.config.host ?? '').trim();
    }

    async start() {
        if (!this.host) {
            this.log.error('No meter IP set. Open the plugin settings and fill in the IP address of the HomeWizard P1 meter.');
            return;
        }
        if (!this.api.isMatterEnabled?.() || !this.api.matter) {
            this.log.error('Matter is not turned on for this bridge. Turn on Matter in the plugin\'s bridge settings, then restart.');
            return;
        }
        const matter = this.api.matter;
        const fresh = [];
        const renamed = [];
        for (const tile of TILES) {
            const uuid = matter.uuid.generate(`${PLUGIN_NAME}-${tile.key}`);
            this.uuids[tile.key] = uuid;
            const cached = this.cached.get(uuid);
            if (cached) {
                if (cached.displayName !== tile.name) renamed.push({ ...cached, displayName: tile.name });
                continue;
            }
            fresh.push({
                UUID: uuid,
                displayName: tile.name,
                deviceType: matter.deviceTypes.OnOffOutlet,
                manufacturer: 'HomeWizard',
                model: tile.model,
                serialNumber: `${tile.key}-${this.host.replace(/\./g, '-')}`,
                context: {},
                clusters: {
                    onOff: { onOff: true },
                    electricalPowerMeasurement: { activePower: 0 },
                },
            });
        }
        if (renamed.length > 0) {
            await matter.updatePlatformAccessories(renamed);
            this.log.info(`Renamed ${renamed.length} tiles`);
        }
        if (fresh.length > 0) {
            await matter.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, fresh);
            this.log.info(`Added ${fresh.length} tiles: ${fresh.map((a) => a.displayName).join(', ')}`);
        }
        try {
            this.state = { ...this.state, ...JSON.parse(await readFile(this.stateFile, 'utf8')) };
        } catch {
            // first start: no saved history yet
        }
        await this.poll();
        setInterval(() => void this.poll(), POLL_MS);
    }

    async show(key, value) {
        if (value === null || value === undefined) return;
        await this.api.matter.updateAccessoryState(this.uuids[key], 'electricalPowerMeasurement', { activePower: Math.round(value * 1000) });
    }

    async poll() {
        try {
            const now = Date.now();
            const reading = await readMeter(this.host);
            const everyMinute = now - this.lastMinute >= MINUTE;

            if (reading.kwh !== null) {
                this.state.month = monthStart(this.state.month, monthKey(new Date(now)), reading.kwh, reading.gas?.total ?? 0, {
                    kwh: this.config.electricityMonthSoFar,
                    m3: this.config.gasMonthSoFar,
                });
                await this.show('electricity', reading.powerW);
                await this.show('electricity-total', round(reading.kwh, 1));
                await this.show('electricity-month', round(reading.kwh - this.state.month.kwh, 1));
                if (everyMinute) {
                    await this.show('electricity-1h', wattHoursLastHour(this.state.electricityHistory, now, reading.kwh));
                    this.state.electricityHistory = appendHistory(this.state.electricityHistory, { when: now, kwh: reading.kwh }, KEEP_MS);
                }
            }

            const gas = reading.gas;
            const lastGas = this.state.gasHistory.at(-1);
            if (gas && (!lastGas || lastGas.stamp !== gas.stamp)) {
                const step = lastGas ? litresLastStep(lastGas, gas) : null;
                const hour = litresLastHour(this.state.gasHistory, gas);
                this.state.gasHistory = appendHistory(this.state.gasHistory, gas, KEEP_MS);
                await this.show('gas', step);
                await this.show('gas-1h', hour);
                await this.show('gas-total', round(gas.total, 1));
                if (this.state.month) await this.show('gas-month', round(gas.total - this.state.month.m3, 1));
                this.log.info(`Gas: ${step ?? '-'} L in the last 5 minutes, ${hour ?? '-'} L in the last hour, total ${gas.total} m3`);
            }

            if (everyMinute) {
                this.lastMinute = now;
                for (const uuid of Object.values(this.uuids)) {
                    await this.api.matter.updateAccessoryState(uuid, 'onOff', { onOff: true });
                }
                await writeFile(this.stateFile, JSON.stringify(this.state));
            }
        } catch (error) {
            this.log.warn(`Meter: ${error.message}`);
        }
    }
}
