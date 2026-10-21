import { useEffect, useState } from 'react';
import { api } from '../api/axiosClient';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { HardDrive, Loader2 } from 'lucide-react';
import Alert from '../components/ui/Alert';

ChartJS.register(ArcElement, Tooltip, Legend);

export default function StorageMonitor() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [desc, setDesc] = useState(true); // R3: Sort largest first by default
  const [serverStats, setServerStats] = useState(null); // Terminal stats state

  useEffect(() => {
    // 1. Fetch the file list
    api.get('/storage-stats')
      .then((res) => setData(res.data.data))
      .catch((err) => setError(err.response?.data?.error?.message || 'Error loading data'))
      .finally(() => setLoading(false));

    // 2. Fetch the live server terminal output (df, du)
    api.get('/storage-server-stats')
      .then((res) => setServerStats(res.data.data))
      .catch((err) => console.error("Terminal stats error", err));
  }, []);

  if (loading) return <div className="p-8 text-center"><Loader2 className="animate-spin h-8 w-8 mx-auto text-brand-600" /></div>;
  if (error) return <div className="p-8"><Alert variant="error">{error}</Alert></div>;

  const fmt = (bytes) => {
    if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(3) + ' GB';
    if (bytes >= 1024 ** 2) return (bytes / 1024 ** 2).toFixed(2) + ' MB';
    return (bytes / 1024).toFixed(1) + ' KB';
  };

  // R5: Warning levels
  const pct = (data.used / data.total) * 100;
  const level = pct >= 90 ? 'CRITICAL' : pct >= 80 ? 'WARNING' : 'NORMAL';
  const levelColor = pct >= 90 ? 'text-red-600' : pct >= 80 ? 'text-amber-600' : 'text-emerald-600';

  // R3: Sort logic
  const sortedFiles = [...data.files].sort((a, b) => desc ? b.size - a.size : a.size - b.size);

  // Chart Data (R4)
  const chartData = {
    labels: ['Application files', 'Other used', 'Free'],
    datasets: [{
      data: [data.app, data.used - data.app, data.free],
      backgroundColor: ['#2563eb', '#f59e0b', '#e2e8f0'],
      borderWidth: 0,
    }]
  };

  return (
    <div className="mx-auto max-w-5xl p-8">
      <header className="mb-6 flex items-center gap-3">
        <HardDrive className="h-8 w-8 text-brand-600" />
        <div>
          <h1 className="text-2xl font-bold">Admin Storage Monitor</h1>
          <p className="text-sm text-slate-500">Server storage and stored files</p>
        </div>
      </header>

      {/* R4 & R5: Chart and Summary */}
      <div className="mb-8 flex items-center gap-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="h-48 w-48">
          <Doughnut data={chartData} options={{ cutout: '70%' }} />
        </div>
        <div>
          <p className="text-2xl font-semibold text-slate-800">
            {fmt(data.used)} of {fmt(data.total)} used ({pct.toFixed(1)}%)
            <span className={`ml-3 font-bold ${levelColor}`}>- {level}</span>
          </p>
          <p className="mt-2 text-slate-500">
            Application files: <span className="font-semibold">{fmt(data.app)}</span>
          </p>
        </div>
      </div>

      {/* R2 & R3: Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3">File</th>
              <th className="px-4 py-3">Path</th>
              <th 
                className="px-4 py-3 cursor-pointer hover:bg-slate-200 transition"
                onClick={() => setDesc(!desc)}
              >
                Size ({desc ? 'largest first' : 'smallest first'})
              </th>
              <th className="px-4 py-3">Modified</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedFiles.map((f, i) => (
              <tr key={i} className="hover:bg-slate-50">
                {/* R6: textContent equivalent is safe in React by default (avoids XSS) */}
                <td className="px-4 py-3 font-medium text-slate-800">{f.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{f.path}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-700">{fmt(f.size)}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{new Date(f.modified).toLocaleString()}</td>
              </tr>
            ))}
            {sortedFiles.length === 0 && (
              <tr><td colSpan="4" className="px-4 py-8 text-center text-slate-500">No files found in uploads folder.</td></tr>
            )}
          </tbody>
        </table>
      </div>

            {/* LIVE SERVER TERMINAL EVIDENCE (Part A) */}
      {serverStats && (
        <div className="mt-12">
          <h2 className="mb-4 text-xl font-bold text-slate-800">Live Server Terminal Output (Part A Evidence)</h2>
          <p className="mb-6 text-sm text-slate-500">These commands are executed live on the Render hosting server.</p>
          
          {/* df -h */}
          <div className="mb-6 overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-lg">
            <div className="flex items-center bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300">
              $ df -h (Live Server Capacity)
            </div>
            <pre className="p-4 text-sm text-green-400 overflow-x-auto font-mono">{serverStats.df}</pre>
          </div>

          {/* df -i */}
          <div className="mb-6 overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-lg">
            <div className="flex items-center bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300">
              $ df -i (Live Server Inodes)
            </div>
            <pre className="p-4 text-sm text-green-400 overflow-x-auto font-mono">{serverStats.dfi}</pre>
          </div>

          {/* du -sh * */}
          <div className="mb-6 overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-lg">
            <div className="flex items-center bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300">
              $ du -sh * (Overall Directory Sizes)
            </div>
            <pre className="p-4 text-sm text-green-400 overflow-x-auto font-mono">{serverStats.duBasic}</pre>
          </div>

          {/* du -ah | sort -rh | head -n 15 */}
          <div className="mb-6 overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-lg">
            <div className="flex items-center bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300">
              $ du -ah . | sort -rh | head -n 15 (Top 15 Largest Files & Folders)
            </div>
            <pre className="p-4 text-sm text-green-400 overflow-x-auto font-mono">{serverStats.duTop15}</pre>
          </div>

          {/* find files > 10M */}
          <div className="mb-6 overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-lg">
            <div className="flex items-center bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300">
              $ find . -type f -size +10M -exec ls -lh {"{}"} + (Files larger than 10MB)
            </div>
            <pre className="p-4 text-sm text-green-400 overflow-x-auto font-mono">
              {serverStats.findLarge.trim() === '' ? 'No files larger than 10MB found.' : serverStats.findLarge}
            </pre>
          </div>

          
                    {/* Proof of Environment */}
          <div className="mb-6 overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-lg">
            <div className="flex items-center bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300">
              $ whoami (Current User on Server)
            </div>
            <pre className="p-4 text-sm text-green-400 overflow-x-auto font-mono">{serverStats.whoami}</pre>
          </div>

          <div className="mb-6 overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-lg">
            <div className="flex items-center bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300">
              $ env | grep -i render (Render Environment Variables)
            </div>
            <pre className="p-4 text-sm text-green-400 overflow-x-auto font-mono">{serverStats.env}</pre>
          </div>

        </div>
      )}
    </div>
  );
}