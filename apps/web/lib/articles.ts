// Real, human-written resource articles for Umrah Connect.
// Each Resources card links to one of these — no dead ends, no lorem.

export interface Article {
  slug: string;
  category: string;
  title: string;
  intro: string;
  minutes: number;
  sections: { h: string; p: string[] }[];
}

export const ARTICLES: Article[] = [
  {
    slug: 'best-times-to-visit-rawdah',
    category: 'Travel guidance',
    title: 'Best times to visit the Rawdah in Madinah',
    minutes: 4,
    intro:
      'The Rawdah ash-Sharifah — the area between the Prophet’s ﷺ minbar and his blessed home — is one of the most sought-after places on earth. A little planning makes the visit calmer and more likely to succeed.',
    sections: [
      { h: 'Book through Nusuk first', p: [
        'Entry to the Rawdah is organised through timed permits booked in the official Nusuk app. Permits are free but limited; slots open on a rolling basis, so check the app daily and book as soon as your travel dates are confirmed.',
        'Men and women have separate visiting hours and entrances — check which window your permit falls into and arrive early for it.',
      ]},
      { h: 'The calmest windows', p: [
        'Late night (after Isha crowds disperse, roughly 11pm–2am) and the period after Fajr are usually the most settled times. Between Dhuhr and Asr is often quieter than the evening rush.',
        'Fridays, the last ten nights of Ramadan and Hajj season are the busiest — if your trip allows, plan your Rawdah visit for a mid-week day outside peak season.',
      ]},
      { h: 'On the day', p: [
        'Arrive at the gate printed on your permit at least 20–30 minutes early, keep your Nusuk QR code ready offline, and travel light — large bags slow down entry.',
        'Once inside, time is short. Prioritise two rak‘ahs and your most important du‘ās rather than photography; guards keep the flow moving.',
      ]},
      { h: 'For operators', p: [
        'If you manage groups, collect your pilgrims’ Nusuk accounts early and coordinate permit slots per group. Staggering sub-groups across windows works better than pushing one large block into a single slot.',
      ]},
    ],
  },
  {
    slug: 'umrah-packing-checklist',
    category: 'Pilgrim tips',
    title: 'A complete packing checklist for Umrah',
    minutes: 5,
    intro:
      'Pack for worship first, tourism second. This checklist covers what actually gets used on the ground in Makkah and Madinah — and what most pilgrims wish they had left at home.',
    sections: [
      { h: 'Documents & money', p: [
        'Passport (6+ months validity), visa/Nusuk confirmation, hotel and transport confirmations (offline copies), vaccination records, travel insurance, and a card that works internationally plus some Saudi riyals in cash for small purchases.',
      ]},
      { h: 'Ihram & clothing', p: [
        'Men: two ihram sets (one to wear, one spare), a money belt that works with ihram, and unstitched-friendly sandals. Women: loose, modest clothing in breathable fabric; no face covering during ihram.',
        'Outside ihram: light cotton clothing, a sweater for cold hotel and Haram air-conditioning, and very comfortable walking shoes — you will easily walk 8–15 km on some days.',
      ]},
      { h: 'Health & comfort', p: [
        'Unscented soap and moisturiser (scent-free is required in ihram), regular medications in original packaging, blister plasters, painkillers, rehydration salts, and a small umbrella for shade.',
        'A collapsible prayer mat, a lightweight bag for shoes inside the Haram, and a refillable water bottle cover most day-to-day needs.',
      ]},
      { h: 'What to skip', p: [
        'Bulky luggage, valuables, and elaborate electronics. Laundry is cheap and fast near both Harams — pack for 5–6 days regardless of trip length.',
      ]},
    ],
  },
  {
    slug: 'operators-reduce-booking-errors',
    category: 'For operators',
    title: 'How operators cut booking errors with one connected CRM',
    minutes: 4,
    intro:
      'Most Umrah booking mistakes are not people problems — they are copy-paste problems. When pilgrim data lives in WhatsApp, Excel and paper folders at the same time, every transfer is a chance to corrupt it.',
    sections: [
      { h: 'Where errors actually happen', p: [
        'Passport numbers retyped from photos, names spelled differently across visa and hotel lists, room allocations edited in one sheet but not the other, and payment status tracked in someone’s head. Each looks small; together they produce airport-desk emergencies.',
      ]},
      { h: 'One record, many views', p: [
        'The fix is structural: capture the pilgrim once, then let bookings, visas, hotel rooming lists and invoices all reference that one record. In Umrah Connect the pilgrim profile carries passport data and documents, and every downstream module reads from it — change it once and the manifest, the visa application and the invoice all agree.',
      ]},
      { h: 'Status that means something', p: [
        'Replace “I think they paid” with an explicit lifecycle: booking status is derived from recorded payments, visa status from the compliance pipeline, and travel readiness from documents on file. Dashboards then show real numbers, not optimistic ones.',
      ]},
      { h: 'Start small', p: [
        'Migrate one upcoming group end-to-end — pilgrims → booking → invoice → payments — before moving the whole operation. One clean group teaches the team more than any manual.',
      ]},
    ],
  },
  {
    slug: 'nusuk-masar-visa-requirements',
    category: 'Visa & compliance',
    title: 'Understanding Nusuk & Masar visa requirements',
    minutes: 5,
    intro:
      'Saudi Arabia has consolidated Umrah journeys onto official platforms: Nusuk for pilgrims and Masar for licensed operators. Knowing which path applies to your travellers avoids most visa surprises.',
    sections: [
      { h: 'The two official rails', p: [
        'Nusuk is the pilgrim-facing platform — individuals can obtain an Umrah eVisa or book Rawdah permits directly. Masar is the operator rail: licensed agents register packages, pilgrims and services through it, and group visas flow against those records.',
      ]},
      { h: 'Typical document set', p: [
        'A passport valid 6+ months beyond travel, a clear passport-photo scan, completed vaccination requirements, and — for group files — consistent name spelling exactly as in the passport machine-readable zone. Mismatched transliterations are the single most common rejection cause.',
      ]},
      { h: 'Timelines to plan around', p: [
        'eVisas can issue quickly, but group files move at the speed of their slowest document. Operators should lock passports and photos at booking time, not at submission time, and track each pilgrim’s checklist so one missing scan doesn’t stall the file.',
      ]},
      { h: 'How Umrah Connect helps', p: [
        'The compliance workspace tracks each application’s status (draft → submitted → approved/rejected with reason), keeps the document checklist against the pilgrim record, and shows the pipeline per group. Direct regulator API integration is on the roadmap — today the platform organises the work; submission happens on the official portals.',
      ]},
    ],
  },
  {
    slug: 'operator-onboarding-guide',
    category: 'Onboarding',
    title: 'Getting started as an operator on Umrah Connect',
    minutes: 6,
    intro:
      'From an empty workspace to a bookable operation in five steps. This is the exact order we recommend — each step feeds the next.',
    sections: [
      { h: '1 · Set up your workspace', p: [
        'Sign up as an Umrah Operator / Agency. Your workspace is tenant-isolated: your pilgrims, bookings and finances are yours alone. Complete provider verification when our team reaches out.',
      ]},
      { h: '2 · Create your packages', p: [
        'Under My CRM → Packages, define what you actually sell — name, trip type, duration, adult price. Packages power booking creation, so do this before importing pilgrims.',
      ]},
      { h: '3 · Load your pilgrims', p: [
        'Add pilgrims with passport details and documents. The status lifecycle (Lead → Booked → Visa → In Kingdom → Returned) drives your dashboard counters, so keep it current.',
      ]},
      { h: '4 · Book and invoice', p: [
        'Create a booking, attach pilgrims, select the package, then generate the invoice from the booking. Record payments as they arrive — the invoice moves Draft → Partial → Paid automatically and your outstanding balance stays honest.',
      ]},
      { h: '5 · Coordinate supply', p: [
        'Use Hotels, Transport and Visa & Compliance for your own inventory, and the shared Marketplace to find or offer services. Requests you receive can be answered with offers and converted into bookings in one click.',
      ]},
    ],
  },
  {
    slug: 'hotel-listing-guide',
    category: 'Hotels',
    title: 'Listing your hotel on the marketplace',
    minutes: 4,
    intro:
      'A good listing answers the three questions every operator asks first: how far from the Haram, what room types, and what price per night. Here’s how to publish yours.',
    sections: [
      { h: 'Complete the hotel profile first', p: [
        'In My Hotels, create the property with its city, address, star rating and — crucially — distance from the Haram. Distance is the #1 filter operators use; listings without it get skipped.',
      ]},
      { h: 'Define room types honestly', p: [
        'Add each room type with capacity and base price. Quad and quint rooms dominate Umrah group demand; if you have them, list them explicitly rather than as “triple + extra bed”.',
      ]},
      { h: 'Publish to the marketplace', p: [
        'Create a marketplace listing per sellable unit (e.g. “Deluxe Room — 200m from Haram”). Set price, currency and a clear description of what is included (breakfast, shuttle, view). Listings appear in the in-app marketplace and the public preview.',
      ]},
      { h: 'Respond to requests fast', p: [
        'Operators post requests with dates and group sizes. The fastest credible offer usually wins — keep notifications on and reply with a firm price and validity window.',
      ]},
    ],
  },
  {
    slug: 'fleet-management-guide',
    category: 'Transport',
    title: 'Managing fleet, drivers and routes',
    minutes: 4,
    intro:
      'Ground transport makes or breaks the pilgrim experience — nobody remembers a smooth transfer, everyone remembers a missed one. Structure your fleet data so assignment day is boring.',
    sections: [
      { h: 'Register the fleet', p: [
        'Add each vehicle with its real type (bus sizes, van, private car) and seat capacity. Capacity drives assignment maths — a 49-seat coach recorded as “bus” with no capacity forces manual work later.',
      ]},
      { h: 'Drivers and documents', p: [
        'Keep driver records current: licence class and expiry, phone number, and language notes. Expired documents surface at checkpoints at the worst possible time.',
      ]},
      { h: 'Routes as reusable products', p: [
        'Define your standard runs once — Jeddah Airport → Makkah, Makkah ↔ Madinah, Ziyarah circuits — with duration and price. Assignments then become “route + vehicle + driver + group + time”, which is a 30-second task instead of a nightly spreadsheet.',
      ]},
      { h: 'On operation day', p: [
        'Work from the assignments list, not memory: vehicle, driver phone, pickup point, group size. Share the driver contact with the group leader the evening before — it eliminates most “where is the bus?” calls.',
      ]},
    ],
  },
  {
    slug: 'invoices-payments-reconciliation',
    category: 'Finance',
    title: 'Invoices, payments and reconciliation',
    minutes: 5,
    intro:
      'Umrah finance fails quietly: a deposit here, a cash payment there, and by departure week nobody is sure who still owes what. The cure is deriving status from recorded payments — never the other way round.',
    sections: [
      { h: 'Invoice from the booking', p: [
        'Generate the invoice directly from the booking so amounts, currency and the pilgrim list always match the operational record. Manual invoices drift; generated ones can’t.',
      ]},
      { h: 'Record every payment, however small', p: [
        'Each deposit or instalment goes in with amount, method and reference. The invoice then derives its own state: Draft/Sent → Partially Paid → Paid when the running total reaches the invoice amount. Overpayments are rejected, so the ledger cannot go negative.',
      ]},
      { h: 'Read the reconciliation, not the inbox', p: [
        'The Partial filter is your working list: every invoice there has money outstanding, with the exact remainder shown. Departure-readiness reviews become a five-minute scan instead of an archaeology dig.',
      ]},
      { h: 'Refunds and cancellations', p: [
        'Cancel or void invoices rather than deleting them, and record refunds against the original payment so the audit trail stays complete. Deleted history always comes back as a dispute.',
      ]},
    ],
  },
];

export const getArticle = (slug: string) => ARTICLES.find((a) => a.slug === slug);
