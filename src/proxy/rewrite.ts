import * as cheerio from 'cheerio';
import { shimScript } from './shim';

export function rewriteHtml(html: string, baseUrl: string, proxyBase: string): string {
    const $ = cheerio.load(html);
    const base = new URL(baseUrl);

    // Helper to rewrite a single URL
    const rewriteUrl = (url: string | undefined) => {
        if (!url) return url;
        if (url.startsWith('data:') || url.startsWith('#') || url.startsWith('mailto:') || url.startsWith('javascript:') || url.startsWith('blob:')) {
            return url;
        }

        try {
            // Resolve relative URLs
            const resolved = new URL(url, baseUrl).toString();
            // Raw URL format: /https://target.com
            return `${proxyBase}/${resolved}`;
        } catch {
            return url;
        }
    };

    // Inject Shim first (must be first script to run)
    $('head').prepend(`<script>${shimScript}</script>`);
    $('head').prepend(`<script>window.__PROXY_BASE__ = "${proxyBase}"; window.__TARGET_ORIGIN__ = "${base.origin}";</script>`);

    // NOTE: We don't add <base> tag because it violates CSP (Content Security Policy)
    // Many sites have CSP header: base-uri 'self'
    // Our shim handles relative URL resolution instead

    // Rewrite all href attributes
    $('a, link, area').each((_, el) => {
        const href = $(el).attr('href');
        if (href) $(el).attr('href', rewriteUrl(href));
    });

    // Rewrite all src attributes
    $('img, script, iframe, audio, video, source, track, embed, object, frame').each((_, el) => {
        const src = $(el).attr('src');
        if (src) {
            $(el).attr('src', rewriteUrl(src));
            // Force eager loading for images to ensure they load after rewrite
            if (el.tagName === 'img') {
                $(el).attr('loading', 'eager');
            }
        }
    });

    // Rewrite srcset attributes
    $('img, source').each((_, el) => {
        const srcset = $(el).attr('srcset');
        if (srcset) {
            const rewritten = srcset.split(',').map(part => {
                const [url, descriptor] = part.trim().split(/\\s+/);
                return rewriteUrl(url) + (descriptor ? ' ' + descriptor : '');
            }).join(', ');
            $(el).attr('srcset', rewritten);
        }
    });

    // Rewrite poster attributes (video)
    $('video').each((_, el) => {
        const poster = $(el).attr('poster');
        if (poster) $(el).attr('poster', rewriteUrl(poster));
    });

    // Rewrite data attributes (common in SPAs)
    $('[data-src], [data-href], [data-url], [data-background]').each((_, el) => {
        const dataSrc = $(el).attr('data-src');
        const dataHref = $(el).attr('data-href');
        const dataUrl = $(el).attr('data-url');
        const dataBackground = $(el).attr('data-background');

        if (dataSrc) $(el).attr('data-src', rewriteUrl(dataSrc));
        if (dataHref) $(el).attr('data-href', rewriteUrl(dataHref));
        if (dataUrl) $(el).attr('data-url', rewriteUrl(dataUrl));
        if (dataBackground) $(el).attr('data-background', rewriteUrl(dataBackground));
    });

    // Rewrite form actions
    $('form').each((_, el) => {
        const action = $(el).attr('action');
        if (action) $(el).attr('action', rewriteUrl(action));
    });

    // Rewrite meta tags (refresh, etc.)
    $('meta[http-equiv="refresh"]').each((_, el) => {
        const content = $(el).attr('content');
        if (content) {
            const match = content.match(/^(\\d+)\\s*;\\s*url=(.+)$/i);
            if (match) {
                $(el).attr('content', `${match[1]};url=${rewriteUrl(match[2])}`);
            }
        }
    });

    // Rewrite inline styles with url()
    $('[style]').each((_, el) => {
        const style = $(el).attr('style');
        if (style && style.includes('url(')) {
            const rewritten = style.replace(/url\\((['"]?)([^'")]+)\\1\\)/g, (match, quote, url) => {
                return `url(${quote}${rewriteUrl(url)}${quote})`;
            });
            $(el).attr('style', rewritten);
        }
    });

    // Rewrite CSS <style> tags
    $('style').each((_, el) => {
        let css = $(el).html() || '';
        css = css.replace(/url\\((['"]?)([^'")]+)\\1\\)/g, (match, quote, url) => {
            return `url(${quote}${rewriteUrl(url)}${quote})`;
        });
        $(el).html(css);
    });

    // Remove Integrity checks (subresource integrity will fail because we rewrite content)
    $('[integrity]').removeAttr('integrity');

    // Remove Content Security Policy (CSP) meta tags that might block proxied resources
    $('meta[http-equiv="Content-Security-Policy"]').remove();

    return $.html();
}
