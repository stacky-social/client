// app/layout.tsx
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "../styles/globals.css";
import { MantineProvider, ColorSchemeScript } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { theme } from "../../theme";
import { Suspense } from "react";
import SessionUrlTracker from "../components/SessionUrlTracker";

export const metadata = { title: "CrossWeave", description: "AI-Curated Democratic Discourse" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ overscrollBehaviorY: 'none' }} suppressHydrationWarning>
      <head>
        <ColorSchemeScript />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <MantineProvider theme={theme}>
          <Notifications />
          <Suspense fallback={null}>
            <SessionUrlTracker />
          </Suspense>
          {children}
        </MantineProvider>
      </body>
    </html>
  );
}
