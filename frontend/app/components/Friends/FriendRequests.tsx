import { useState } from 'react';
import type { FriendRequest } from '../../types/realtime.types';
import { useTranslation } from 'react-i18next';

interface FriendRequestsProps {
  requests: FriendRequest[];
  onAcceptRequest: (requestId: string) => Promise<void>;
  onRejectRequest: (requestId: string) => Promise<void>;
  loading: boolean;
}

export const FriendRequests = ({ 
  requests, 
  onAcceptRequest, 
  onRejectRequest,
  loading 
}: FriendRequestsProps) => {
  const [processingRequest, setProcessingRequest] = useState<string | null>(null);
  const { t } = useTranslation();

  const handleAccept = async (requestId: string) => {
    setProcessingRequest(requestId);
    try {
      await onAcceptRequest(requestId);
    } finally {
      setProcessingRequest(null);
    }
  };

  const handleReject = async (requestId: string) => {
    setProcessingRequest(requestId);
    try {
      await onRejectRequest(requestId);
    } finally {
      setProcessingRequest(null);
    }
  };

  const formatRequestTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="p-4 text-center">
        <div className="animate-pulse">
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                  <div>
                    <div className="h-4 bg-gray-200 rounded w-24"></div>
                    <div className="h-3 bg-gray-200 rounded w-16 mt-1"></div>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <div className="h-8 w-16 bg-gray-200 rounded"></div>
                  <div className="h-8 w-16 bg-gray-200 rounded"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
        </svg>
        <p className="text-lg font-medium font-title">{t('chat.noFriendReq')}</p>
        <p className="text-sm mt-1 font-body">{t('chat.waitingForFriend')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      {requests.map(request => (
        <div key={request.id} className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {/* Avatar */}
              <div className="w-10 h-10 bg-blue-200 rounded-full flex items-center justify-center">
                  <span className="text-blue-800 font-medium font-body">
                    {request.requesterName.charAt(0).toUpperCase()}
                  </span>
              </div>

              {/* Request info */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 font-body">
                  {request.requesterName}
                </h3>
                <p className="text-xs text-blue-600 font-body">
                  {t('chat.sendFriend')} {formatRequestTime(request.createdAt)}
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex space-x-2">
              <button
                onClick={() => handleAccept(request.id)}
                disabled={processingRequest === request.id}
                className="px-3 py-1 text-xs text-white bg-green-600 hover:bg-green-700 rounded transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-body"
              >
                {processingRequest === request.id ? 'Processing...' : 'Accept'}
              </button>
              <button
                onClick={() => handleReject(request.id)}
                disabled={processingRequest === request.id}
                className="px-3 py-1 text-xs text-gray-600 bg-white hover:bg-gray-50 border border-gray-300 rounded transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed font-body"
              >
                {processingRequest === request.id ? 'Processing...' : 'Reject'}
              </button>
            </div>
          </div>

          {/* Status indicator */}
          <div className="mt-3 flex items-center">
            <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
            <span className="text-xs text-blue-700 font-medium font-body">
              {t('chat.pending')}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};