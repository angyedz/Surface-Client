import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  CartesianGrid,
} from 'recharts';
import { Clock, TrendingUp, Calendar, Zap } from 'lucide-react';
import { WeeklyPlaytimeDay } from '../types/launcher';

interface PlaytimeChartProps {
  data: WeeklyPlaytimeDay[];
}

export const PlaytimeChart: React.FC<PlaytimeChartProps> = ({ data }) => {
  const totalMinutes = data.reduce((acc, curr) => acc + curr.minutes, 0);
  const totalHours = (totalMinutes / 60).toFixed(1);
  const avgMinutes = Math.round(totalMinutes / (data.length || 1));
  const peakDay = [...data].sort((a, b) => b.minutes - a.minutes)[0];

  const formatHoursMinutes = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}m`;
    return `${h}h ${m}m`;
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const dayData = payload[0].payload as WeeklyPlaytimeDay;
      return (
        <div className="bg-neutral-900 border border-neutral-700/80 p-3 rounded-xl shadow-2xl space-y-1 text-xs font-mono">
          <div className="font-bold text-neutral-100 flex items-center justify-between gap-4">
            <span>{dayData.dayName || dayData.day}</span>
            <span className="text-[10px] text-neutral-400">{dayData.fullDate}</span>
          </div>
          <div className="text-primary-400 font-bold text-sm">
            {formatHoursMinutes(dayData.minutes)}
          </div>
          <div className="text-[11px] text-neutral-400 flex items-center gap-1 pt-1 border-t border-neutral-800">
            <span>{dayData.sessions} launch {dayData.sessions === 1 ? 'session' : 'sessions'}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="p-5 rounded-2xl bg-neutral-900/80 border border-neutral-800/90 shadow-xl space-y-4">
      {/* Header and Summary stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-500/20 border border-primary-500/40 flex items-center justify-center text-primary-400">
            <Clock size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-neutral-100 font-['Chakra_Petch'] uppercase tracking-wider">
              WEEKLY MINECRAFT ACTIVITY
            </h3>
            <p className="text-xs text-neutral-400">
              Instance playtime telemetry across the past 7 days
            </p>
          </div>
        </div>

        {/* Quick Highlights */}
        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="px-3 py-1.5 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center gap-2">
            <span className="text-neutral-500">Weekly Total:</span>
            <span className="font-bold text-primary-400">{totalHours}h ({totalMinutes}m)</span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-neutral-950 border border-neutral-800 hidden md:flex items-center gap-2">
            <span className="text-neutral-500">Peak Day:</span>
            <span className="font-bold text-primary-300">{peakDay?.day || 'None'}</span>
          </div>
        </div>
      </div>

      {/* Recharts Bar Chart */}
      <div className="h-48 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
            <XAxis
              dataKey="day"
              stroke="#737373"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#404040' }}
            />
            <YAxis
              stroke="#737373"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}m`}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(16, 185, 129, 0.07)' }} />
            <Bar dataKey="minutes" radius={[6, 6, 0, 0]}>
              {data.map((entry, index) => {
                const isPeak = entry.minutes === peakDay?.minutes;
                return (
                  <Cell
                    key={`cell-${index}`}
                    fill={isPeak ? '#10b981' : '#14b8a6'}
                    opacity={isPeak ? 1 : 0.75}
                  />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Footer Metrics */}
      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-neutral-800/80 text-center font-mono">
        <div className="p-2 rounded-xl bg-neutral-950/60 border border-neutral-800/60">
          <div className="text-[10px] text-neutral-500 uppercase">Avg Daily Session</div>
          <div className="text-xs font-bold text-neutral-200 mt-0.5">{avgMinutes} min</div>
        </div>
        <div className="p-2 rounded-xl bg-neutral-950/60 border border-neutral-800/60">
          <div className="text-[10px] text-neutral-500 uppercase">Total Sessions</div>
          <div className="text-xs font-bold text-neutral-200 mt-0.5">
            {data.reduce((acc, d) => acc + d.sessions, 0)} launches
          </div>
        </div>
        <div className="p-2 rounded-xl bg-neutral-950/60 border border-neutral-800/60">
          <div className="text-[10px] text-neutral-500 uppercase">Client Status</div>
          <div className="text-xs font-bold text-primary-400 mt-0.5 flex items-center justify-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-pulse" />
            Synchronized
          </div>
        </div>
      </div>
    </div>
  );
};
