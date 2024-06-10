import React from 'react';

const StackLogo = ({ size = 30, spacing = 10 }: { size?: number, spacing?: number }) => (
  <div style={{ display: 'flex', alignItems: 'center' }}>
    <img 
      src="/stacksLOGO.jpg" 
      alt="MyProject Logo" 
      style={{ width: size, height: size, marginRight: spacing }}
    />
    <img 
      src="/stacks.png"  
      alt="New Image" 
      style={{ width: size*3, height: size }}
    />
  </div>
);

export default StackLogo;