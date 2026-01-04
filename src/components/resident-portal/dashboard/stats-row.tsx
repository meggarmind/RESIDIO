'use client';

import { MoreVertical, Wallet, Home, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import Link from 'next/link';

interface StatsRowProps {
    walletBalance: number;
    propertyCount: number;
    securityContactsCount: number;
}

export function StatsRow({ walletBalance, propertyCount, securityContactsCount }: StatsRowProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Wallet Balance - Mint Green */}
            <div className="bg-paier-mint rounded-[24px] p-6 border border-paier-green shadow-sm relative overflow-hidden group">
                <div className="flex justify-between items-start mb-4">
                    <div className="p-2 bg-white/20 rounded-full">
                        <Wallet className="h-5 w-5 text-paier-navy" />
                    </div>
                    {/* Decorative Button */}
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-black/5">
                        <MoreVertical className="h-4 w-4 text-paier-navy" />
                    </Button>
                </div>

                <div className="mb-6">
                    <h3 className="text-paier-navy font-semibold text-lg">Wallet Balance</h3>
                    <p className="text-paier-navy/70 text-sm">Available funds</p>
                </div>

                <div className="flex items-end justify-between">
                    <div className="text-[32px] md:text-[40px] font-bold text-paier-navy leading-none truncate max-w-[180px]">
                        {formatCurrency(walletBalance)}
                    </div>
                    <Button variant="secondary" size="sm" className="bg-paier-navy text-white hover:bg-paier-navy/90 rounded-full h-8 text-xs">
                        Top Up
                    </Button>
                </div>
            </div>

            {/* Properties - White */}
            <div className="bg-white rounded-[24px] p-6 border border-gray-100 shadow-sm transition-all hover:shadow-md">
                <div className="flex justify-between items-start mb-4">
                    <div className="p-2 bg-gray-50 rounded-full">
                        <Home className="h-5 w-5 text-paier-navy" />
                    </div>
                    <Link href="/portal/properties">
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-gray-100">
                            <MoreVertical className="h-4 w-4 text-gray-400" />
                        </Button>
                    </Link>
                </div>

                <div className="mb-8">
                    <h3 className="text-paier-navy font-semibold text-lg">My Properties</h3>
                    <p className="text-gray-400 text-sm">Active Assignments</p>
                </div>

                <div className="text-[36px] font-bold text-paier-navy leading-none">
                    {propertyCount}
                </div>
            </div>

            {/* Security Contacts - White */}
            <div className="bg-white rounded-[24px] p-6 border border-gray-100 shadow-sm transition-all hover:shadow-md">
                <div className="flex justify-between items-start mb-4">
                    <div className="p-2 bg-gray-50 rounded-full">
                        <Users className="h-5 w-5 text-paier-navy" />
                    </div>
                    <Link href="/portal/security-contacts">
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-gray-100">
                            <MoreVertical className="h-4 w-4 text-gray-400" />
                        </Button>
                    </Link>
                </div>

                <div className="mb-8">
                    <h3 className="text-paier-navy font-semibold text-lg">Visitors</h3>
                    <p className="text-gray-400 text-sm">Active Contacts</p>
                </div>

                <div className="text-[36px] font-bold text-paier-navy leading-none">
                    {securityContactsCount}
                </div>
            </div>
        </div>
    );
}
