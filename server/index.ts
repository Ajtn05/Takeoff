import { createTrainerServer } from './app.js';

const port = Number(process.env.PORT ?? 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT must be between 1 and 65535');
const publicOrigin = process.env.PUBLIC_ORIGIN ?? process.env.RENDER_EXTERNAL_URL;
if (process.env.DEPLOYMENT_MODE === 'hosted' && !publicOrigin)
  throw new Error('Hosted mode needs PUBLIC_ORIGIN or RENDER_EXTERNAL_URL.');
const host = process.env.HOST ?? (publicOrigin ? '0.0.0.0' : '127.0.0.1');
const app = await createTrainerServer({
  dev: process.env.NODE_ENV !== 'production',
  host,
  port,
  publicOrigin,
});
console.log(
  `\nFlight School is ready at http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`,
);
console.log(
  publicOrigin
    ? `Wireless pairing enabled at ${publicOrigin}. Open Pair phone and scan the code.`
    : host === '0.0.0.0'
      ? 'Wi-Fi enabled. Open Pair phone for a LAN address.'
      : `USB mode. Run: adb reverse tcp:${port} tcp:${port}`,
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
