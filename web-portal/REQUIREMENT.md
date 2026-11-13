# RLJIT Arcade Web Portal — Dependency Architecture & Technical Requirements

> **Platform:** Web Desktop & Responsive Browser Portal  
> **Framework:** React 18 + Vite + Tailwind CSS  
> **Security Model:** Strict Institutional RBAC (Hierarchical Role-Based Access Control)  
> **Backend Integration:** RESTful Node.js/Express with Argon2id + AES-256-GCM + HMAC-SHA256 Blind Indexing  

---

## 1. Production Dependencies (`dependencies`)

| Package Name | Exact Version in `package.json` | Architectural Category | Primary Purpose & Module Requirement |
| :--- | :--- | :--- | :--- |
| **`axios`** | `^1.7.9` | Network & API Client | Central HTTP client powering `src/config/api.js`. Configured with request/response interceptors to attach `Authorization: Bearer <token>`, handle dynamic base URLs, enforce request timeouts (15s), and handle automated session revocation on `401 Unauthorized` responses. |
| **`react`** | `^18.3.1` | Core Framework | Declarative UI framework providing the component model, reactive state primitives (`useState`, `useEffect`, `useContext`), and fiber reconciler. |
| **`react-dom`** | `^18.3.1` | DOM Renderer | Provides DOM-specific rendering methods (`createRoot`) to mount the React application tree into the HTML document root (`index.html`). |
| **`react-router-dom`** | `^6.28.2` | Client-Side Routing & RBAC | Provides declarative client-side routing (`BrowserRouter`, `Routes`, `Route`, `Navigate`, `useNavigate`, `useLocation`). Essential for enforcing role-specific URL routes matching the backend contract (`/login`, `/unauthorized`, `/portal/super-admin/mastermind-home`, `/portal/hod-admin/:dept/home`, `/portal/admin/:sec/home`, `/portal/faculty/home`, `/portal/student/home`). |
| **`lucide-react`** | `^0.475.0` | Iconography System | Institutional SVG icon library with clean 1.75px–2px stroke weight. Matches the visual DNA of the reference design for security badges, institutional locks, masked field toggles, network status, database disk receipts, and navigation arrows. |
| **`clsx`** | `^2.1.1` | Class Utility | High-performance utility for conditionally constructing `className` strings based on component states (e.g., active, loading, disabled, error). |
| **`tailwind-merge`** | `^3.7.0` | Class Conflict Resolver | Safely merges Tailwind CSS classes in JS without CSS specificity conflicts, allowing reusable primitive components to override base utility classes. |
| **`date-fns`** | `^4.4.0` | Date & Timestamp Formatting | Immutable, lightweight date utility library. Formats PostgreSQL ISO-8601 audit timestamps (`lastLoginAt`, `created_at`, session timestamps) into user-friendly localized strings without timezone skew. |
| **`framer-motion`** | `^14.13.0` | Motion & Micro-Interactions | Hardware-accelerated motion engine for smooth layout transitions, modal fade-ins, error banner expansions, and tab transitions without layout thrashing. |

---

## 2. Development Dependencies (`devDependencies`)

| Package Name | Exact Version in `package.json` | Tooling Role | Architectural Justification |
| :--- | :--- | :--- | :--- |
| **`vite`** | `^6.1.0` | Build Tool & Bundler | Next-generation frontend tooling providing lightning-fast ESM-based Hot Module Replacement (HMR) during development and Rollup-optimized tree-shaken static production builds (`vite build`). |
| **`@vitejs/plugin-react`** | `^4.3.4` | Vite Plugin | Official Vite plugin providing Fast Refresh for React components using Babel/esbuild transform pipelines. |
| **`tailwindcss`** | `^3.4.17` | Utility-First CSS Engine | Generates a minimal, zero-runtime CSS bundle based on utility classes defined in templates. Enforces the strict institutional design tokens (warm gray canvas, white surface cards, obsidian dark accents, burnt orange primary). |
| **`postcss`** | `^8.5.1` | CSS Transformation Pipeline | Underlying CSS parser and processor powering Tailwind CSS and Autoprefixer pipelines. |
| **`autoprefixer`** | `^10.4.20` | CSS Vendor Prefixing | Automatically parses CSS and applies vendor prefixes based on target browser compatibility lists (`Can I Use`). |

---

## 3. Dependency Integrity & Maintenance Governance

1. **Zero Uninstallation Policy:** Under no circumstances should any package be uninstalled or removed from `package.json`. All listed packages are required for current auth verification and scheduled portal modules.
2. **Deterministic Locking:** All installations must strictly adhere to the defined versions to ensure reproducible builds across different development and deployment environments.
3. **Tree-Shaking Enforcement:** Production builds bundle only referenced exports from heavy libraries (`lucide-react`, `date-fns`), keeping initial JavaScript bundle payloads under 450 kB.

