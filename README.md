# Sandbox City

**PayPal's sandbox is a ghost town. We give it a population.**

Sandbox City is an interactive payment-testing simulation that turns a PayPal integration into a small, living city. Each citizen represents a different payment behavior, while the city's buildings expose payment workflows and the problems that can occur around them.

Instead of testing only one successful checkout, developers can explore normal and failure scenarios such as duplicate purchase attempts, refunds, payouts, invoices, disputes, and webhook events. The interface separates simulated activity from calls made to the PayPal Sandbox.

## What it demonstrates

- **PayPal Sandbox workflows:** server-side integration for Orders, capture, refunds, invoicing, payouts, disputes, and webhooks.
- **Scenario-driven testing:** citizens and configurable bug scenarios demonstrate how payment systems behave under less-than-perfect conditions.
- **Live and simulated modes:** distinguish PayPal Sandbox activity from locally simulated events.
- **AI-assisted citizens:** Google Gemini can make citizen decisions through server-side API calls. Fallback behavior is available when Gemini is not configured or unavailable.
- **Operational visibility:** a real-time event stream, activity/ledger views, service status, fallback notices, and a live-call counter make the simulation understandable.

> Sandbox City is a developer demonstration and testing tool. Use PayPal Sandbox credentials only. It is not a production payment processor.

## Tech stack

- React 19 and TypeScript
- Vite and Express
- PayPal REST APIs (Sandbox)
- Google Gemini via the @google/genai SDK
- Tailwind CSS
- AG Grid and Recharts
- Zustand and Motion

## Run locally

### Requirements

- Node.js (use a current supported LTS release)
- npm
- PayPal Developer Sandbox app credentials for live-sandbox API calls
- A Gemini API key for AI-powered citizen decisions (optional; fallback behavior is available)

### 1. Clone and install

    git clone https://github.com/MohammedAyman07/Sandbox-City.git
    cd Sandbox-City
    npm install

### 2. Configure environment variables

Create a local environment file from the example:

    cp .env.example .env

On Windows PowerShell:

    Copy-Item .env.example .env

Set the values in .env as needed:

| Variable | Purpose |
| --- | --- |
| PAYPAL_CLIENT_ID | PayPal Sandbox REST app client ID |
| PAYPAL_CLIENT_SECRET | PayPal Sandbox REST app secret |
| PAYPAL_WEBHOOK_ID | Webhook ID registered for your Sandbox app |
| GEMINI_API_KEY | Google Gemini API key for AI-powered decisions and reports |
| APP_URL | Public base URL of the running app, when required by your deployment |
| PAYPAL_PAYOUT_RECIPIENT_EMAIL | Sandbox recipient email used by payout scenarios |
| PAYPAL_BUYER_EMAIL | Sandbox buyer email used by applicable scenarios |

Only use Sandbox credentials. Keep .env private and never commit it. The repository's .gitignore excludes .env* files while allowing .env.example to be tracked. The example file contains placeholders, not working credentials.

### 3. Start the development server

    npm run dev

Open http://localhost:3000.

### 4. Build and run the production server

    npm run build
    NODE_ENV=production npm start

The Express server serves the Vite production build from dist. Configure your hosting platform to run the Node server and provide environment variables through its secret/environment-variable settings.

## PayPal Sandbox webhook setup

Register your deployed app's webhook endpoint in the PayPal Developer Dashboard:

    https://YOUR_PUBLIC_APP_URL/api/webhooks/paypal

Use the webhook ID from that Sandbox webhook registration as PAYPAL_WEBHOOK_ID. Configure the event types required by the scenarios you want to test. Do not use a live PayPal webhook or live credentials for this demo.

## Useful scripts

| Command | Description |
| --- | --- |
| npm run dev | Start the Express server with the Vite development middleware |
| npm run build | Build the frontend into dist |
| npm start | Start the Express server |
| npm run lint | Run the TypeScript compiler checks |
| npm run preview | Run Vite's preview server |

## Project structure

    .
    ├── server.ts             # Express API routes and Vite/production server
    ├── src/
    │   ├── components/       # City, citizen, dashboard, and interaction UI
    │   ├── server/           # PayPal Sandbox and Gemini integrations
    │   ├── store/            # Client-side application state
    │   ├── types/            # Shared TypeScript types
    │   └── utils/            # City data and utilities
    ├── .env.example          # Environment-variable template
    ├── .gitignore
    ├── LICENSE
    └── package.json

## Security notes

- PayPal and Gemini credentials are read by the server from environment variables; do not put secrets in frontend code.
- Never commit .env or paste real credentials into issues, screenshots, or demo videos.
- Use PayPal Sandbox accounts and test data only.
- Before exposing a deployment to untrusted public traffic, review API access controls, request limits, and webhook verification for your deployment mode.

## License

This project is licensed under the MIT License. See LICENSE.