import Script from 'next/script';
import { COLOR_MODE_KEY } from '@/lib/color-mode';

/** Runs before paint so the first frame already matches the stored or system theme. */
export function ColorModeScript() {
  const source = `(function(){try{var k=${JSON.stringify(COLOR_MODE_KEY)};var m=localStorage.getItem(k);if(m!=='light'&&m!=='dark'&&m!=='system')m='system';var d=m==='dark'||(m==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var t=d?'dark':'light';var e=document.documentElement;e.setAttribute('data-theme',t);e.setAttribute('data-color-mode',m);e.style.colorScheme=t;}catch(err){}})();`;
  return (
    <Script id="skyjet-color-mode" strategy="beforeInteractive">
      {source}
    </Script>
  );
}
