import { describe, it, expect } from 'vitest';
import { parseHTML } from 'linkedom';
import { runInNewContext } from 'node:vm';
import { architectureGuide } from '../src/architecture';
import { openApiDocument } from '../src/openapi';
function guide() {
  const html = architectureGuide('test-guide-nonce');
  const { document } = parseHTML(html);
  const script = document.querySelector('script[nonce]')!.textContent!;
  runInNewContext(script, { document });
  return {
    html,
    document,
    click: (selector: string) =>
      (document.querySelector(selector) as unknown as { click: () => void }).click(),
  };
}
describe('self-contained architecture walkthrough', () => {
  it('walks all six chapters, supports reverse navigation, depth and component inspection', () => {
    const { document, click, html } = guide();
    expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+stylesheet|style="/);
    expect(html).not.toContain('__CATALOG__');
    expect(document.querySelectorAll('.chapter')).toHaveLength(6);
    expect(document.querySelector('#title')!.textContent).toContain('One service');
    click('[data-node="artifacts"]');
    click('#technical');
    expect(document.querySelector('#node-copy')!.textContent).toContain('Cloudflare R2');
    expect(document.querySelector('#technical')!.getAttribute('aria-pressed')).toBe('true');
    click('#plain');
    expect(document.querySelector('#node-copy')!.textContent).toContain('Readable articles');
    for (let i = 0; i < 24; i++) click('#next');
    expect(document.querySelector('#title')!.textContent).toContain('One service');
    click('#next');
    click('#back');
    expect(document.querySelector('#step-count')!.textContent).toBe('Step 1 of 4');
    click('.chapter:nth-child(6)');
    for (let i = 0; i < 3; i++) click('#next');
    expect(document.querySelector('#receipt')!.textContent).toContain('account_data_erased');
  });
  it('runs each save failure scenario and searches the actual API contract, including empty results', () => {
    const { document, click } = guide();
    click('.chapter:nth-child(2)');
    const checks = ['Source availability', 'A retry repeats', 'A fresh save'];
    for (let scenario = 1; scenario <= 3; scenario++) {
      click('#scenarios button:nth-child(' + (scenario + 1) + ')');
      click('#next');
      click('#next');
      expect(document.querySelector('#lesson')!.textContent).toContain(checks[scenario - 1]);
    }
    const methods = Object.values(
      openApiDocument().paths as Record<string, Record<string, unknown>>
    ).flatMap((path) =>
      Object.keys(path).filter((method) =>
        ['get', 'post', 'put', 'patch', 'delete'].includes(method)
      )
    );
    expect(document.querySelectorAll('.endpoint')).toHaveLength(methods.length);
    const input = document.querySelector('#endpoint-search') as unknown as {
      value: string;
      dispatchEvent: (event: unknown) => void;
    };
    input.value = 'subscriptions';
    input.dispatchEvent(new document.defaultView!.Event('input'));
    expect(document.querySelectorAll('.endpoint').length).toBeGreaterThan(0);
    expect(document.querySelector('#catalog')!.textContent).toContain('/v1/subscriptions');
    input.value = 'no-such-capability-xyz';
    input.dispatchEvent(new document.defaultView!.Event('input'));
    expect(document.querySelector('#catalog')!.textContent).toContain('No matching endpoint');
  });
});
