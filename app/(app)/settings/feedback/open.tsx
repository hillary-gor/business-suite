'use client';

import { useEffect } from 'react';
import { useFeedback } from '@/components/feedback/feedback-host';

export function FeedbackPageOpen() {
  const { open } = useFeedback();
  useEffect(() => {
    open();
  }, [open]);
  return null;
}
