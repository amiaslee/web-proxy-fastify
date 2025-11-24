export const shimScript = `
(function() {
  const proxyBase = window.__PROXY_BASE__ || window.location.origin;
  const targetOrigin = window.__TARGET_ORIGIN__;
  
  // Get the current proxied URL (extract from window.location)
  function getCurrentProxiedUrl() {
    const path = window.location.pathname.substring(1); // Remove leading /
    if (path.startsWith('http')) {
      return path;
    }
    return targetOrigin;
  }
  
  // Check if URL is already proxied
  function isAlreadyProxied(url) {
    if (!url) return false;
    // Check if it's already in proxy format (starts with proxyBase + /http)
    return url.startsWith(proxyBase + '/http');
  }
  
  // Encode URL for proxy
  function proxyUrl(url) {
    if (!url) return url;
    
    // Skip special protocols
    if (url.startsWith('data:') || url.startsWith('#') || url.startsWith('mailto:') || 
        url.startsWith('javascript:') || url.startsWith('blob:')) {
      return url;
    }
    
    // Skip if already proxied
    if (isAlreadyProxied(url)) {
      return url;
    }
    
    try {
      let resolved;
      const currentUrl = getCurrentProxiedUrl();
      
      if (url.startsWith('http://') || url.startsWith('https://')) {
        resolved = url;
      } else if (url.startsWith('//')) {
        resolved = 'https:' + url;
      } else if (url.startsWith('/')) {
        // Root-relative URL
        const parsed = new URL(currentUrl);
        resolved = parsed.origin + url;
      } else {
        // Path-relative URL
        const base = currentUrl.endsWith('/') ? currentUrl : currentUrl.substring(0, currentUrl.lastIndexOf('/') + 1);
        resolved = new URL(url, base).href;
      }
      
      return proxyBase + '/' + resolved;
    } catch (e) {
      console.warn('Failed to proxy URL:', url, e);
      return url;
    }
  }
  
  // Override fetch
  const originalFetch = window.fetch;
  window.fetch = function(input, init) {
    try {
      let url;
      if (typeof input === 'string') {
        url = input;
        return originalFetch(proxyUrl(url), init);
      } else if (input instanceof Request) {
        url = input.url;
        const proxied = proxyUrl(url);
        const newRequest = new Request(proxied, input);
        return originalFetch(newRequest, init);
      }
      return originalFetch(input, init);
    } catch (e) {
      return originalFetch(input, init);
    }
  };
  
  // Override XMLHttpRequest
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    try {
      const proxiedUrl = typeof url === 'string' ? proxyUrl(url) : url;
      return originalOpen.call(this, method, proxiedUrl, ...rest);
    } catch (e) {
      return originalOpen.call(this, method, url, ...rest);
    }
  };
  
  // Override window.open
  const originalWindowOpen = window.open;
  window.open = function(url, ...rest) {
    try {
      if (url) {
        return originalWindowOpen.call(this, proxyUrl(url), ...rest);
      }
      return originalWindowOpen.call(this, url, ...rest);
    } catch (e) {
      return originalWindowOpen.call(this, url, ...rest);
    }
  };
  
  // For history API, we DON'T proxy the URL because it causes SecurityError
  // The browser requires history URLs to match the current origin
  // Instead, we let the original code handle it - the page will still work
  // because navigation will be intercepted by our other hooks
  
  // We can monitor but not modify history API calls
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  
  // Just pass through without modification to avoid SecurityError
  // The actual navigation will be caught by our fetch/XHR interceptors
  
  // MutationObserver to handle dynamically added images and resources
  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        mutation.addedNodes.forEach(function(node) {
          if (node.nodeType === 1) { // Element node
            const element = node;
            
            // Handle img elements
            if (element.tagName === 'IMG') {
              const src = element.getAttribute('src');
              if (src && !isAlreadyProxied(src)) {
                element.setAttribute('src', proxyUrl(src));
              }
              const srcset = element.getAttribute('srcset');
              if (srcset) {
                const rewritten = srcset.split(',').map(part => {
                  const [url, descriptor] = part.trim().split(/\\s+/);
                  return proxyUrl(url) + (descriptor ? ' ' + descriptor : '');
                }).join(', ');
                element.setAttribute('srcset', rewritten);
              }
            }
            
            // Handle elements with src attribute
            if (element.getAttribute('src')) {
              const src = element.getAttribute('src');
              if (src && !isAlreadyProxied(src)) {
                element.setAttribute('src', proxyUrl(src));
              }
            }
            
            // Handle elements with href attribute
            if (element.getAttribute('href')) {
              const href = element.getAttribute('href');
              if (href && !isAlreadyProxied(href)) {
                element.setAttribute('href', proxyUrl(href));
              }
            }
            
            // Recursively handle child elements
            element.querySelectorAll && element.querySelectorAll('[src], [href], [srcset]').forEach(child => {
              const src = child.getAttribute('src');
              const href = child.getAttribute('href');
              const srcset = child.getAttribute('srcset');
              
              if (src && !isAlreadyProxied(src)) {
                child.setAttribute('src', proxyUrl(src));
              }
              if (href && !isAlreadyProxied(href)) {
                child.setAttribute('href', proxyUrl(href));
              }
              if (srcset) {
                const rewritten = srcset.split(',').map(part => {
                  const [url, descriptor] = part.trim().split(/\\s+/);
                  return proxyUrl(url) + (descriptor ? ' ' + descriptor : '');
                }).join(', ');
                child.setAttribute('srcset', rewritten);
              }
            });
          }
        });
      });
    });
    
    // Start observing
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }
  
})();
`;
