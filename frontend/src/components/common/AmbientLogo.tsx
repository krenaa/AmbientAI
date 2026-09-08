import React from "react";

interface AmbientLogoProps {
  className?: string;
}

export const AmbientLogo: React.FC<AmbientLogoProps> = ({ className = "w-6 h-6" }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      className={className}
    >
      <defs>
        <linearGradient id="ambLogoGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#06B6D4" />
          <stop offset="50%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
        <linearGradient id="ambLogoGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#10B981" />
          <stop offset="100%" stopColor="#06B6D4" />
        </linearGradient>
        <filter id="ambLogoGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      <rect
        x="2"
        y="2"
        width="60"
        height="60"
        rx="16"
        fill="#0D0E15"
        stroke="url(#ambLogoGrad1)"
        strokeWidth="1.5"
        strokeOpacity="0.7"
      />
      <polygon points="32,13 49,23 32,33 15,23" fill="url(#ambLogoGrad1)" fillOpacity="0.85" />
      <polygon points="15,23 32,33 32,51 15,41" fill="url(#ambLogoGrad2)" fillOpacity="0.9" />
      <polygon points="32,33 49,23 49,41 32,51" fill="url(#ambLogoGrad1)" fillOpacity="0.45" />
      <circle cx="32" cy="32.5" r="4" fill="#FFFFFF" filter="url(#ambLogoGlow)" />
      <circle cx="32" cy="32.5" r="2.2" fill="#06B6D4" />
      <circle cx="32" cy="13" r="1.8" fill="#38BDF8" />
      <circle cx="49" cy="23" r="1.8" fill="#818CF8" />
      <circle cx="49" cy="41" r="1.8" fill="#A78BFA" />
      <circle cx="32" cy="51" r="1.8" fill="#34D399" />
      <circle cx="15" cy="41" r="1.8" fill="#10B981" />
      <circle cx="15" cy="23" r="1.8" fill="#38BDF8" />
    </svg>
  );
};
