import { useState } from 'react';
import { ShieldCheck, LogOut, FileText, QrCode, UserCheck, Users, Building2, Printer } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import { ConfirmDialog } from '@/components/Dialog';
import { AdminReports } from './AdminReports';
import { AdminQrPoints } from './AdminQrPoints';
import { AdminPrintQr } from './AdminPrintQr';
import { AdminApproval } from './AdminApproval';
import { AdminOfficers } from './AdminOfficers';
import { AdminBranches } from './AdminBranches';

type Tab = 'reports' | 'qr' | 'print' | 'approval' | 'officers' | 'branches';

const tabs: { id: Tab; label: string; icon: typeof FileText }[] = [
  { id: 'reports', label: 'Laporan', icon: FileText },
  { id: 'qr', label: 'QR Titik', icon: QrCode },
  { id: 'print', label: 'Cetak QR', icon: Printer },
  { id: 'approval', label: 'Persetujuan', icon: UserCheck },
  { id: 'officers', label: 'Petugas', icon: Users },
  { id: 'branches', label: 'Cabang', icon: Building2 },
];

export function AdminApp() {
  const { user, signOut } = useAuth();
  const { show } = useToast();
  const [tab, setTab] = useState<Tab>('approval');
  const [showLogout, setShowLogout] = useState(false);
  const [approvalCount, setApprovalCount] = useState(0);

  return (
    <div className="min-h-screen bg-kertas flex flex-col max-w-[1080px] mx-auto">
      <header className="bg-tinta text-kertas sticky top-0 z-30 no-print">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={22} className="text-aksen" />
            <div>
              <p className="font-semibold text-sm leading-tight">Patroli · Admin</p>
              <p className="text-[11px] text-kertas/60 leading-tight">{user?.email}</p>
            </div>
          </div>
          <button onClick={() => setShowLogout(true)} className="btn-touch p-2 rounded hover:bg-tintasoft" aria-label="Keluar">
            <LogOut size={18} />
          </button>
        </div>
        <nav className="px-2 overflow-x-auto">
          <div className="flex gap-1 min-w-max pb-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`btn-touch flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors relative ${
                  tab === t.id ? 'bg-aksen text-white' : 'text-kertas/70 hover:bg-tintasoft'
                }`}
              >
                <t.icon size={15} />
                {t.label}
                {t.id === 'approval' && approvalCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-bahaya text-white text-[9px] rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                    {approvalCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </nav>
      </header>

      <main className="flex-1 py-4">
        {tab === 'reports' && <AdminReports />}
        {tab === 'qr' && <AdminQrPoints />}
        {tab === 'print' && <AdminPrintQr />}
        {tab === 'approval' && <AdminApproval onCountChange={setApprovalCount} />}
        {tab === 'officers' && <AdminOfficers />}
        {tab === 'branches' && <AdminBranches />}
      </main>

      <ConfirmDialog
        open={showLogout}
        title="Keluar?"
        message="Anda akan keluar dari akun admin."
        confirmLabel="Keluar"
        onConfirm={async () => { setShowLogout(false); await signOut(); }}
        onCancel={() => setShowLogout(false)}
      />
    </div>
  );
}
