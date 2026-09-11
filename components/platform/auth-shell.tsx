import type { ReactNode } from 'react';
import { PoweredBySurge } from '@/components/brand/company-logo';
import { SkyjetMark } from '@/components/platform/skyjet-mark';

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="signin">
      <aside className="signin__aside">
        <div>
          <SkyjetMark className="signin__aside-mark" size={72} />
          <p className="signin__aside-kicker">Skyjet ERP</p>
          <p className="signin__aside-title">One portal. One login.</p>
          <p className="signin__aside-copy">
            Skyjet Business Suite and Skyjet Library share the same account. After you sign in you
            choose where to work.
          </p>
        </div>
        <ul className="signin__aside-list">
          <li>Accounting, sales, purchases and reports</li>
          <li>Aircraft manuals, certificates and technical files</li>
        </ul>
      </aside>
      <div className="signin__stage">
        <div className="signin__panel">
          {children}
          <div className="signin__powered">
            <PoweredBySurge />
          </div>
        </div>
      </div>
    </main>
  );
}
