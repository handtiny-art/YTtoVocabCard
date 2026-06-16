import React, { useEffect, useRef } from 'react';

const ADSENSE_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT as string | undefined;

let scriptInjected = false;

function injectAdSenseScript(client: string) {
  if (scriptInjected || document.querySelector('script[data-adsense]')) return;
  scriptInjected = true;
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`;
  script.crossOrigin = 'anonymous';
  script.setAttribute('data-adsense', '1');
  document.head.appendChild(script);
}

interface AdBannerProps {
  slot: string;
  className?: string;
}

const AdBanner: React.FC<AdBannerProps> = ({ slot, className = '' }) => {
  const pushed = useRef(false);

  useEffect(() => {
    if (!ADSENSE_CLIENT) return;
    injectAdSenseScript(ADSENSE_CLIENT);
    if (pushed.current) return;
    pushed.current = true;
    try {
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch (e) {}
  }, []);

  if (!ADSENSE_CLIENT) {
    return (
      <div className={`w-full bg-slate-100 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center text-slate-400 text-xs font-bold py-5 ${className}`}>
        廣告位置
      </div>
    );
  }

  return (
    <ins
      className={`adsbygoogle ${className}`}
      style={{ display: 'block' }}
      data-ad-client={ADSENSE_CLIENT}
      data-ad-slot={slot}
      data-ad-format="auto"
      data-full-width-responsive="true"
    />
  );
};

export default AdBanner;
