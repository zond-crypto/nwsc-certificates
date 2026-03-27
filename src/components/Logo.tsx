import React from 'react';

export const NkanaLogo = ({ className = "w-16 h-16" }: { className?: string }) => (
  <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className={className}>
    {/* Outer border */}
    <circle cx="100" cy="100" r="98" fill="#ffffff" stroke="#0000FF" strokeWidth="3"/>
    
    {/* Inner circle */}
    <circle cx="100" cy="100" r="65" fill="#b3e5fc" stroke="#0000FF" strokeWidth="1"/>
    
    {/* Text Paths */}
    <path id="topTextPath" d="M 18 100 A 82 82 0 0 1 182 100" fill="none" />
    <path id="bottomTextPath" d="M 18 100 A 82 82 0 0 0 182 100" fill="none" />
    
    <text fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="15" fill="#000" letterSpacing="1">
      <textPath href="#topTextPath" startOffset="50%" textAnchor="middle">NKANA WATER AND SEWERAGE</textPath>
    </text>
    <text fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="18" fill="#000" letterSpacing="2" dominantBaseline="hanging">
      <textPath href="#bottomTextPath" startOffset="50%" textAnchor="middle">COMPANY</textPath>
    </text>
    
    {/* Clip path for inner circle */}
    <clipPath id="innerClip">
      <circle cx="100" cy="100" r="65"/>
    </clipPath>
    
    <g clipPath="url(#innerClip)">
      {/* Ground */}
      <rect x="0" y="130" width="200" height="8" fill="#00FF00"/>
      <rect x="0" y="138" width="200" height="12" fill="#8B4513"/>
      
      {/* Water waves */}
      <rect x="0" y="150" width="200" height="50" fill="#00BFFF"/>
      <path d="M 0 155 Q 20 145 40 155 T 80 155 T 120 155 T 160 155 T 200 155" fill="none" stroke="#fff" strokeWidth="1.5"/>
      <path d="M 0 165 Q 20 155 40 165 T 80 165 T 120 165 T 160 165 T 200 165" fill="none" stroke="#fff" strokeWidth="1.5"/>
      <path d="M 0 175 Q 20 165 40 175 T 80 175 T 120 175 T 160 175 T 200 175" fill="none" stroke="#fff" strokeWidth="1.5"/>
      
      {/* Tap */}
      <path d="M 115 130 L 115 70 L 85 70 L 85 85 L 75 85 L 75 60 L 125 60 L 125 130 Z" fill="#808080"/>
      <rect x="95" y="50" width="10" height="10" fill="#FFD700"/>
      <rect x="85" y="45" width="30" height="5" fill="#FFD700"/>
      
      {/* Water drops */}
      <path d="M 80 95 Q 80 102 85 102 Q 90 102 90 95 L 85 88 Z" fill="#0000FF"/>
      <path d="M 80 110 Q 80 117 85 117 Q 90 117 90 110 L 85 103 Z" fill="#0000FF"/>
      
      {/* Bucket */}
      <polygon points="65,130 105,130 100,100 70,100" fill="#CC0000"/>
    </g>
  </svg>
);
