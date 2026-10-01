import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request } from 'node:https';

export function publicHost(host: string) {
  const value = host.toLowerCase().replace(/\.$/, '');
  return !isIP(value) && /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(value)
    && !/(?:^|\.)(?:localhost|local|internal|test|invalid|example)$/.test(value);
}

export function publicAddress(ip: string) {
  // IPv4 only: pin the validated DNS result for the HTTPS request. IPv6-only
  // hosts are skipped, avoiding ambiguous mapped/link-local address handling.
  if (isIP(ip) !== 4) return false;
  const [a, b] = ip.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254
    || a === 172 && b >= 16 && b <= 31 || a === 192 && [0, 168].includes(b)
    || a === 100 && b >= 64 && b <= 127 || a === 198 && [18, 19, 51].includes(b)
    || a === 203 && b === 0);
}

export const canonicalHost = (value: string) => new URL(value.includes('://') ? value : `https://${value}`).hostname.toLowerCase().replace(/^www\./, '');
export type PublicPage = { url: string; text: string };

export function createPublicFetcher(limit = 300) {
  let requests = 0;
  const cache = new Map<string, PublicPage>();
  return {
    get requests() { return requests; },
    async get(input: string): Promise<PublicPage> {
      if (cache.has(input)) return cache.get(input)!;
      let url = new URL(input);
      const original = canonicalHost(url.href);
      for (let redirects = 0; redirects < 4; redirects++) {
        if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443' || !publicHost(url.hostname) || canonicalHost(url.href) !== original) throw new Error('Only public HTTPS pages on the company domain are supported.');
        if (requests >= limit) throw new Error('Daily public-page request limit reached.');
        requests++;
        const addresses = await lookup(url.hostname, { all: true, family: 4 });
        if (!addresses.length || addresses.some(entry => !publicAddress(entry.address))) throw new Error('Public company address could not be validated.');
        const result = await new Promise<{ status: number; location?: string; text: string }>((resolve, reject) => {
          const req = request(url, { method: 'GET', family: 4, headers: { 'User-Agent': 'DhampurGreenResearch/1.0 (public business research)', Accept: 'text/html,application/json,application/xml;q=0.9' },
            lookup: (_hostname, _options, callback) => callback(null, addresses[0].address, 4) }, response => {
            const chunks: Buffer[] = []; let bytes = 0;
            response.on('data', chunk => { bytes += chunk.length; if (bytes > 6_000_000) { response.destroy(new Error('Page exceeded research size limit.')); } else chunks.push(chunk); });
            response.on('error', reject);
            response.on('end', () => resolve({ status: response.statusCode || 0, location: response.headers.location, text: Buffer.concat(chunks).toString('utf8') }));
          });
          const timer = setTimeout(() => req.destroy(new Error('Company page timed out.')), 15000);
          req.on('close', () => clearTimeout(timer)); req.on('error', reject); req.end();
        });
        if ([301, 302, 303, 307, 308].includes(result.status) && result.location) { url = new URL(result.location, url); continue; }
        if (result.status !== 200) throw new Error(`Company page returned HTTP ${result.status}.`);
        const page = { url: url.href, text: result.text }; cache.set(input, page); return page;
      }
      throw new Error('Company page redirected too many times.');
    },
  };
}
