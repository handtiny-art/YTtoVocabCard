import React from 'react';

interface AppLogoProps {
  className?: string;
  size?: number | string;
}

export const AppLogo: React.FC<AppLogoProps> = ({ className = '', size = '100%' }) => {
  return (
    <svg 
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="YTtoVocab Logo"
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    >
      {/* Brand deep marine blue rounded squircle background */}
      <rect width="100" height="100" rx="26" fill="#0B4C8C" />
      
      {/* Scalable White Play Icon (Triangle with smooth corners) */}
      <path 
        d="M37.5 18 C37.5 16 39.5 14.5 41.5 15.5 L63.5 26.5 C65.5 27.5 65.5 30.5 63.5 31.5 L41.5 42.5 C39.5 43.5 37.5 42 37.5 40 Z" 
        fill="#FFFFFF" 
      />
      
      {/* Scalable Flat Stack of 3 White Cards */}
      {/* Card Layer 1 (Top Plate) */}
      <path 
        d="M50 50 C51.5 50 53.5 50.8 55 51.5 L79.5 61 C81.5 61.8 81.5 63.2 79.5 64 L55 73.5 C53.5 74.2 51.5 75 50 75 C48.5 75 46.5 74.2 45 73.5 L20.5 64 C18.5 63.2 18.5 61.8 20.5 61 L45 51.5 C46.5 50.8 48.5 50 50 50 Z" 
        fill="#FFFFFF" 
      />
      
      {/* Card Layer 2 (Middle Plate Edge) */}
      <path 
        d="M19 67 C18.3 66.5 18 65.8 18 65 L18 67 C18 67.8 18.3 68.5 19 69 L44.8 79.2 C48 80.5 52 80.5 55.2 79.2 L81 69 C81.7 68.5 82 67.8 82 67 L82 65 C82 65.8 81.7 66.5 81 67 L55.2 77.2 C52 78.5 48 78.5 44.8 77.2 Z" 
        fill="#FFFFFF" 
      />
      
      {/* Card Layer 3 (Bottom Plate Edge) */}
      <path 
        d="M19 74 C18.3 73.5 18 72.8 18 72 L18 74 C18 74.8 18.3 75.5 19 76 L44.8 86.2 C48 87.5 52 87.5 55.2 86.2 L81 76 C81.7 75.5 82 74.8 82 74 L82 72 C82 72.8 81.7 73.5 81 74 L55.2 84.2 C52 85.5 48 85.5 44.8 84.2 Z" 
        fill="#FFFFFF" 
      />
    </svg>
  );
};
