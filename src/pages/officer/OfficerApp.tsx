import { useState } from 'react';
import { ShieldCheck, LogOut, Home, ClipboardList, FileText } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { OfficerHome } from './OfficerHome';
import { OfficerPatrol } from './OfficerPatrol';
import { OfficerReports } from './OfficerReports';
import { ConfirmDialog } from '@/components/Dialog';

type Tab = 'home' | 'reports';

export function OfficerApp() {
  const { user, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>('home');
  const [activePatrolId, setActivePatrolId] = useState<string | null>(null);
  const [showLogout, setShowLogout] = useState(false);

  if (activePatrolId) {
    return (
      <>
        <OfficerPatrol patrolId={activePatrolId} onExit={() => setActivePatrolId(null)} />
        <ConfirmDialog
          open={showLogout}
          title="Keluar?"
          message="Anda akan keluar dari akun."
          confirmLabel="Keluar"
          onConfirm={async () => { setShowLogout(false); await signOut(); }}
          onCancel={() => setShowLogout(false)}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-kertas flex flex-col max-w-[720px] mx-auto">
      <header className="bg-tinta text-kertas sticky top-0 z-30 no-print">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={22} className="text-aksen" />
            <div>
              <p className="font-semibold text-sm leading-tight">Patroli</p>
              <p className="text-[11px] text-kertas/60 leading-tight">{user?.profile?.full_name} · NPK {user?.profile?.npk}</p>
            </div>
          </div>
          <button onClick={() => setShowLogout(true)} className="btn-touch p-2 rounded hover:bg-tintasoft" aria-label="Keluar">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="flex-1 pb-16">
        {tab === 'home' && <OfficerHome onOpenPatrol={(id) => setActivePatrolId(id)} />}
        {tab === 'reports' && <OfficerReports />}
      </main>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[720px] bg-white border-t border-border no-print z-30">
        <div className="flex">
          <button
            onClick={() => setTab('home')}
            className={`flex-1 btn-touch flex flex-col items-center gap-0.5 py-2 text-xs ${tab === 'home' ? 'text-aksen' : 'text-tintalight'}`}
          >
            <Home size={20} /> Beranda
          </button>
          <button
            onClick={() => setTab('reports')}
            className={`flex-1 btn-touch flex flex-col items-center gap-0.5 py-2 text-xs ${tab === 'reports' ? 'text-aksen' : 'text-tintalight'}`}
          >
            <FileText size={20} /> Laporan Saya
          </button>
        </div>
      </nav>

      <ConfirmDialog
        open={showLogout}
        title="Keluar?"
        message="Anda akan keluar dari akun."
        confirmLabel="Keluar"
        onConfirm={async () => { setShowLogout(false); await signOut(); }}
        onCancel={() => setShowLogout(false)}
      />
    </div>
  );
}
