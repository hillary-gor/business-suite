import { DotsLoader } from '@/components/loading/dots-loader';

export default function AppLoading() {
  return (
    <div className="page-loading">
      <DotsLoader label="Loading" />
    </div>
  );
}
