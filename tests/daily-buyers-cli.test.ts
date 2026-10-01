import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const exec = promisify(execFile);
for (const status of [200, 401]) test(`daily CLI verifies Tavily HTTP ${status} without exposing credentials or overwriting research on failure`, async () => {
  const root = mkdtempSync(join(tmpdir(), 'buyer-search-check-'));
  try {
    mkdirSync(join(root, 'data'));
    for (const file of ['buyer-companies', 'buyer-products', 'buyer-sources']) writeFileSync(join(root, 'data', file + '.json'), '[]\n');
    const previous = '{"previousPublishedResearch":true}\n';
    writeFileSync(join(root, 'data/daily-research-report.json'), previous);
    const mock = join(root, 'mock-fetch.mjs');
    writeFileSync(mock, `globalThis.fetch = async url => { if (url !== 'https://api.tavily.com/search') throw new Error('Unexpected endpoint'); return new Response(JSON.stringify({results: []}), {status: ${status}, headers: {'Content-Type': 'application/json'}}); };`);
    const secret = 'fixture-key-must-not-be-logged';
    const run = exec(process.execPath, ['--import', import.meta.resolve('tsx'), '--import', pathToFileURL(mock).href, fileURLToPath(new URL('../scripts/daily-buyers.ts', import.meta.url))], {
      cwd: root, env: { ...process.env, TAVILY_API_KEY: secret, DAILY_BUYER_SEARCH_LIMIT: '1', GITHUB_STEP_SUMMARY: '' }, timeout: 15000,
    });
    if (status === 401) {
      await assert.rejects(run, (error: Error & { stdout?: string; stderr?: string }) => {
        assert.match(error.stderr || '', /all 1 search requests failed/);
        assert.ok(!`${error.stdout}${error.stderr}`.includes(secret));
        return true;
      });
      assert.equal(readFileSync(join(root, 'data/daily-research-report.json'), 'utf8'), previous);
      assert.equal(readFileSync(join(root, 'data/buyer-companies.json'), 'utf8'), '[]\n');
    } else {
      const { stdout, stderr } = await run;
      assert.match(stdout, /Tavily connection verified: 1\/1 search requests successful/);
      assert.ok(!`${stdout}${stderr}`.includes(secret));
      const report = JSON.parse(readFileSync(join(root, 'data/daily-research-report.json'), 'utf8'));
      assert.equal(report.searchConfigured, true); assert.equal(report.searchRequests, 1);
      assert.equal(report.addedCompanies.length, 0); assert.equal(report.shortfall, 10);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
