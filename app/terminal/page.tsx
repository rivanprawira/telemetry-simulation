"use client";

import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { EnhancedTerminal } from "@/components/enhanced-terminal"
import { useTelemetry } from "@/context/TelemetryContext"
import { UnifiedSerialConnection } from "@/components/unified-serial-connection"

import { TerminalApiBridge } from "@/components/TerminalApiBridge"
import { Button } from "@/components/ui/button"
import { Play, Square } from "lucide-react"
import { useSerialStore, getSessionState } from "@/lib/store"
import {
  FullPageContent,
  SidebarProvider,
} from "@/components/ui/sidebar"

// Connect Status Wrapper Component
function ConnectStatusWrapper() {
  return <UnifiedSerialConnection />;
}

export default function Page() {
  const { isSimulating, startSimulation, stopSimulation, telemetryData } = useTelemetry();
  const { isConnected: terminalConnected } = useSerialStore();
  

  const sendTelemetryData = async () => {
    if (!telemetryData) {
      alert('No telemetry data available. Please start simulation first.');
      return;
    }
    
    const sessionState = getSessionState();
    const port = sessionState.port;
    if (!port || !port.writable) {
      alert('Serial port not available or not writable. Please connect first.');
      return;
    }
  };

  return (
    <>
    <FullPageContent>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "calc(var(--spacing) * 48)",
            "--header-height": "calc(var(--spacing) * 12)",
          } as React.CSSProperties
        }
      >
        <SiteHeader />
        <AppSidebar variant="inset" />
        <div style={{ 
          marginLeft: 0, 
          marginTop: "var(--header-height)",
          padding: "1.5rem",
          flex: "1 1 auto",
          overflow: "auto",
          backgroundColor: "#0F172A"
        }}>
          <div className="flex h-full flex-col gap-6">
            {/* Connection Status */}
            <ConnectStatusWrapper />
            
            {/* Terminal Content */}
            <div className="flex-1">
              <EnhancedTerminal />
            </div>
          </div>
        </div>
      </SidebarProvider>
    </FullPageContent>
    </>
  );
}
