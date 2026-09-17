# Relevant design research

Research access date: **17 September 2026**. Supplementary evidence for Phase 7. Design discovery only; no implementation or vendor selection.

## Evidence boundaries

Eight primary official sources were opened through the web research tool. The inspected material was extracted public page content and published design/product documentation. No competitor account was created, authenticated dashboard opened, booking submitted, payment made, or competitor mobile app installed. Typography, spacing, animation, contrast, responsive behavior, and actual interaction quality were **not visually verified** in this research pass. A product page describing a feature is evidence of its published positioning, not proof of usability or performance.

**Observed** below means present in the inspected source. **Transfer proposal** means our design inference for Umrah Connect; it is not a claim that the source implements the same workflow. No conversion, revenue, adoption, or trust uplift is inferred. Competitor marketing metrics are excluded.

Read-only local grounding: route files confirm `/hotel-dashboard`, `/transport-dashboard`, and `/visa-dashboard` and their respective dashboard components. Hotel source exposes occupancy, room states, pending bookings, check-ins/check-outs; transport exposes fleet/driver availability, assignments and upcoming trips; visa exposes application/document stages. Route existence does not establish production accessibility or backend readiness. The broader audit and role map remain authoritative on those distinctions.

## Official sources and transferable patterns

### 1. Nusuk — pilgrimage journey and service information architecture

Source: [Nusuk official homepage](https://www.nusuk.sa/). Scope: extracted homepage navigation, journey sections, service descriptions, contact/footer content. Arabic content and some untranslated label keys appeared in extraction.

**Observed:** Hajj, Umrah and Rawdah journeys have distinct sections; service entries separate information from starting the task. Discovery and service-directory navigation coexist with help/contact links. [Official page](https://www.nusuk.sa/)

**Transfer proposal:** Separate traveler planning/discovery from operational management. A service should explain scope and prerequisites before the action. Preserve religious context through relevant content rather than ornament. Offer assistance in a predictable location.

**Do not copy:** Government registration cues, ministry endorsement, official marks, claims, imagery or palette. Umrah Connect may show only its own verifiable credentials.

### 2. Nusuk Umrah — service discovery and package clarity

Source: [Nusuk Umrah](https://umrah.nusuk.sa/). Scope: extracted homepage search fields, package categories/cards, service inclusion lists and FAQ. Package detail and registration flows were not completed.

**Observed:** Search asks for arrival city, start date, group size and residence country. Package categories distinguish visa inclusion; cards state nights and a per-person price with VAT context. Provider information and registration eligibility are explained separately. Dynamic counters appeared as zero in extraction; they are not usable factual evidence. [Official page](https://umrah.nusuk.sa/)

**Transfer proposal:** Marketplace filters should reflect actual travel decisions and available data. Listing comparisons need consistent dates, party basis, currency, taxes/fees, inclusions and exclusions. Distinguish a request/quote from a confirmed reservation. Residence/visa questions require product validation before inclusion.

**Do not copy:** Official-provider status, package names, prices, badges, copy, artwork or guarantees. Show verified supplier evidence only when supported.

### 3. Four Seasons — destination discovery with transactional access

Source: [Four Seasons homepage](https://www.fourseasons.com/). Scope: extracted public navigation, destination search, itinerary/rates links, editorial sections and image/video labels. Reservation overlay and room selection were not tested.

**Observed:** Destination discovery sits alongside direct access to checking rates and an itinerary. Navigation separates hospitality offerings; language selection and skip-to-content are present. Editorial media sections have task links; a video pause/play control appears in extraction. [Official page](https://www.fourseasons.com/)

**Transfer proposal:** Direction A can pair restrained destination photography with an immediately understandable service action. Existing travelers need a clear return path to their journey. Relevant imagery should orient users to location/service, with accessible text and reduced-motion treatment to be verified later.

**Do not copy:** Luxury positioning, serif identity, logo, property photography or cinematic hero. Avoid importing a sprawling leisure navigation into this product.

### 4. Emirates — servicing organized around an existing trip

Source: [Emirates Manage your booking](https://www.emirates.com/english/manage-booking/). Scope: public retrieval form and described itinerary, contact, service and check-in tasks; no booking retrieved.

**Observed:** The page supports booking retrieval and an account path. Its described tasks center on itinerary access, changes, contact information and related travel services. Book, Manage, Before you fly and Help are distinct navigation groups. [Official page](https://www.emirates.com/english/manage-booking/)

**Transfer proposal:** Traveler home should prioritize the current journey, next required action, confirmed services and support. Operators should open a booking into a unified context for pilgrim/group, itinerary, suppliers, documents and payment status. Let users understand which changes need a new quote or approval.

**Do not copy:** Airline-specific tasks, booking-reference access/security model, fares, check-in rules, brand assets or service promises.

### 5. SiteMinder — mobile hospitality operations priorities

Source: [SiteMinder Mobile App product page](https://www.siteminder.com/mobile-app/). Scope: published feature descriptions and FAQ; no authenticated UI or native app interaction inspected.

**Observed:** The page emphasizes reservation details, property performance, rate/availability changes, alerts and booking/cancellation/change activity on mobile. It describes a mobile dashboard and inventory grid. These are vendor-described capabilities. [Official page](https://www.siteminder.com/mobile-app/)

**Transfer proposal:** Hotel mobile priorities should be today's arrival/departure work, pending requests and availability exceptions. Transport can apply the same operational focus to upcoming assignments and resource conflicts. Mobile summary/detail presentation should support a specific action with adequate confirmation, not reproduce every desktop column.

**Do not copy:** Inventory UI, channel integrations, forecasts, automation, outcome claims or any capability Umrah Connect does not support.

### 6. GOV.UK Design System — review before submission

Source: [Check answers pattern](https://design-system.service.gov.uk/patterns/check-answers/). Scope: guidance and published example markup; no government service application completed.

**Observed guidance:** Organize review by relevant sections; provide contextual change links; preserve entered answers; return users to review after editing. The final action must explain what submission does. Optional unanswered items should be explicit. [Official guidance](https://design-system.service.gov.uk/patterns/check-answers/)

**Transfer proposal:** Use a review step for traveler booking requests and visa document/application submission. Review party, dates, selected service, documents and applicable costs before commitment. Operators can review group changes; Super Admin can review sensitive governance actions with tenant context. Legal declarations and approval rules need product/legal ownership.

**Do not copy:** Government identity, example personal data, declarations, or assume the pattern alone makes a workflow compliant.

### 7. IBM Carbon — purposeful density in operations tables

Source: [Carbon data table usage](https://carbondesignsystem.com/components/data-table/usage/). Scope: official usage guidance for anatomy, sizing, expansion, selection, sorting, toolbar and pagination; live component interactions not tested.

**Observed guidance:** Search/filter and global actions belong in the table toolbar. Sorting, expansion and row selection serve different tasks. Tables should receive enough width; supplementary details can move to expansion, a panel or a dedicated page. Selection can expose batch actions. [Official guidance](https://carbondesignsystem.com/components/data-table/usage/)

**Transfer proposal:** Direction B should use consistent tables for operator bookings/pilgrims, visa queues, fleet assignments and admin governance. Keep identity, status and next action scannable. Batch actions require permission, eligible-record rules, selection counts and a review of consequences. Mobile behavior needs independent task testing.

**Do not copy:** IBM brand, exact component appearance, AI labels, or enable selection/batch actions without product support.

### 8. Stripe — transaction summary and payment UI scope

Source: [Stripe checkout overview](https://docs.stripe.com/payments/checkout). Scope: official overview and comparison of full-page, embedded and custom payment UIs; no checkout session created.

**Observed:** The documentation distinguishes hosting/customization/complexity choices. Full-page checkout includes a fuller order summary; an embedded form has a more limited summary; custom Elements require the surrounding summary to be designed. [Official documentation](https://docs.stripe.com/payments/checkout)

**Transfer proposal:** Booking review should maintain a legible service/party/date/currency/cost summary before payment and explain quote versus commitment. Payment UI choice is a later engineering/product decision; visual concepts must not imply Stripe is selected. Pending/failed states need recovery without falsely declaring a booking confirmed.

**Do not copy:** Stripe logo, financial reporting imagery, payment-method support claims or implementation assumptions. Supplier fulfillment and payment status remain distinct concepts.

## Role-specific synthesis — proposals to validate

| Umrah surface | Proposed application | Constraint |
|---|---|---|
| Public landing/discovery | Explain journey value, expose services clearly, give a direct role/task CTA; meaningful photography supports location context | Preserve current brand; no borrowed authority marks, partnerships or metrics |
| Traveler | Current journey and next action lead; service comparisons use consistent inclusions and cost basis; request review before commitment | Expose only services and statuses actually supported |
| Operator | Booking/group workspace and action queues; shared table conventions; supplier/document/payment context remains nearby | Tenant operations must not become platform governance |
| Hotel | Arrivals/departures, pending requests and room exceptions ahead of secondary performance summaries | Availability edits/confirmation follow real inventory rules |
| Transport | Time-oriented assignments with driver/vehicle availability and explicit exceptions | Do not imply live tracking or dispatch automation |
| Visa agency | Stage-oriented application queue; document completeness; actionable reason for attention; review before submission | Do not fabricate eligibility rules, deadlines or approval guarantees |
| Super Admin | Tenant identity, governance queues, reviewable changes and audit context | Separate platform scope and sensitive permissions from Operator |

## Direction implications, without selecting a winner

| Direction | Research-derived emphasis | Tradeoff to test |
|---|---|---|
| A — Refined Travel Platform | Relevant destination imagery, calm discovery and a coherent journey/transaction narrative | Editorial breathing room must not displace the next action or operational data |
| B — Modern Platform / Operations | Consistent table toolbars, queues, controlled density and role-specific exceptions | Dense operations must remain understandable for occasional travelers |
| C — Contemporary Premium Hybrid | Hospitality context in discovery; structured task surfaces in authenticated work | Shared foundations must connect both modes without decorative fragmentation |

## Inspiration versus copying

**Inspiration:** Reuse general interaction principles—clear task entry, transparent inclusion/cost basis, trip context, exception-first operations, review/edit before commitment, purposeful table density—and adapt them to verified Umrah Connect roles and capabilities.

**Copying to reject:** Competitor logos, exact composition, proprietary imagery, distinctive visual identity, prices, metrics, official badges, claims and product capabilities. Research sources are neither Umrah Connect partners nor endorsements.

## Follow-up validation for a future authorized design phase

1. Test package comparison and request review with travelers using realistic group/date/cost data.
2. Test booking/group queues with Operators and separate tenant-governance queues with Super Admin.
3. Test hotel, transport and visa exception handling with representatives of those roles.
4. Verify keyboard, screen-reader, contrast, RTL/localization, reduced-motion and mobile task flows in concrete prototypes.
5. Resolve required fields, supported filters, approval rules and payment provider through product decisions before implementation.

External limitations: Navan and a SiteMinder `/platform/` URL could not be opened by the research tool; they are not evidence in this document. No claims rely on search-result snippets, third-party commentary or dated vendor brochures.
