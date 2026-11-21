'use client';

import React, { useEffect, useRef } from 'react';

interface TurnstileGlobal {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      theme?: 'light' | 'dark' | 'auto';
      callback?: (token: string) => void;
      'expired-callback'?: () => void;
      'error-callback'?: () => void;
    }
  ) => string;
  remove?: (widgetId: string) => void;
}

const TURNSTILE_SITE_KEY = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '').trim();

export interface TurnstileWidgetProps {
  onToken: (token: string) => void;
  className?: string;
}

/**
 * Loads Cloudflare Turnstile (`https://challenges.cloudflare.com/turnstile/v0/api.js`)
 * ONLY when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is configured; renders nothing otherwise.
 */
export function TurnstileWidget({ onToken, className = '' }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || typeof window === 'undefined') {
      return;
    }

    let cancelled = false;
    let widgetId: string | null = null;

    const mountWidget = () => {
      if (cancelled || !containerRef.current) return;
      const ts = (window as unknown as { turnstile?: TurnstileGlobal }).turnstile;
      if (!ts?.render) return;
      containerRef.current.innerHTML = '';
      widgetId = ts.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: 'light',
        callback: (tok) => {
          if (!cancelled) onTokenRef.current(tok);
        },
        'expired-callback': () => {
          if (!cancelled) onTokenRef.current('');
        },
        'error-callback': () => {
          if (!cancelled) onTokenRef.current('');
        },
      });
    };

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-itinbee-turnstile="1"]'
    );
    const tsNow = (window as unknown as { turnstile?: TurnstileGlobal }).turnstile;
    if (tsNow?.render) {
      mountWidget();
    } else if (existingScript) {
      existingScript.addEventListener('load', mountWidget, { once: true });
    } else {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset.itinbeeTurnstile = '1';
      script.addEventListener('load', mountWidget, { once: true });
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      const ts = (window as unknown as { turnstile?: TurnstileGlobal }).turnstile;
      if (widgetId && ts?.remove) {
        try {
          ts.remove(widgetId);
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  if (!TURNSTILE_SITE_KEY) {
    return null;
  }

  return <div ref={containerRef} className={`min-h-[65px] ${className}`.trim()} />;
}
