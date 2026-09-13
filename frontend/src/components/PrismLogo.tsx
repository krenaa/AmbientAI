interface PrismLogoProps {
  className?: string;
  hasBorder?: boolean;
}

export default function PrismLogo({
  className = "h-8 w-8",
  hasBorder = true,
}: PrismLogoProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="2"
        y="2"
        width="60"
        height="60"
        rx="15"
        fill="#F5EBDD"
        stroke={hasBorder ? "#315B8C" : "none"}
        strokeWidth={hasBorder ? "2.5" : "0"}
      />
      <path d="M 32 12 L 14 52 L 25 52 L 32 34 Z" fill="#413333" />
      <path d="M 32 12 L 50 52 L 39 52 L 32 34 Z" fill="#315B8C" />
      <polygon points="32,28 41,45 23,45" fill="#F2765E" />
    </svg>
  );
}
