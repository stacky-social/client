import React from 'react';
import {BASE_URL} from "./DevMode";

const StackLogo = ({ size = 30, spacing = 10 }: { size?: number, spacing?: number }) => (
    <div style={{ display: 'flex', alignItems: 'center' }}>
        <a href={`${BASE_URL}`} style={{ display: 'inline-block' }}>
            <img
                src="/stacksLOGO.jpg"
                alt="MyProject Logo"
                style={{ width: size, height: size, marginRight: spacing }}
            />
        </a>
        <a href={`${BASE_URL}`} style={{ display: 'inline-block' }}>
            <img
                src="/stacks.png"
                alt="New Image"
                style={{ width: size * 3, height: size }}
            />
        </a>
    </div>
);





export default StackLogo;
