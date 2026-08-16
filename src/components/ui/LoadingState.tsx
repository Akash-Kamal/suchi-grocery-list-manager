import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  message?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({ message = 'Loading your grocery items...' }) => {
  return (
    <div className="flex flex-col items-center justify-center p-12 min-h-[300px] text-center">
      <div className="p-4 bg-emerald-50 rounded-full text-emerald-600 mb-4 animate-spin">
        <Loader2 className="w-8 h-8" />
      </div>
      <p className="text-gray-600 font-medium text-sm animate-pulse">{message}</p>
    </div>
  );
};
