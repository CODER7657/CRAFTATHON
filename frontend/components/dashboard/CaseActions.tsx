'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { UserCheck, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

export default function CaseActions({ performAction }: { performAction: (actionType: string) => Promise<void> }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleAction = (type: string) => {
    startTransition(async () => {
      await performAction(type);
      router.refresh();
    });
  };

  const actions = [
    {
      type: 'assign',
      label: 'Assign to Self',
      pendingLabel: 'Assigning...',
      icon: UserCheck,
      className: 'btn-info w-full',
    },
    {
      type: 'escalate',
      label: 'Escalate Case',
      pendingLabel: 'Escalating...',
      icon: AlertTriangle,
      className: 'btn-danger w-full',
    },
    {
      type: 'resolve',
      label: 'Mark as Resolved',
      pendingLabel: 'Resolving...',
      icon: CheckCircle2,
      className: 'btn-success w-full',
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {actions.map(action => {
        const Icon = action.icon;
        return (
          <button 
            key={action.type}
            disabled={isPending}
            onClick={() => handleAction(action.type)}
            className={action.className}
          >
            {isPending ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {action.pendingLabel}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Icon className="w-4 h-4" />
                {action.label}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
