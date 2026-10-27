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
        <rect width="24" height="24" rx="7" fill="#8064c7" />
        <path
          d="m5 18 7-13 7 13M8 13h8"
          stroke="#fff"
          strokeWidth="1.5"
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
