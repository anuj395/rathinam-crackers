# Rathinam Crackers Business Management System

## Overview

This project is a comprehensive, full-stack business management platform designed for Rathinam Crackers, a firecracker company. Its primary purpose is to streamline sales, inventory, accounting, and customer management across various user roles and interfaces. The system aims to provide a scalable and robust solution for managing the complexities of a firecracker business, including a 5-tier pricing engine, an immutable stock ledger, GST invoicing, a coupon engine, loyalty points, agent commissions, customer credit management, barcode support, and extensive financial reporting.

The platform integrates multiple applications: an ERP Admin Panel, a POS Interface, a Warehouse Dashboard, and an E-commerce Website, all unified by a common API contract. The business vision is to deliver an efficient and auditable system that enhances both internal operations and customer engagement, leading to increased productivity and customer satisfaction within a specialized market.

## User Preferences

I prefer iterative development with clear communication on significant changes. Before making major architectural shifts or adding new features, please propose the plan and await approval. For any issues or proposed solutions, provide detailed explanations. I also prefer a functional programming approach where it makes sense, and clear, concise code. Do not make changes to the `scripts/seed.ts` file without explicit instructions, as it references missing dependencies.

## System Architecture

The system is a monorepo built with pnpm workspaces, utilizing a full-stack architecture.

**Technical Stack:**
- **Backend**: Express 5 with TypeScript ESM, PostgreSQL via Drizzle ORM, JWT authentication.
- **Frontend**: React, Vite, shadcn/ui, wouter for routing, @tanstack/react-query for data fetching, and recharts for data visualization.
- **API Contract**: OpenAPI 3.1 with codegen for Zod schemas and React Query hooks, ensuring type-safe API interactions.

**Applications:**
- **ERP Admin Panel**: Central console for business operations with over 25 pages and contextual help. Includes a full Returns + Credit Note workflow (POST /v1/returns transactionally restocks goods via the stock ledger, atomically decrements customer outstanding balance, and issues a sequential credit-note number) and report pages for Sales, Day Book, Outstanding, Commission, GST, Returns, Damage, Loyalty, and Activity.
- **POS Interface**: Touch-screen optimized cashier terminal with a dark theme, designed for retail. Includes features like quick-add/barcode input, low-stock indicators, quick-cash denominations, global keyboard shortcuts, PIN login, and thermal receipt printing. Supports shift management with opening floats, Z-reports, and multi-tender (split payments) with manual discount and reason tracking.
- **Warehouse Dashboard**: Interface for stock operations including receiving, adjusting, and transferring.
- **E-commerce Website**: Public-facing online shop with a festive Indian theme, customer accounts, address book, wishlist, and order placement linked to the ERP. Supports product reviews.
- **API Server**: Core Express REST API serving all frontend applications.

**UI/UX Decisions:**
- **ERP Admin Panel**: Standard administrative console with sidebar navigation.
- **POS Interface**: Dark theme, touch-optimized, 7-step cashier walk-through.
- **Warehouse Dashboard**: Clear workflows for stock management with dedicated help.
- **E-commerce Website**: Festive Indian theme, customer-facing FAQs, and product review capabilities.
- **PDF Export**: Consistent branding, accent red, and paginated footers for all generated documents.

**Feature Specifications & Implementations:**
- **Pricing Engine**: A 5-tier system (`purchase`, `wholesaleBulk`, `retailOnline`, `retailEst`, `agent`) with detailed pricing resolution.
- **Stock System**: Immutable ledger (`stockLedger` table) tracking all movements (`IN`, `OUT`, `MOVE`, `ADJUST`, `DAMAGE`, `RESERVE`, `UNRESERVE`). Stock levels are derived from ledger entries, with all modifications to the ledger rejected to maintain audit integrity. Concurrent stock updates are handled via `ON CONFLICT DO UPDATE`.
- **GST Invoicing**: Supports CGST 9% + SGST 9% (intra-state) and IGST 18% (inter-state).
- **Coupon Engine**: Supports percentage/flat discounts, minimum order values, expiry dates, and usage limits with server-side validation.
- **Loyalty & Commission**: Functionality for loyalty points and tiered agent commissions.
- **Customer Management**: Includes credit ledger, statements, and payment recording.
- **Reports**: Generation of sales-by-channel, outstanding balances, GST (HSN-wise), commission, and daybook reports.
- **System Verifier**: A 60+ check end-to-end verifier (CLI and in-app at `/verifier`) validates API, authentication, pricing, stock, sales, online order lifecycle, bypass guards (USE_DISPATCH, USE_SHOP_PLACEMENT, NOT_DELIVERED, ORDER_CANCELLED), and admin functions. The in-app verifier auto-uses the live admin token (so it always tracks the current password), with optional per-tab override fields and seed-default fallbacks.
- **Online Order Lifecycle**: Stages `pending_confirmation → confirmed → packed → dispatched → delivered`. Dispatch is a dedicated action capturing courier + AWB (status edits to `dispatched` via the generic PATCH return `USE_DISPATCH`). Generic invoice creation rejects `channel=ONLINE` (`USE_SHOP_PLACEMENT`). Atomic cancel (`FOR UPDATE` row lock) restores stock via ledger entries that reference the original OUT entries; allowed for staff at any non-delivered stage and for customers only at `pending_confirmation` / `confirmed`. Returns are blocked against pending (`NOT_DELIVERED`) and cancelled (`ORDER_CANCELLED`) online orders.
- **Bulk CSV Import / Export**: Every master-data list (Products, Customers, Suppliers, Agents, Brands, Categories, Locations, Coupons) ships Template / Export / Import buttons. Friendly column aliases, upsert by stable key, full row-level error reporting. Endpoints under `/api/v1/bulk/<resource>/{template,export,import}`, admin-token gated.
- **In-app Help & Guide System**: Contextual help integrated into all application panels. The ERP `/help` index now ships 16 topic guides covering Quick Start, 5-tier Pricing, Stock, Sales, CRM, Coupons, POS+Warehouse, Online Orders Lifecycle, Returns & Refunds, Website & Customer Portal, Bulk CSV, Reports, Settings, Verifier, Production Go-Live Checklist, and Architecture & API. A standalone go-live checklist also lives at the root as `PRODUCTION.md`.
- **Audit Log (Immutable)**: An append-only `audit_log` table records all admin writes to critical settings and data, capturing actor, action, entity snapshots, IP, and user-agent. Log retention is configurable and managed by a scheduled job.
- **CMS / Dynamic Config**: Website and POS configurations are dynamic, driven by a `siteContent` JSONB field in settings, editable via the ERP. This includes promo bars, brand details, contact info, social links, and POS quick-cash denominations/payment methods.
- **Server-enforced Safety Rails**: API-level validation for item quantities, manual discount percentages (capped per role), preventing UI bypass.
- **Atomic Stock + Parent Writes**: Operations mutating the immutable stock ledger and parent records (e.g., POS sale) run within single PostgreSQL transactions, ensuring data consistency.
- **CMS Form Editor**: The Website Content page in ERP provides a tabbed form interface for easier content management, including list editors for FAQs, how-it-works, and why-us sections, with an advanced JSON tab for power users.
- **Customer Storefront Accounts**: E-commerce website includes a full customer account system with phone-based login, profile management, address book, wishlist, and online order placement (COD/UPI/BANK payment modes), integrating with the ERP's `invoices` table.
- **Type System**: The entire monorepo maintains `typecheck:0` status for comprehensive type safety.

## External Dependencies

- **PostgreSQL**: Primary database.
- **Drizzle ORM**: For database interactions.
- **JWT**: For authentication and authorization.
- **shadcn/ui**: UI component library.
- **wouter**: Routing library.
- **@tanstack/react-query**: For data fetching and state management.
- **recharts**: For data visualization.
- **jspdf / jspdf-autotable**: For PDF generation.
- **lucide-react**: Icon library.