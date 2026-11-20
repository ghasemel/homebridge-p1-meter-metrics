import { test } from 'node:test';
import assert from 'node:assert/strict';
import registerPlugin from '../dist/index.js';

/** Registers the plugin against a minimal fake Homebridge API and returns its platform class. */
function platformClass() {
    let registered;
    registerPlugin({ registerPlatform: (_name, constructor) => { registered = constructor; } });
    return registered;
}

function fakeApi() {
    return { user: { storagePath: () => '/tmp' }, on: () => {} };
}

test('the platform counts as dynamic, so Homebridge keeps its cached tiles across restarts', () => {
    const Platform = platformClass();
    const platform = new Platform(console, { host: '192.0.2.10' }, fakeApi());
    // Homebridge's own check (HomebridgeAPI.isDynamicPlatformPlugin)
    assert.ok('configureAccessory' in platform);
});

test('cached Matter tiles handed back by Homebridge are remembered', () => {
    const Platform = platformClass();
    const platform = new Platform(console, { host: '192.0.2.10' }, fakeApi());
    platform.configureMatterAccessory({ UUID: 'abc', displayName: 'Gas L' });
    assert.equal(platform.cached.get('abc').displayName, 'Gas L');
});
