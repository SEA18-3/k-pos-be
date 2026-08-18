import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

type Envelope<T> = { status: 'success'; message: string; data: T };
type AuthData = { access_token: string };
type UserData = { id_user: string };
type DeviceData = { id_device: string; pairing_code?: string };
type ProductData = {
  id_product: string;
  name: string;
  sku: string;
  price: number;
  catalog_version: number;
};
type ReceiptData = {
  offline_uuid: string;
  status: 'QUEUED' | 'PROCESSING' | 'SYNCED' | 'CONFLICT' | 'FAILED';
  id_transaction: string | null;
  created_at: string;
  terminal_at: string | null;
};
type MerchantFixture = {
  ownerToken: string;
  entryToken: string;
  operatorToken: string;
  deviceId: string;
  product: ProductData;
  expectedOfflineUuids: string[];
  baselineTransactionCount: number;
};

const apiBaseUrl = process.env.KPOS_LOAD_API_URL ?? 'http://127.0.0.1:8080/api/v1';
const merchantCount = positiveInteger(process.env.KPOS_LOAD_MERCHANTS, 50);
const durationSeconds = positiveInteger(process.env.KPOS_LOAD_DURATION_SECONDS, 15);
const setupConcurrency = positiveInteger(process.env.KPOS_LOAD_SETUP_CONCURRENCY, 5);
const saleIntervalMilliseconds = positiveInteger(process.env.KPOS_LOAD_SALE_INTERVAL_MS, 3_000);
const enforceThresholds = process.env.KPOS_LOAD_ENFORCE_THRESHOLDS !== 'false';
const reusedRunId = process.env.KPOS_LOAD_REUSE_RUN_ID;
const runId = reusedRunId ?? `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

const enqueueLatencies: number[] = [];
const dashboardLatencies: number[] = [];
const controlReadLatencies: number[] = [];

async function main(): Promise<void> {
  console.log(`Preparing ${merchantCount} isolated merchants against ${apiBaseUrl}`);
  const fixtures = await mapWithConcurrency(
    Array.from({ length: merchantCount }, (_, index) => index),
    setupConcurrency,
    setupMerchant,
  );

  console.log(`Running mixed workload for ${durationSeconds}s`);
  const workloadStartedAt = Date.now();
  await Promise.all(fixtures.map((fixture, index) => runMerchantLoad(fixture, index)));

  console.log('Waiting for all receipts and reporting projections to converge');
  const receiptGroups = await Promise.all(fixtures.map(waitForTerminalReceipts));
  await Promise.all(fixtures.map(waitForDashboardConvergence));

  const receipts = receiptGroups.flat();
  const settlementLatencies = receipts.flatMap((receipt) =>
    receipt.terminal_at
      ? [new Date(receipt.terminal_at).getTime() - new Date(receipt.created_at).getTime()]
      : [],
  );
  const expectedCount = fixtures.reduce(
    (total, fixture) => total + fixture.expectedOfflineUuids.length,
    0,
  );
  const canonicalIds = receipts
    .map((receipt) => receipt.id_transaction)
    .filter(Boolean) as string[];
  const failures = receipts.filter((receipt) => receipt.status !== 'SYNCED');
  const duplicateCanonicalEffects = canonicalIds.length - new Set(canonicalIds).size;
  const missingReceipts = expectedCount - receipts.length;

  const result = {
    run_id: runId,
    generated_at: new Date().toISOString(),
    environment: {
      api_base_url: apiBaseUrl,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      merchant_count: merchantCount,
      duration_seconds: durationSeconds,
      setup_concurrency: setupConcurrency,
      sale_interval_ms: saleIntervalMilliseconds,
      reused_fixture: Boolean(reusedRunId),
      runtime_budget: {
        database_pool_max: positiveInteger(process.env.DATABASE_POOL_MAX, 32),
        rabbitmq_prefetch: positiveInteger(process.env.RABBITMQ_PREFETCH, 8),
        reporting_batch_size: positiveInteger(process.env.REPORTING_BATCH_SIZE, 100),
        reporting_concurrency: positiveInteger(process.env.REPORTING_CONCURRENCY, 4),
      },
    },
    throughput: {
      submitted_sales: expectedCount,
      sales_per_second: round(expectedCount / durationSeconds),
    },
    latency_ms: {
      enqueue: summarize(enqueueLatencies),
      settlement: summarize(settlementLatencies),
      owner_dashboard: summarize(dashboardLatencies),
      owner_control_read: summarize(controlReadLatencies),
    },
    integrity: {
      terminal_receipts: receipts.length,
      failed_or_conflicted: failures.length,
      missing_receipts: missingReceipts,
      duplicate_canonical_effects: duplicateCanonicalEffects,
    },
    wall_time_seconds: round((Date.now() - workloadStartedAt) / 1000),
  };

  const artifactDirectory = resolve(process.cwd(), 'artifacts/load');
  await mkdir(artifactDirectory, { recursive: true });
  const artifactPath = resolve(artifactDirectory, `kpos-load-${runId}.json`);
  await writeFile(artifactPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
  console.log(`Artifact: ${artifactPath}`);

  const thresholdErrors: string[] = [];
  if (missingReceipts !== 0) thresholdErrors.push(`${missingReceipts} receipt missing`);
  if (failures.length !== 0) thresholdErrors.push(`${failures.length} receipt not SYNCED`);
  if (duplicateCanonicalEffects !== 0) {
    thresholdErrors.push(`${duplicateCanonicalEffects} duplicate canonical transaction ID`);
  }
  if (enforceThresholds && percentile(enqueueLatencies, 95) >= 500) {
    thresholdErrors.push(`enqueue p95 ${round(percentile(enqueueLatencies, 95))}ms >= 500ms`);
  }
  if (enforceThresholds && percentile(settlementLatencies, 95) >= 750) {
    thresholdErrors.push(`settlement p95 ${round(percentile(settlementLatencies, 95))}ms >= 750ms`);
  }
  if (enforceThresholds && percentile(dashboardLatencies, 95) >= 1_500) {
    thresholdErrors.push(`dashboard p95 ${round(percentile(dashboardLatencies, 95))}ms >= 1500ms`);
  }
  if (thresholdErrors.length > 0) throw new Error(thresholdErrors.join('; '));
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function setupMerchant(index: number): Promise<MerchantFixture> {
  const suffix = `${runId}-${index}`;
  const password = 'load-test-password';
  const ownerEmail = `owner-${suffix}@load.test`;
  const entryEmail = `entry-${suffix}@load.test`;
  const operatorEmail = `operator-${suffix}@load.test`;

  if (reusedRunId) {
    return loadExistingMerchant(ownerEmail, entryEmail, operatorEmail, password);
  }

  await jsonRequest('/auth/register', {
    method: 'POST',
    body: {
      merchant_name: `Load Merchant ${suffix}`,
      timezone: 'Asia/Jakarta',
      full_name: `Load Owner ${index}`,
      email: ownerEmail,
      password,
    },
  });
  const ownerToken = (await login(ownerEmail, password)).access_token;
  await jsonRequest<Envelope<UserData>>('/users', {
    method: 'POST',
    token: ownerToken,
    body: { full_name: `Load Entry ${index}`, email: entryEmail, password, role: 'ENTRY' },
  });
  await jsonRequest<Envelope<UserData>>('/users', {
    method: 'POST',
    token: ownerToken,
    body: { full_name: `Load Operator ${index}`, email: operatorEmail, password, role: 'OPERATOR' },
  });

  const entryToken = (await login(entryEmail, password)).access_token;
  const createdDevice = await jsonRequest<Envelope<DeviceData>>('/devices', {
    method: 'POST',
    token: ownerToken,
    body: { name: `Load Counter ${index}` },
  });
  const pairedDevice = await jsonRequest<Envelope<DeviceData>>('/devices/pair', {
    method: 'POST',
    body: {
      pairing_code: requireValue(createdDevice.data.pairing_code, 'pairing code'),
      hardware_id: `load-hardware-${suffix}`,
    },
  });

  const productForm = new FormData();
  productForm.set('name', `Load Coffee ${index}`);
  productForm.set('sku', `LOAD-${runId}-${index}`);
  productForm.set('price', '21000');
  const productResponse = await formRequest<Envelope<ProductData>>('/products', {
    method: 'POST',
    token: entryToken,
    body: productForm,
  });
  await jsonRequest(`/products/${productResponse.data.id_product}/stock-adjustments`, {
    method: 'POST',
    token: entryToken,
    body: { quantity: 100_000, notes: 'Mixed-load capacity fixture' },
  });

  const operatorToken = (await login(operatorEmail, password, pairedDevice.data.id_device))
    .access_token;
  return {
    ownerToken,
    entryToken,
    operatorToken,
    deviceId: pairedDevice.data.id_device,
    product: productResponse.data,
    expectedOfflineUuids: [],
    baselineTransactionCount: 0,
  };
}

async function loadExistingMerchant(
  ownerEmail: string,
  entryEmail: string,
  operatorEmail: string,
  password: string,
): Promise<MerchantFixture> {
  const ownerToken = (await login(ownerEmail, password)).access_token;
  const entryToken = (await login(entryEmail, password)).access_token;
  const devices = await jsonRequest<Envelope<DeviceData[]>>('/devices', { token: ownerToken });
  const device = devices.data.find(
    (candidate) => candidate.id_device && candidate.pairing_code === null,
  );
  if (!device) throw new Error(`No paired device found for ${ownerEmail}`);
  const products = await jsonRequest<Envelope<{ items: ProductData[] }>>('/products?limit=100', {
    token: entryToken,
  });
  const product = products.data.items.find((candidate) => candidate.sku.startsWith('LOAD-'));
  if (!product) throw new Error(`No load product found for ${ownerEmail}`);
  const operatorToken = (await login(operatorEmail, password, device.id_device)).access_token;
  const dashboard = await jsonRequest<Envelope<{ transaction_count: number }>>('/owner/dashboard', {
    token: ownerToken,
  });
  return {
    ownerToken,
    entryToken,
    operatorToken,
    deviceId: device.id_device,
    product,
    expectedOfflineUuids: [],
    baselineTransactionCount: dashboard.data.transaction_count,
  };
}

async function runMerchantLoad(fixture: MerchantFixture, index: number): Promise<void> {
  // Give every counter a deterministic phase within one sale interval. This keeps
  // the configured throughput while avoiding an artificial synchronized burst.
  await delay(Math.floor((index * saleIntervalMilliseconds) / merchantCount));
  const deadline = Date.now() + durationSeconds * 1_000;
  let iteration = 0;
  while (Date.now() < deadline) {
    const offlineUuid = crypto.randomUUID();
    fixture.expectedOfflineUuids.push(offlineUuid);
    const payload = salePayload(fixture.product, offlineUuid);
    enqueueLatencies.push(
      await timed(() =>
        jsonRequest('/sync', {
          method: 'POST',
          token: fixture.operatorToken,
          deviceId: fixture.deviceId,
          body: { transactions: [payload] },
        }),
      ),
    );

    if (iteration % 5 === 0 && index % 5 === 0) {
      // Duplicate delivery deliberately exercises the idempotency boundary.
      await jsonRequest('/sync', {
        method: 'POST',
        token: fixture.operatorToken,
        deviceId: fixture.deviceId,
        body: { transactions: [payload] },
      });
      await jsonRequest('/products', { token: fixture.entryToken });
    }
    if (iteration % 5 === 0 && index % 10 === 0) {
      dashboardLatencies.push(
        await timed(() => jsonRequest('/owner/dashboard', { token: fixture.ownerToken })),
      );
    }
    if (iteration % 10 === 0 && index % 20 === 0) {
      controlReadLatencies.push(
        await timed(() => jsonRequest('/users', { token: fixture.ownerToken })),
      );
      await jsonRequest(`/products/${fixture.product.id_product}/stock-adjustments`, {
        method: 'POST',
        token: fixture.entryToken,
        body: { quantity: 1, notes: 'Mixed-load Entry adjustment' },
      });
    }
    iteration += 1;
    await delay(saleIntervalMilliseconds + (index % 5) * 50);
  }
}

async function waitForTerminalReceipts(fixture: MerchantFixture): Promise<ReceiptData[]> {
  const chunks = chunk(fixture.expectedOfflineUuids, 100);
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const responses = await Promise.all(
      chunks.map((ids) =>
        jsonRequest<Envelope<{ items: ReceiptData[] }>>(
          `/sync/receipts?${ids.map((id) => `offline_uuid=${encodeURIComponent(id)}`).join('&')}`,
          { token: fixture.operatorToken, deviceId: fixture.deviceId },
        ),
      ),
    );
    const items = responses.flatMap((response) => response.data.items);
    if (
      items.length === fixture.expectedOfflineUuids.length &&
      items.every((receipt) => ['SYNCED', 'CONFLICT', 'FAILED'].includes(receipt.status))
    ) {
      return items;
    }
    await delay(200);
  }
  throw new Error('Receipts did not reach terminal state within 45 seconds');
}

async function waitForDashboardConvergence(fixture: MerchantFixture): Promise<void> {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const response = await jsonRequest<Envelope<{ transaction_count: number }>>(
      '/owner/dashboard',
      {
        token: fixture.ownerToken,
      },
    );
    if (
      response.data.transaction_count ===
      fixture.baselineTransactionCount + fixture.expectedOfflineUuids.length
    ) {
      return;
    }
    await delay(200);
  }
  throw new Error('Reporting projection did not converge within 45 seconds');
}

function salePayload(product: ProductData, offlineUuid: string) {
  return {
    offline_uuid: offlineUuid,
    created_at_local: new Date().toISOString(),
    subtotal: product.price,
    total: product.price,
    items: [
      {
        id_product: product.id_product,
        product_name: product.name,
        product_sku: product.sku,
        catalog_version: product.catalog_version,
        quantity: 1,
        unit_price: product.price,
        subtotal: product.price,
      },
    ],
    payment: {
      method: 'STATIC_QRIS',
      amount: product.price,
      qris_code: `load-${offlineUuid}`,
    },
  };
}

async function login(email: string, password: string, deviceId?: string): Promise<AuthData> {
  const response = await jsonRequest<Envelope<AuthData>>('/auth/login', {
    method: 'POST',
    body: { email, password, ...(deviceId ? { device_id: deviceId } : {}) },
  });
  return response.data;
}

async function jsonRequest<T = Envelope<unknown>>(
  path: string,
  options: {
    method?: string;
    token?: string;
    deviceId?: string;
    body?: unknown;
  } = {},
): Promise<T> {
  return request<T>(path, {
    method: options.method,
    token: options.token,
    deviceId: options.deviceId,
    headers: { 'content-type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

async function formRequest<T>(
  path: string,
  options: { method: string; token: string; body: FormData },
): Promise<T> {
  return request<T>(path, options);
}

async function request<T>(
  path: string,
  options: {
    method?: string;
    token?: string;
    deviceId?: string;
    headers?: Record<string, string>;
    body?: BodyInit;
  },
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...options.headers,
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.deviceId ? { 'X-Device-ID': options.deviceId } : {}),
    },
    body: options.body,
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} failed (${response.status}): ${JSON.stringify(body)}`,
    );
  }
  return body as T;
}

async function timed(operation: () => Promise<unknown>): Promise<number> {
  const startedAt = performance.now();
  await operation();
  return performance.now() - startedAt;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const result = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        result[index] = await mapper(values[index]);
      }
    }),
  );
  return result;
}

function summarize(values: number[]) {
  return {
    count: values.length,
    p50: round(percentile(values, 50)),
    p95: round(percentile(values, 95)),
    p99: round(percentile(values, 99)),
    max: round(Math.max(...values, 0)),
  };
}

function percentile(values: number[], requestedPercentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil((requestedPercentile / 100) * sorted.length) - 1)
  ];
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error(`Expected positive integer, got ${value}`);
  return parsed;
}

function requireValue(value: string | undefined, label: string): string {
  if (!value) throw new Error(`Missing ${label}`);
  return value;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function chunk<T>(values: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    groups.push(values.slice(index, index + size));
  }
  return groups;
}
