export default function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <svg viewBox="0 0 40 40" width="38" height="38" aria-hidden="true">
        <rect width="40" height="40" rx="13" fill="currentColor" />
        <path
          d="M11 27 19 11h3l7 16h-5l-1.5-4h-8L13 27Zm5-8h5l-2.4-6Z"
          fill="#fff"
        />
        <circle cx="29" cy="11" r="3" fill="#d8ccff" />
      </svg>
      {!compact && (
        <span>
          Averiq<span className="brand-light"> Chat</span>
        </span>
      )}
    </div>
  );
}
