import { DotsLoader } from '@/components/loading/dots-loader';

export default function LibraryLoading() {
  return (
    <div className="page-loading">
      <DotsLoader label="Loading the library" />
    </div>
  );
}
