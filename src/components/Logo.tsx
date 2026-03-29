import React from 'react';
import logo from '../assets/logo.png';

export const NkanaLogo = ({ className = "w-16 h-16" }: { className?: string }) => (
  <img 
    src={logo} 
    alt="Nkana Water and Sewerage Company" 
    className={className} 
  />
);
