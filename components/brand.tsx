export default function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <svg
        viewBox="0 0 24 24"
        width="24"
        height="24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="m4 19 8-15 8 15M7 14h10"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {!compact && (
        <span>
          Averiq<span className="brand-light"> Chat</span>
        </span>
      )}
    </div>
  );
}
