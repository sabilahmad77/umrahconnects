'use client';
import { Inbox, Store } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/system';
import { VisaRequestQueue } from './visa-request-queue';
import { VisaRequestsView } from './visa-requests-view';
const tabClass='uc-button uc-button-quiet inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3.5 py-2 text-xs text-gray-600 data-[state=active]:border-brand-500 data-[state=active]:bg-brand-500 data-[state=active]:text-white';
/** Server ticket work and marketplace demand have distinct data contracts. */
export function VisaRequestsTabs(){
 return <Tabs defaultValue="tickets" className="space-y-4"><TabsList className="flex flex-wrap gap-1.5" aria-label="Visa request inboxes"><TabsTrigger value="tickets" className={tabClass}><Inbox className="h-3.5 w-3.5" />Service tickets</TabsTrigger><TabsTrigger value="marketplace" className={tabClass}><Store className="h-3.5 w-3.5" />Marketplace demand</TabsTrigger></TabsList><TabsContent value="tickets"><VisaRequestQueue /></TabsContent><TabsContent value="marketplace"><VisaRequestsView /></TabsContent></Tabs>;
}
