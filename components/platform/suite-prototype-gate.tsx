'use client';

import { useCallback, useEffect, useState } from 'react';
import { SuitePrototypeNotice } from '@/components/platform/suite-prototype-notice';
import { acknowledgeSuitePrototype, hasAcknowledgedSuitePrototype } from '@/lib/suite-prototype';

export function SuitePrototypeGate() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!hasAcknowledgedSuitePrototype()) setOpen(true);
  }, []);

  const onProceed = useCallback(() => {
    acknowledgeSuitePrototype();
    setOpen(false);
  }, []);

  if (!open) return null;
  return <SuitePrototypeNotice onProceed={onProceed} />;
}
