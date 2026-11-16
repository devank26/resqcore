import React from 'react';
import { useApp } from './context/AppContext';
import { Sidebar } from './components/common/Sidebar';
import { Topbar } from './components/common/Topbar';
import { ToastContainer } from './components/common/ToastContainer';
import { Login } from './pages/Login';
import { CommandCenter } from './pages/CommandCenter';
import { LiveMapPage } from './pages/LiveMapPage';
import { IncidentsPage } from './pages/IncidentsPage';
import { TeamsPage } from './pages/TeamsPage';
import { ReportsPage } from './pages/ReportsPage';
import { CommunicationPage } from './pages/CommunicationPage';
import { SettingsPage } from './pages/SettingsPage';
import { OSPanel } from './components/os/OSPanel';
import { SchedulerLabPage } from './components/os/SchedulerLabPage';

export const App = () => {
  const { isAuthenticated, authChecking, activeTab, isDemoMode } = useApp();

  if (authChecking) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100vw', height: '100vh', backgroundColor: '#070C16', color: '#94A3B8', fontSize: '14px' }}>
        Restoring ResQCore session...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  const opBreadcrumb = isDemoMode ? 'OPERATIONS / KERALA' : 'OPERATIONS / UTTARAKHAND';

  const titles = {
    'command-center': { title: 'Command Center', breadcrumb: opBreadcrumb },
    'live-map': { title: 'Live Map', breadcrumb: opBreadcrumb },
    'incidents': { title: 'Incidents', breadcrumb: opBreadcrumb },
    'teams': { title: 'Teams', breadcrumb: opBreadcrumb },
    'reports': { title: 'Reports', breadcrumb: opBreadcrumb },
    'os-engine': { title: 'OS Monitor', breadcrumb: opBreadcrumb },
    'scheduler-lab': { title: 'Scheduler Lab', breadcrumb: opBreadcrumb },
    'communication': { title: 'Communication', breadcrumb: opBreadcrumb },
    'settings': { title: 'Settings', breadcrumb: opBreadcrumb }
  };

  const currentMeta = titles[activeTab] || titles['command-center'];

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* Global Sidebar Navigation */}
      <Sidebar />

      {/* Main Content Area */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          overflow: 'hidden',
          backgroundColor: '#070C16'
        }}
      >
        <Topbar title={currentMeta.title} breadcrumb={currentMeta.breadcrumb} />

        <main style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
          {activeTab === 'command-center' && <CommandCenter />}
          {activeTab === 'live-map' && <LiveMapPage />}
          {activeTab === 'incidents' && <IncidentsPage />}
          {activeTab === 'teams' && <TeamsPage />}
          {activeTab === 'reports' && <ReportsPage />}
          {activeTab === 'os-engine' && <OSPanel />}
          {activeTab === 'scheduler-lab' && <SchedulerLabPage />}
          {activeTab === 'communication' && <CommunicationPage />}
          {activeTab === 'settings' && <SettingsPage />}
        </main>
      </div>

      {/* Floating Tactical Toasts */}
      <ToastContainer />
    </div>
  );
};

export default App;
