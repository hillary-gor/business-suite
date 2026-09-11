'use client';

import { useLibraryUpload } from '@/app/library/library-chrome';

export function LibraryUploadButton({
  children = 'Upload document',
  className = 'button button--primary',
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  const { mayUpload, openUpload } = useLibraryUpload();
  if (!mayUpload) return null;
  return (
    <button type="button" className={className} onClick={openUpload}>
      {children}
    </button>
  );
}
