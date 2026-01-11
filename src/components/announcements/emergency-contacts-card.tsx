'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Phone,
  Building2,
  Shield,
  Flame,
  Car,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';

interface EmergencyContact {
  name: string;
  phone?: string;
  email?: string;
  category: string;
  priority: number;
  description?: string;
}

interface EmergencyContactsCardProps {
  contacts: EmergencyContact[];
  defaultExpanded?: boolean;
}

const categoryIcons: Record<string, React.ReactNode> = {
  estate: <Building2 className="h-4 w-4" />,
  security: <Shield className="h-4 w-4" />,
  management: <Building2 className="h-4 w-4" />,
  emergency: <AlertTriangle className="h-4 w-4" />,
  police: <Shield className="h-4 w-4" />,
  fire: <Flame className="h-4 w-4" />,
  road_safety: <Car className="h-4 w-4" />,
};

const categoryColors: Record<string, string> = {
  estate: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
  security: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200',
  management: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
  emergency: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
  police: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
  fire: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200',
  road_safety: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
};

export function EmergencyContactsCard({
  contacts,
  defaultExpanded = false,
}: EmergencyContactsCardProps) {
  const [isOpen, setIsOpen] = useState(defaultExpanded);
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);

  // Group contacts by category
  const estateContacts = contacts.filter(
    (c) => ['estate', 'security', 'management'].includes(c.category)
  );
  const nationalContacts = contacts.filter(
    (c) => !['estate', 'security', 'management'].includes(c.category)
  );

  const handleCopyPhone = async (phone: string) => {
    try {
      await navigator.clipboard.writeText(phone);
      setCopiedPhone(phone);
      toast.success('Phone number copied to clipboard');
      setTimeout(() => setCopiedPhone(null), 2000);
    } catch {
      toast.error('Failed to copy phone number');
    }
  };

  const ContactRow = ({ contact }: { contact: EmergencyContact }) => (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-full ${categoryColors[contact.category] || 'bg-gray-100'}`}>
          {categoryIcons[contact.category] || <Phone className="h-4 w-4" />}
        </div>
        <div>
          <p className="font-medium text-sm">{contact.name}</p>
          {contact.description && (
            <p className="text-xs text-muted-foreground">{contact.description}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {contact.phone && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 font-mono text-sm"
            onClick={() => handleCopyPhone(contact.phone!)}
          >
            {copiedPhone === contact.phone ? (
              <Check className="h-3 w-3 text-green-600" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            {contact.phone}
          </Button>
        )}
        {contact.phone && (
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            asChild
          >
            <a href={`tel:${contact.phone}`}>
              <Phone className="h-3 w-3" />
            </a>
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <Card className="border-amber-200 dark:border-amber-800">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900/30">
                  <Phone className="h-4 w-4 text-amber-700 dark:text-amber-300" />
                </div>
                <div>
                  <CardTitle className="text-lg">Emergency Contact Directory</CardTitle>
                  <CardDescription>
                    Quick access to emergency contacts for urgent situations
                  </CardDescription>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                {isOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {/* Estate Contacts */}
            {estateContacts.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-normal">
                    Estate Contacts
                  </Badge>
                </div>
                <div className="space-y-1 rounded-lg border bg-muted/20 p-2">
                  {estateContacts.map((contact, index) => (
                    <ContactRow key={`estate-${index}`} contact={contact} />
                  ))}
                </div>
              </div>
            )}

            {/* National Emergency Contacts */}
            {nationalContacts.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="destructive" className="font-normal">
                    National Emergency Numbers
                  </Badge>
                </div>
                <div className="space-y-1 rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 p-2">
                  {nationalContacts.map((contact, index) => (
                    <ContactRow key={`national-${index}`} contact={contact} />
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground text-center pt-2">
              Click on a phone number to copy it, or tap the phone icon to call directly.
            </p>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
