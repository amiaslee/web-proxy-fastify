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
        // Only proxy if not already proxied
        if (!isAlreadyProxied(url)) {
          url = proxyUrl(url);
        }
        return originalFetch(url, init);
      } else if (input instanceof Request) {
        url = input.url;
        // Only proxy if not already proxied
        if (!isAlreadyProxied(url)) {
          const proxied = proxyUrl(url);
          const newRequest = new Request(proxied, input);
          return originalFetch(newRequest, init);
        }
        return originalFetch(input, init);
      }
      return originalFetch(input, init);
    } catch (e) {
      console.error('Fetch proxy error:', e);
      return originalFetch(input, init);
    }
  };
  
  // Override XMLHttpRequest
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    try {
      if (typeof url === 'string' && !isAlreadyProxied(url)) {
        url = proxyUrl(url);
      }
      return originalOpen.call(this, method, url, ...rest);
    } catch (e) {
      console.error('XHR proxy error:', e);
      return originalOpen.call(this, method, url, ...rest);
    }
  };
  
  // Intercept window.open
  const originalWindowOpen = window.open;
  window.open = function(url, target, features) {
    if (url && typeof url === 'string' && !isAlreadyProxied(url)) {
      url = proxyUrl(url);
    }
    return originalWindowOpen.call(window, url, target, features);
  };
  
  // Intercept location changes
  ['assign', 'replace'].forEach(method => {
    const original = window.location[method];
    window.location[method] = function(url) {
      if (!isAlreadyProxied(url)) {
        url = proxyUrl(url);
      }
      return original.call(window.location, url);
    };
  });
  
  // Intercept form submissions
  document.addEventListener('submit', function(e) {
    const form = e.target;
    if (form && form.tagName === 'FORM') {
      let action = form.getAttribute('action');
      
      console.log('[Proxy] Form submit intercepted, original action:', action);
      
      // If form has an action
      if (action && !isAlreadyProxied(action)) {
        const proxiedAction = proxyUrl(action);
        console.log('[Proxy] Rewriting form action to:', proxiedAction);
        form.setAttribute('action', proxiedAction);
      } else if (!action || action === '') {
        // If no action, form submits to current URL
        const currentProxied = proxyBase + '/' + getCurrentProxiedUrl();
        console.log('[Proxy] No action, using current URL:', currentProxied);
        form.setAttribute('action', currentProxied);
      } else {
        console.log('[Proxy] Form action already proxied');
      }
    }
  }, true); // Use capture phase to intercept before form actually submits
  
  // Intercept link clicks for SPA navigation (like YouTube)
  document.addEventListener('click', function(e) {
    let target = e.target;
    
    // Find the closest anchor element
    while (target && target.tagName !== 'A') {
      target = target.parentElement;
      if (!target || target === document.body) return;
    }
    
    if (target && target.tagName === 'A') {
      const href = target.getAttribute('href');
      if (href && !isAlreadyProxied(href) && !href.startsWith('#') && !href.startsWith('javascript:')) {
        const proxiedHref = proxyUrl(href);
        console.log('[Proxy] Rewriting link href from:', href, 'to:', proxiedHref);
        target.setAttribute('href', proxiedHref);
      }
    }
  }, true);
  
  // Intercept History API to maintain proxy URL format
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  
  history.pushState = function(state, title, url) {
    if (url) {
      // If URL is relative or doesn't have proxy prefix, keep it as-is for the original call
      // but ensure our proxy URL format is maintained in the address bar
      const currentProxied = proxyBase + '/' + getCurrentProxiedUrl();
      
      // Parse the new URL relative to current proxied URL
      let newUrl = url.toString();
      if (!newUrl.startsWith(proxyBase)) {
        try {
          // Resolve relative URL
          if (newUrl.startsWith('/')) {
            const parsed = new URL(getCurrentProxiedUrl());
            newUrl = proxyBase + '/' + parsed.origin + newUrl;
          } else if (newUrl.startsWith('http://') || newUrl.startsWith('https://')) {
            newUrl = proxyBase + '/' + newUrl;
          } else if (newUrl.startsWith('?') || newUrl.startsWith('#')) {
            // Query string or hash - append to current path
            const base = window.location.pathname;
            newUrl = base + newUrl;
          } else {
            // Path-relative
            const base = window.location.pathname;
            const lastSlash = base.lastIndexOf('/');
            newUrl = base.substring(0, lastSlash + 1) + newUrl;
          }
        } catch (e) {
          console.warn('[Proxy] Failed to resolve history URL:', url, e);
        }
      }
      
      console.log('[Proxy] pushState:', url, '→', newUrl);
      return originalPushState.call(history, state, title, newUrl);
    }
    return originalPushState.call(history, state, title, url);
  };
  
  history.replaceState = function(state, title, url) {
    if (url) {
      const currentProxied = proxyBase + '/' + getCurrentProxiedUrl();
      
      let newUrl = url.toString();
      if (!newUrl.startsWith(proxyBase)) {
        try {
          if (newUrl.startsWith('/')) {
            const parsed = new URL(getCurrentProxiedUrl());
            newUrl = proxyBase + '/' + parsed.origin + newUrl;
          } else if (newUrl.startsWith('http://') || newUrl.startsWith('https://')) {
            newUrl = proxyBase + '/' + newUrl;
          } else if (newUrl.startsWith('?') || newUrl.startsWith('#')) {
            const base = window.location.pathname;
            newUrl = base + newUrl;
          } else {
            const base = window.location.pathname;
            const lastSlash = base.lastIndexOf('/');
            newUrl = base.substring(0, lastSlash + 1) + newUrl;
          }
        } catch (e) {
          console.warn('[Proxy] Failed to resolve history URL:', url, e);
        }
      }
      
      console.log('[Proxy] replaceState:', url, '→', newUrl);
      return originalReplaceState.call(history, state, title, newUrl);
    }
    return originalReplaceState.call(history, state, title, url);
  };
  
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
                  const trimmed = part.trim();
                  const spaceIndex = trimmed.search(/\s/);
                  if (spaceIndex > 0) {
                    const url = trimmed.substring(0, spaceIndex);
                    const descriptor = trimmed.substring(spaceIndex);
                    return proxyUrl(url) + descriptor;
                  } else {
                    return proxyUrl(trimmed);
                  }
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
