"use client";

import { createTheme } from "@mantine/core";

export const theme = createTheme({
  primaryColor: "crossweaveTeal",
  colors: {
    // The product palette comes directly from the four-lobed CrossWeave mark.
    // Mantine needs ten steps; the middle swatch is the exact logo teal.
    crossweaveTeal: [
      "#eefaf8", "#d9f2ee", "#bce7e1", "#94d7cf", "#69c3b9",
      "#45a99e", "#358f86", "#28746d", "#205d57", "#174743",
    ],
  },
});
