import { useEffect, useState } from 'react';
import { api } from '../api/axiosClient';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { HardDrive, Loader2, Database } from 'lucide-react';
import Alert from '../components/ui/Alert';
import { useAuth } from '../context/AuthContext';

ChartJS.register(ArcElement, Tooltip, Legend);

export default function StorageMonitor() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [desc, setDesc] = useState(true);
  const [serverStats, setServerStats] = useState(null);
  const [seeding, setSeeding] = useState(false);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      api.get('/storage-stats'),
      api.get('/storage-server-stats').catch(() => null)
    ]).then(([resData, resStats]) => {
      setData(resData.data.data);
      if (resStats) setServerStats(resStats.data.data);
    }).catch((err) => {
      setError(err.response?.data?.error?.message || 'Error loading data');
    }).finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const handleSeed = async () => {
    setSeeding(true);
    await api.post('/storage-seed');
    loadData();
    setSeeding(false);
  };

  if (loading && !data) return <div className="p-8 text-center"><Loader2 className="animate-spin h-8 w-8 mx-auto text-brand-600" /></div>;
  if (error) return <div className="p-8"><Alert variant="error">{error}</Alert></div>;

  const fmt = (bytes) => {
    if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(3) + ' GB';
    if (bytes >= 1024 ** 2) return (bytes / 1024 ** 2).toFixed(2) + ' MB';
    return (bytes / 1024).toFixed(1) + ' KB';
  };

  const pct = (data.used / data.total) * 100;
  const level = pct >= 90 ? 'CRITICAL' : pct >= 80 ? 'WARNING' : 'NORMAL';
  const levelColor = pct >= 90 ? 'text-red-600' : pct >= 80 ? 'text-amber-600' : 'text-emerald-600';

  const sortedFiles = [...data.files].sort((a, b) => desc ? b.size - a.size : a.size - b.size);

  const chartData = {
    labels: ['Application files', 'Other used', 'Free'],
    datasets: [{
      data: [data.app, data.used - data.app, data.free],
      backgroundColor: ['#2563eb', '#f59e0b', '#e2e8f0'],
      borderWidth: 0,
    }]
  };

  return (
    <div className="mx-auto max-w-5xl p-6">
      
      {/* Top Header matching sample */}
      <div className="mb-6 overflow-hidden rounded-lg border border-slate-300 shadow-sm">
        <div className="flex items-center justify-between bg-slate-800 px-4 py-2 text-sm font-semibold text-white">
          <div className="flex items-center gap-2">
            <HardDrive className="h-4 w-4" /> Capstone Admin Console | Storage Monitor
          </div>
          <div>Signed in as: {user?.username}</div>
        </div>

        <div className="bg-white p-5">
          <h2 className="mb-4 text-base font-bold text-slate-800">Server storage and stored files</h2>
          
          {/* Chart and Summary block */}
          <div className="mb-6 rounded-lg border border-slate-200 p-4">
            <div className="flex items-center gap-8">
              <div className="h-40 w-40">
                <Doughnut data={chartData} options={{ cutout: '65%', plugins: { legend: { position: 'left', labels: { boxWidth: 12, font: { size: 10 } } } } }} />
              </div>
              <div>
                <p className="text-lg font-semibold text-slate-800">
                  {fmt(data.used)} of {fmt(data.total)} used ({pct.toFixed(1)}%) - <span className={levelColor}>{level}</span>.
                  Application files: {fmt(data.app)}
                </p>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 border-b border-slate-300">
                <tr>
                  <th className="px-3 py-2 font-semibold w-1/4">File</th>
                  <th className="px-3 py-2 font-semibold w-1/3">Path</th>
                  <th 
                    className="px-3 py-2 font-semibold cursor-pointer hover:bg-slate-200 transition w-1/6"
                    onClick={() => setDesc(!desc)}
                  >
                    Size ({desc ? 'largest first' : 'smallest first'})
                  </th>
                  <th className="px-3 py-2 font-semibold w-1/4">Modified</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sortedFiles.map((f, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-800">{f.name}</td>
                    <td className="px-3 py-2 text-slate-600">{f.path}</td>
                    <td className="px-3 py-2 font-mono text-slate-700">{fmt(f.size)}</td>
                    <td className="px-3 py-2 text-slate-500">{new Date(f.modified).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  </tr>
                ))}
                {sortedFiles.length === 0 && (
                  <tr>
                    <td colSpan="4" className="px-3 py-8 text-center text-slate-500">
                      <p className="mb-3">No files found in uploads folder.</p>
                      <button onClick={handleSeed} disabled={seeding} className="rounded bg-brand-600 px-4 py-2 text-white hover:bg-brand-700">
                        {seeding ? 'Generating...' : 'Generate Sample Files'}
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="bg-slate-100 px-4 py-2 text-xs text-slate-600 border-t border-slate-300">
          Logged in to Capstone as: {user?.username} (system administrator)
        </div>
      </div>

      {/* Terminal Outputs (Kept from previous step) */}
      {serverStats && (
        <div className="mt-8">
          <h2 className="mb-4 text-lg font-bold text-slate-800">Live Server Terminal Output</h2>
          
          <div className="mb-4 overflow-hidden rounded-lg border border-slate-800 bg-slate-900 shadow-md">
            <div className="bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300">$ df -h</div>
            <pre className="p-3 text-xs text-green-400 overflow-x-auto font-mono">{serverStats.df}</pre>
          </div>
          
          <div className="mb-4 overflow-hidden rounded-lg border border-slate-800 bg-slate-900 shadow-md">
            <div className="bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300">$ du -sh * | sort -rh</div>
            <pre className="p-3 text-xs text-green-400 overflow-x-auto font-mono">{serverStats.duBasic}</pre>
          </div>

           <div className="mb-4 overflow-hidden rounded-lg border border-slate-800 bg-slate-900 shadow-md">
            <div className="bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300">$ du -ah . | sort -rh | head -n 15</div>
            <pre className="p-3 text-xs text-green-400 overflow-x-auto font-mono">{serverStats.duTop15}</pre>
          </div>
        </div>
      )}
    </div>
  );
}