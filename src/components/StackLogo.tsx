import React from 'react';

const StackLogo = ({ size = 30 }: { size?: number }) => (
  <img 
    src="/stacksLOGO.jpg" 
    alt="MyProject Logo" 
    style={{ width: size, height: size }}
  />
);

export default StackLogo;