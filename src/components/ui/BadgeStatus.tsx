import { STATUS_META, type StatusAbsensi } from '../../types';

interface BadgeStatusProps {
  status: StatusAbsensi;
  display?: 'label' | 'code' | 'both';
  size?: 'sm' | 'md';
  className?: string;
}

export function BadgeStatus({
  status,
  display = 'label',
  size = 'md',
  className = '',
}: BadgeStatusProps) {
  const meta = STATUS_META[status];
  const sizeClass =
    size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs sm:text-sm';

  let text: string = meta.label;
  if (display === 'code') text = meta.code;
  if (display === 'both') text = `${meta.code} · ${meta.label}`;

  return (
    <span
      style={{
        color: meta.textColor,
        backgroundColor: meta.bgColor,
        borderColor: meta.borderColor,
      }}
      className={`inline-flex items-center justify-center font-semibold rounded-lg border leading-none whitespace-nowrap ${sizeClass} ${className}`}
    >
      {text}
    </span>
  );
}
