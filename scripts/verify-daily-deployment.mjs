import { readFileSync } from 'node:fs';
const revision = process.env.EXPECTED_REVISION?.slice(0, 12);
if (!revision) throw new Error('EXPECTED_REVISION is required.');
const companies = JSON.parse(readFileSync('data/buyer-companies.json', 'utf8'));
const products = JSON.parse(readFileSync('data/buyer-products.json', 'utf8'));
const base = 'https://dhampur-green-grow.vercel.app';
for (let attempt = 0; attempt < 24; attempt++) {
  try {
    const health = await (await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(15000) })).json();
    if (health.ok && health.revision === revision) {
      const response = await fetch(`${base}/api/ingredient-intelligence`, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('Public research endpoint failed.');
      const data = await response.json();
      if (data.companies.length !== companies.length || data.products.length !== products.length) throw new Error('Published counts differ from validated research.');
      console.log(`Published ${revision}: ${companies.length} companies and ${products.length} products.`);
      process.exit(0);
    }
  } catch { /* Wait for deployment propagation; no mutations or outreach. */ }
  await new Promise(resolve => setTimeout(resolve, 15000));
}
throw new Error('The expected research revision did not reach the public site. Check the Vercel deployment and deploy-hook secret.');
