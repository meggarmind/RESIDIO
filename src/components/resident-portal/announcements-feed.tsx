'use client';

import { motion } from 'framer-motion';
import { AlertCircle, Bell, Info, Megaphone } from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

export interface AnnouncementFeedItem {
  id: string;
  title: string;
  content?: string;
  priority: 'emergency' | 'high' | 'normal' | 'low';
  category: string;
  createdAt: Date;
  isRead?: boolean;
}

interface AnnouncementsFeedProps {
  announcements: AnnouncementFeedItem[];
}

const spring = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 30,
  mass: 1,
};

function getPriorityIcon(priority: AnnouncementFeedItem['priority']) {
  switch (priority) {
    case 'emergency':
      return AlertCircle;
    case 'high':
      return Megaphone;
    case 'normal':
      return Bell;
    case 'low':
      return Info;
  }
}

function getPriorityColor(priority: AnnouncementFeedItem['priority']) {
  switch (priority) {
    case 'emergency':
      return 'var(--color-error)';
    case 'high':
      return 'var(--color-warning)';
    case 'normal':
      return 'var(--color-primary)';
    case 'low':
      return 'var(--color-text-secondary)';
  }
}

/**
 * Announcements Feed Component
 *
 * Displays recent estate announcements with:
 * - Priority indicators (emergency=red, high=orange, normal=blue, low=gray)
 * - Read/unread status
 * - Relative timestamps
 * - Click-through to full announcements page
 *
 * Replaces the fake activity log with relevant estate communication.
 */
export function AnnouncementsFeed({ announcements }: AnnouncementsFeedProps) {
  if (announcements.length === 0) {
    return (
      <div className="card">
        <h3
          className="mb-4"
          style={{
            fontSize: 'var(--text-base)',
            fontWeight: 'var(--font-semibold)',
            color: 'var(--color-text-primary)',
          }}
        >
          Latest Announcements
        </h3>
        <p
          className="text-center py-8"
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text-secondary)',
          }}
        >
          No announcements
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3
          style={{
            fontSize: 'var(--text-base)',
            fontWeight: 'var(--font-semibold)',
            color: 'var(--color-text-primary)',
          }}
        >
          Latest Announcements
        </h3>
        <Link
          href="/portal/announcements"
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--color-primary)',
            fontWeight: 'var(--font-medium)',
            textDecoration: 'none',
          }}
        >
          View All
        </Link>
      </div>
      <div>
        {announcements.map((announcement, index) => {
          const PriorityIcon = getPriorityIcon(announcement.priority);
          const priorityColor = getPriorityColor(announcement.priority);
          const isLast = index === announcements.length - 1;

          return (
            <motion.div
              key={announcement.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: index * 0.05 }}
            >
              <Link
                href={`/portal/announcements?id=${announcement.id}`}
                style={{ textDecoration: 'none' }}
              >
                <div
                  className="py-3 transition-colors duration-150 cursor-pointer"
                  style={{
                    borderBottom: isLast ? 'none' : '1px solid var(--color-bg-input)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--color-bg-input)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="flex-shrink-0 mt-0.5"
                      style={{
                        color: priorityColor,
                      }}
                    >
                      <PriorityIcon style={{ width: '16px', height: '16px' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p
                          className="truncate flex-1"
                          style={{
                            fontSize: 'var(--text-sm)',
                            fontWeight: announcement.isRead ? 'var(--font-medium)' : 'var(--font-semibold)',
                            color: 'var(--color-text-primary)',
                          }}
                        >
                          {announcement.title}
                        </p>
                        {!announcement.isRead && (
                          <div
                            style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              background: 'var(--color-primary)',
                              flexShrink: 0,
                            }}
                          />
                        )}
                      </div>
                      {announcement.content && (
                        <p
                          className="truncate mb-1"
                          style={{
                            fontSize: 'var(--text-xs)',
                            color: 'var(--color-text-secondary)',
                            lineHeight: '1.4',
                          }}
                        >
                          {announcement.content}
                        </p>
                      )}
                      <div className="flex items-center gap-2">
                        <span
                          style={{
                            fontSize: 'var(--text-xs)',
                            color: 'var(--color-text-muted)',
                          }}
                        >
                          {formatDistanceToNow(announcement.createdAt, { addSuffix: true })}
                        </span>
                        {!announcement.isRead && (
                          <span
                            style={{
                              fontSize: 'var(--text-xs)',
                              color: 'var(--color-primary)',
                              fontWeight: 'var(--font-medium)',
                            }}
                          >
                            • Unread
                          </span>
                        )}
                        {announcement.isRead && (
                          <span
                            style={{
                              fontSize: 'var(--text-xs)',
                              color: 'var(--color-text-muted)',
                            }}
                          >
                            • Read
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
