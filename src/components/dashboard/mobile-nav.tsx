'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/auth-provider';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Home, Users, CreditCard, Shield, Settings } from 'lucide-react';

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
}

const navItems: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: Home,
  },
  {
    title: 'Residents',
    href: '/residents',
    icon: Users,
    roles: ['admin', 'chairman', 'financial_secretary'],
  },
  {
    title: 'Payments',
    href: '/payments',
    icon: CreditCard,
    roles: ['admin', 'chairman', 'financial_secretary'],
  },
  {
    title: 'Security',
    href: '/security',
    icon: Shield,
    roles: ['admin', 'chairman', 'security_officer'],
  },
  {
    title: 'Settings',
    href: '/settings',
    icon: Settings,
    roles: ['admin'],
  },
];

interface MobileNavProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileNav({ open, onOpenChange }: MobileNavProps) {
  const pathname = usePathname();
  const { profile } = useAuth();

  const filteredNavItems = navItems.filter((item) => {
    if (!item.roles) return true;
    return profile?.role && item.roles.includes(profile.role);
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-64 p-0">
        <SheetHeader className="p-6 border-b">
          <SheetTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              R
            </div>
            <span>Residio</span>
          </SheetTitle>
        </SheetHeader>
        <nav className="flex-1 px-4 py-4">
          <ul className="space-y-1">
            {filteredNavItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => onOpenChange(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t p-4">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-medium">
              {profile?.full_name?.charAt(0) || '?'}
            </div>
            <div className="flex-1 truncate">
              <p className="text-sm font-medium truncate">{profile?.full_name}</p>
              <p className="text-xs text-muted-foreground capitalize">
                {profile?.role?.replace('_', ' ')}
              </p>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
