# Host Takeoff for free

Render's free **Web Service** runs the existing Node server and WebSocket relay together. The 3D simulator and photo capture run in each laptop's browser, so the host does not need a GPU. A static-only host cannot run this relay.

The supplied [render.yaml](../render.yaml) selects the free plan and Singapore region, installs build dependencies, builds the app, and starts the server. Render supplies the public HTTPS address; Takeoff uses it for phone pairing and secure WebSocket connections. No database or paid add-on is required.

## Publish once as the owner

1. Commit and push the current app, including `render.yaml`, to your GitHub repository. Render deploys the files on GitHub, not uncommitted files on your laptop.
2. [Create a Render account](https://dashboard.render.com/register) and connect GitHub so Render can read the repository.
3. In Render, select **New → Blueprint**, choose `Ajtn05/Takeoff`, and select the branch containing these changes. Render reads `render.yaml`. Check that the service is **Free**, then deploy it.
4. When the deployment succeeds, open the HTTPS URL shown by Render. Share that URL with learners. Each learner selects **Pair phone** to generate their own QR code.

After these changes are pushed, you can also use [Deploy to Render](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2FAjtn05%2FTakeoff). A Render account and access to the repository are still required.

If configuring a Web Service manually, use these settings:

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Instance | Free |
| Region | Singapore (for learners in the Philippines) |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm start` |
| Health check | `/api/health` |
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `24.21.0` |
| `HOST` | `0.0.0.0` |
| `DEPLOYMENT_MODE` | `hosted` |

Do not set `PORT`; Render provides it. `RENDER_EXTERNAL_URL` is also provided automatically. If using a custom domain, set `PUBLIC_ORIGIN` to its HTTPS origin, such as `https://takeoff.example.org`, with no path or query, and use that domain on both devices.

## What learners do

Open the hosted link on the laptop → **Pair phone** → scan the QR code → **Enable controls** on the phone → close pairing on the laptop → **Take off**.

Both devices need internet access. Wi-Fi and mobile data work, and the devices do not need to be on the same network. No Node installation, terminal, USB debugging, or phone app is needed for hosted wireless control. A current laptop browser with WebGL 2 is still required. Phone and laptop compatibility and latency need physical-device checks on the intended hardware and networks.

## Free-plan limits

Render's [free-service documentation](https://render.com/docs/free) says services sleep after 15 minutes without inbound HTTP or WebSocket traffic and take about a minute to wake. Active control/status messages count as inbound traffic. Free services share a 750-instance-hour monthly workspace allowance and have bandwidth/build quotas; exceeding allowances can suspend service or incur charges when a payment method is present. Check the current limits in Render before a classroom rollout.

Pairing state lives in one server's memory. Deployments, sleep, and restarts discard sessions; reload the laptop and scan its new code. Keep one service instance: this prototype does not share pairing state across multiple instances. Abandoned stations are released one minute after the laptop disconnects, and pairing links expire after 12 hours. The server allows 32 simultaneous sessions; that is a limit, not a tested capacity guarantee.

Photos are generated on the laptop and downloaded there. Takeoff does not upload them or store learner photos on the host. The hosted app disables `/api/usb`; ADB forwarding on a cloud server cannot connect to a learner's phone. Direct USB control remains available through the local version. Supported OS tethering can supply internet over a cable, but that still uses the hosted relay.

## Test the hosted flow locally

```sh
npm run build
npm test
npm run test:hosted
```

The hosted browser tests use an HTTP loopback origin to emulate the deployment and verify pairing, independent stations, and recovery when pairing is unavailable. Public deployments require HTTPS. These tests do not measure real internet latency or verify a live Render deployment.

To run hosted mode on another provider that supports Node and WebSockets:

```sh
HOST=0.0.0.0 DEPLOYMENT_MODE=hosted PUBLIC_ORIGIN=https://your-host.example npm start
```

The provider must forward `/api/*`, `/ws` (including WebSocket upgrades), `/controller`, and the static assets to the same service. TLS can terminate at the provider's proxy. Takeoff validates browser origins against `PUBLIC_ORIGIN` rather than trusting forwarded host headers.

Cloudflare Workers with [Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/) is another free-tier option, but needs a relay rewrite for that runtime. Render is the smallest change for this app. GitHub Pages alone cannot run the Node/WebSocket backend.
