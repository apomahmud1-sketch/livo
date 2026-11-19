import { registerRootComponent } from 'expo';
import * as Sentry from '@sentry/react-native';

// ── Crash reporting (Sentry, project "livo") ─────────────────────
// Init BEFORE the app code loads, so even a crash during startup is
// captured and sent to Sentry. The DSN is a public ingest key — it
// is meant to ship inside the app, it is not a secret.
// The App is required (not imported) below on purpose: ESM imports
// are hoisted and would load the app code before this init runs.
Sentry.init({
  dsn: 'https://8ab2f1f92fa5b7286b5563176c2d3749@o4512458501586944.ingest.us.sentry.io/4512458503421952',
  tracesSampleRate: 0,
});

const App = require('./App').default;

registerRootComponent(Sentry.wrap(App));
