'use client';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, PointElement, LineElement, ArcElement, Filler } from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { TrendingUp, MapPin, PieChart } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, PointElement, LineElement, ArcElement, Filler);

const chartColors = {
  navy: { bg: 'rgba(30, 58, 95, 0.15)', border: 'rgb(30, 58, 95)' },
  amber: { bg: 'rgba(245, 158, 11, 0.15)', border: 'rgb(245, 158, 11)' },
  teal: { bg: 'rgba(20, 184, 166, 0.15)', border: 'rgb(20, 184, 166)' },
  rose: { bg: 'rgba(225, 29, 72, 0.15)', border: 'rgb(225, 29, 72)' },
  sky: { bg: 'rgba(14, 165, 233, 0.15)', border: 'rgb(14, 165, 233)' },
};

const doughnutPalette = [
  '#f59e0b', // amber
  '#1e3a5f', // navy
  '#14b8a6', // teal
  '#e11d48', // rose
  '#0ea5e9', // sky
];

const commonOptions = {
  responsive: true,
  maintainAspectRatio: true,
  plugins: {
    legend: {
      labels: {
        font: { family: 'Inter', size: 12, weight: '500' as const },
        color: '#5373a3',
        padding: 16,
        usePointStyle: true,
        pointStyleWidth: 8,
      },
    },
    tooltip: {
      backgroundColor: '#0f2035',
      titleFont: { family: 'Inter', size: 13, weight: '600' as const },
      bodyFont: { family: 'Inter', size: 12 },
      padding: 12,
      cornerRadius: 10,
      displayColors: true,
      boxPadding: 4,
    },
  },
  scales: {
    x: {
      grid: { color: 'rgba(169, 185, 209, 0.15)', drawBorder: false },
      ticks: { font: { family: 'Inter', size: 11 }, color: '#7e96ba' },
    },
    y: {
      grid: { color: 'rgba(169, 185, 209, 0.15)', drawBorder: false },
      ticks: { font: { family: 'Inter', size: 11 }, color: '#7e96ba' },
    },
  },
};

export default function AnalyticsCharts({ statusData, jurisdictionData, timelineData }: { statusData: Record<string, number>, jurisdictionData: Record<string, number>, timelineData: Record<string, number> }) {

  const barData = {
    labels: Object.keys(jurisdictionData),
    datasets: [{
      label: 'Reports by Jurisdiction',
      data: Object.values(jurisdictionData),
      backgroundColor: chartColors.navy.bg,
      borderColor: chartColors.navy.border,
      borderWidth: 2,
      borderRadius: 8,
      borderSkipped: false,
    }]
  };

  const lineData = {
    labels: Object.keys(timelineData).sort(),
    datasets: [{
      label: 'Reports Timeline',
      data: Object.keys(timelineData).sort().map(k => timelineData[k]),
      fill: true,
      backgroundColor: 'rgba(245, 158, 11, 0.08)',
      borderColor: chartColors.amber.border,
      borderWidth: 2.5,
      tension: 0.4,
      pointBackgroundColor: chartColors.amber.border,
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 6,
    }]
  };

  const donutData = {
    labels: Object.keys(statusData),
    datasets: [{
      data: Object.values(statusData),
      backgroundColor: doughnutPalette.slice(0, Object.keys(statusData).length),
      borderColor: '#ffffff',
      borderWidth: 3,
      hoverOffset: 8,
    }]
  };

  const donutOptions = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          font: { family: 'Inter', size: 12, weight: '500' as const },
          color: '#5373a3',
          padding: 20,
          usePointStyle: true,
          pointStyleWidth: 8,
        },
      },
      tooltip: {
        backgroundColor: '#0f2035',
        titleFont: { family: 'Inter', size: 13, weight: '600' as const },
        bodyFont: { family: 'Inter', size: 12 },
        padding: 12,
        cornerRadius: 10,
      },
    },
    cutout: '65%',
  };

  const charts = [
    {
      title: 'Reports Over Time',
      icon: TrendingUp,
      color: 'from-amber-400 to-amber-500',
      component: <Line data={lineData} options={commonOptions as any} />,
    },
    {
      title: 'Reports By Jurisdiction',
      icon: MapPin,
      color: 'from-navy-500 to-navy-700',
      component: <Bar data={barData} options={commonOptions as any} />,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {charts.map((chart, i) => {
          const Icon = chart.icon;
          return (
            <div key={i} className="glass-card rounded-2xl overflow-hidden shadow-glass">
              <div className={`h-1 bg-gradient-to-r ${chart.color}`} />
              <div className="p-6">
                <h2 className="text-base font-bold text-navy-800 mb-5 flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-navy-50 border border-navy-100 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-navy-500" />
                  </div>
                  {chart.title}
                </h2>
                {chart.component}
              </div>
            </div>
          );
        })}
      </div>

      {/* Doughnut - full width centered */}
      <div className="glass-card rounded-2xl overflow-hidden shadow-glass max-w-lg mx-auto">
        <div className="h-1 bg-gradient-to-r from-teal-400 to-emerald-500" />
        <div className="p-6">
          <h2 className="text-base font-bold text-navy-800 mb-5 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center">
              <PieChart className="w-4 h-4 text-teal-600" />
            </div>
            Status Breakdown
          </h2>
          <Doughnut data={donutData} options={donutOptions as any} />
        </div>
      </div>
    </div>
  );
}
