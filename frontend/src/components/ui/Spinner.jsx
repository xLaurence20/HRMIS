import { Loader2 } from 'lucide-react';

export default function Spinner({ className = 'h-4 w-4', label }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Loader2 className={`${className} animate-spin`} aria-hidden="true" />
      {label && <span>{label}</span>}
    </span>
  );
}