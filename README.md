# homebridge-p1-meter-metrics

A [Homebridge](https://homebridge.io) plugin that shows a
[HomeWizard P1 meter](https://www.homewizard.com/p1-meter/) in Apple Home as eight tiles:
electricity and gas, each now, in the last hour, this month and in total.

Apple Home only draws a number on a tile for plugs that report power, and it has no tile for gas
at all. So every tile is a Matter plug whose "W" number is the value it stands for:

| Tile                    | Shows                                             |
| ----------------------- | ------------------------------------------------- |
| `Electricity`           | live power, W                                     |
| `Electricity 1h`        | used in the last 60 minutes, Wh                   |
| `Electricity month`     | used this month, Wh (Home shows `184kW`)          |
| `Electricity total`     | meter total, Wh (Home shows kW or MW)             |
| `Gas L`                 | litres used in the last 5 minutes (between two readings) |
| `Gas 1h L`              | litres used in the last 60 minutes                |
| `Gas month m³`          | used this month, litres (Home shows `32,7kW`, which reads as m³) |
| `Gas total m³`          | meter total, litres (Home shows kW, which reads as m³) |

Home always labels the number W, so the gas tiles' names end with their real unit. For example,
`Gas L · On · 12W` means 12 litres in the last 5 minutes. Short periods use litres and Wh
because Home only shows whole numbers: 0.012 m³ would read 0.

## How it works

The plugin reads the meter's local API every 10 seconds.

- **Electricity** updates live. The last hour is the meter total now minus the total 60 minutes
  ago.
- **Gas**: the meter only reports the gas total, and a DSMR 5 meter refreshes it every 5 minutes.
  `Gas` is the new total minus the previous one, `Gas 1h` the new total minus the total from 60
  minutes earlier.
- **Month** tiles count from the meter totals at the start of the month, and reset on the 1st.
- Until the plugin has a full hour of history, the hour tiles show what was used since it started.
  History and the month start are saved in `p1-meter-metrics.json` in the Homebridge storage folder, so a restart does not reset
  them.

Turning a tile off does nothing: it switches itself back on within a minute.

## Setup

1. In the HomeWizard Energy app, open the P1 meter and turn on **Local API**. Note its IP address.
2. Install the plugin from the Homebridge UI.
3. In its settings, fill in the meter's IP address. For the month you install it in, you can also
   fill in the month totals so far from the HomeWizard app, so the month tiles start right:
   in the units the tiles use: electricity in Wh (184 kWh is entered as 184000) and gas in litres
   (32.7 m³ is entered as 32700).
4. Run it as a child bridge with Matter on, for example:

   ```json
   {
     "platform": "HomeWizardTiles",
     "host": "192.0.2.10",
     "_bridge": {
       "name": "P1 Meter Metrics",
       "username": "0E:12:34:56:78:9A",
       "port": 51900,
       "hap": { "enabled": false },
       "matter": { "port": 5541 }
     }
   }
   ```

5. Restart Homebridge, then add the child bridge to Apple Home with its Matter QR code.

## Notes

- Apple Home adds the tiles' numbers into the room's Power total, which then means nothing. Put the
  tiles in a room of their own.
- Needs Homebridge 2.5 or newer with Matter, Node.js 22.13 or newer, and the HomeWizard local
  API v1.

## Development

```bash
npm test
```

## License

MIT
